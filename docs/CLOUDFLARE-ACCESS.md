# Cloudflare Access + the sauna app

## The problem this solves

The app used to be split across two origins, each protected by its own Access
application:

| | `sauna.example.com` | `sauna-api.example.com` |
|---|---|---|
| Serves | SvelteKit frontend | Express backend |
| Access session | its own cookie | a **separate** cookie |
| Recovers on expiry | yes, on navigation | no |

Two cookies means two independently expiring sessions. When the **API** session
lapsed first, the page stayed loaded and authenticated, so nothing triggered a
navigation that Access could redirect. Meanwhile:

- the Socket.IO WebSocket upgrade got a `302` to the login page, and the
  WebSocket API cannot follow redirects — it just failed;
- `fetch()` followed the redirect to `cloudflareaccess.com`, which sends no CORS
  headers for our origin, so it surfaced as an indistinguishable network error.

Neither can complete a login. **Only a top-level navigation can** — and an
installed PWA has no address bar, so once it did land on `cloudflareaccess.com`
there was no way back to the app.

## The fix: one origin

The frontend now defaults to **same-origin**. `frontend/.env` leaves
`VITE_SOCKET_HOST` empty, and nginx routes both the API and the socket under the
app's own hostname. One hostname means one Access cookie and one session, expiry
lands on a document navigation that Access can redirect and return via its
`redirect_url`, and CORS drops out of the picture entirely.

`sauna-api.example.com` still works and is still Access-protected — it stays
available for automation and other consumers. It is simply no longer what the
browser app uses.

### nginx — add to the `sauna.example.com` server block

```nginx
# Socket.IO — needs the upgrade headers and a long timeout for idle sockets.
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 7d;
    proxy_send_timeout 7d;
}

# REST API — the trailing slash on proxy_pass strips the /api prefix, so
# /api/health reaches the backend as /health.
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Order matters: both blocks must come before any `location /` that hands
everything to the frontend.

Apply with `sudo nginx -t && sudo systemctl reload nginx`.

### The Cloudflare tunnel must point at nginx, not at the frontend

Same-origin only works if the request actually reaches nginx. The tunnel on the
Pi originally sent `sauna.example.com` straight to the SvelteKit frontend:

```yaml
  - hostname: sauna.example.com
    service: http://localhost:8099      # WRONG: bypasses nginx entirely
```

That was fine while the browser called the API cross-origin at
`sauna-api.example.com` (the tunnel maps that hostname to `:3000`). Once the API
moved to `/api/` and `/socket.io/` on the main hostname, those paths existed
only in nginx — so Cloudflare traffic hit the frontend, which answered its
SvelteKit **404**, and the socket never connected. The page still loaded, which
is what makes it confusing: only the API and socket are missing.

The tunnel must target nginx instead:

```yaml
  - hostname: sauna.example.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true
      originServerName: sauna.example.com
```

Port 80 is not an option — the vhost there answers `301` to https, so a tunnel
pointed at it loops.

Restarting `cloudflared` interrupts **every** hostname on that tunnel, and this
Pi also runs pool control. Check `cloudflared tunnel ingress validate` and review
the whole ingress list before restarting.

**This is the failure the LAN shortcut hides.** A curl from a machine whose
`/etc/hosts` pins the hostname to `192.0.2.10` goes to nginx and returns `200`,
so the routing looks correct while every real client through Cloudflare gets
`404`. Verifying same-origin routing means testing the public path:

```bash
curl -s -o /dev/null -w '%{http_code}\n' --resolve "sauna.example.com:443:$(dig +short A sauna.example.com @1.1.1.1 | head -1)" \
  "https://sauna.example.com/socket.io/?EIO=4&transport=polling"
```

A `302` means Access is challenging (expected when unauthenticated). A **`404`
means the tunnel is bypassing nginx** — the bug above.

The resolver is pinned to `@1.1.1.1` deliberately. Internal DNS here is
split-horizon and answers with the LAN address, so a plain `dig` sends the test
straight to nginx and it passes while the public path is still broken — the same
trap as the `/etc/hosts` entries below.

### Verify

```bash
curl -s https://sauna.example.com/api/health   # backend JSON
curl -s https://sauna.example.com/health       # frontend JSON
curl -s "https://sauna.example.com/socket.io/?EIO=4&transport=polling"   # 0{"sid":...}
```

The two `/health` responses carry `version` and `commit` (see
[DEPLOY.md](../DEPLOY.md)); matching commits confirm both halves are on the same
build.

### Switch the frontend over

`frontend/.env` on the deploy host must have `VITE_SOCKET_HOST` **empty**, then
rebuild — the value is compiled into the bundle, so editing it without
`pnpm build` changes nothing:

```bash
pnpm build && pm2 restart clearlight-frontend
```

## PWA recovery

Even on one origin a session eventually expires. `frontend/src/lib/reauth.ts`
handles it:

- `accessSessionExpired()` probes `/api/health` with `redirect: 'manual'`. That
  turns an Access `302` into an `opaqueredirect` response, which is readable
  without CORS — following the redirect instead lands on the login page and is
  indistinguishable from the backend being down.
- `reauthenticate()` calls `location.reload()`, the top-level navigation Access
  needs. It is rate-limited to once per 30s so a failing login cannot loop.

The socket's `connect_error` handler runs this probe, so an expired session
recovers on its own instead of leaving a dead app.

## Transport order

`socket.ts` leaves Socket.IO's transport order at its default — polling first,
then a silent upgrade to websocket — and that is load-bearing.

Listing `websocket` first does **not** give a fallback. The client retries the
first transport indefinitely rather than stepping down the array, so anywhere a
websocket upgrade cannot complete the connection fails with `timeout` about
every 21s and never establishes at all. Measured against an edge that accepts
polling but never completes the upgrade:

| transports | result |
|---|---|
| `['websocket','polling']` | `connect_error: timeout` at 21s, 42s, 67s — never connects |
| default (`polling` first) | connects in 27ms on polling, stays on polling |

Where a websocket *is* available the default still upgrades to it (measured:
connect in 15ms, final transport `websocket`), so nothing is given up.

Polling first also makes an expired Access session visible, since the opening
handshake is an XHR that surfaces a real HTTP status rather than an opaque
failed upgrade.

## The service worker

The PWA's service worker interacts with Access in two ways that bit us on the
first same-origin deploy:

**It must not mask an auth challenge with cached content.** Navigation is
network-first with a cache fallback for offline. When Access redirected `/` to
its login page, the old handler treated that as a failure and served the stale
cached shell — which referenced the *previous* build's asset hashes, so the app
booted the old bundle and tried to reach `sauna-api.example.com`, producing a
`/cdn-cgi/access/...` error. It now hands the redirect back to the browser
(`Response.redirect`, since a navigation may not be answered with an
already-redirected response) so the login can actually run, and caches only
non-redirected `ok` responses.

**`/api/` is network-only.** Same-origin means the worker now sees backend
requests it previously skipped as cross-origin.

### The worker must take over immediately

`install` calls `self.skipWaiting()`, and that is not optional. Without it a
newly installed worker sits in **waiting** until every client closes, so
`activate` never runs — and `activate` is what claims clients and posts
`SW_UPDATED`, the only thing that raises the "new version available" banner in
`+layout.svelte`.

A browser tab gets closed eventually, so desktop updates on its own. An
installed PWA does not: it lives in the app switcher and is essentially never
closed, so on iOS the old worker kept serving its cached shell indefinitely, the
app stayed on the previous bundle, and the update was never offered. The
symptom is a phone that behaves like an older release while desktop is fine.

`+layout.svelte` also watches for this directly — it raises the banner if
`registration.waiting` is already set, or if a worker reaches `installed` while
a controller exists — so an update is still offered even if `SW_UPDATED` never
arrives.

### Cache version is stamped automatically

`static/service-worker.js` carries a `__BUILD_VERSION__` placeholder that
`scripts/stamp-sw.mjs` replaces at build time with `<version>-<commit>`. This is
not cosmetic: a browser installs a new worker only when the script's **bytes**
differ. A deploy that ships a byte-identical worker is treated as "no update" —
the old worker stays active, keeps serving its cached shell, and the
"A new version is available" banner in `+layout.svelte` never fires, because that
banner is driven by the `SW_UPDATED` message posted from `activate`.

That is exactly what happened when the cache version was a hand-edited constant
and a deploy forgot to bump it. The stamp runs as part of `pnpm build`, and the
script exits non-zero if the placeholder is missing rather than shipping an
unstamped worker.

## Access settings worth checking

- **Session duration** — a longer session on both apps means fewer expiries.
- **Auto-redirect to identity provider** — skips the "choose a login method"
  screen, which matters most in a PWA.
- Keep the two hostnames in **one Access application** (they share one AUD) so policy changes stay in step.

## Note for LAN clients

`/etc/hosts` entries pointing `sauna.example.com` / `sauna-api.example.com` at
`192.0.2.10` bypass Cloudflare completely — the request goes straight to nginx on
the LAN and **Access never runs**. That is convenient for local troubleshooting,
but it means a LAN client is not exercising Zero Trust at all. When testing
Access, force the public path:

```bash
curl -sI --resolve "sauna.example.com:443:$(dig +short A sauna.example.com @1.1.1.1 | head -1)" \
  https://sauna.example.com/
# expect: 302 -> <your-team>.cloudflareaccess.com, server: cloudflare, cf-ray: ...
```
