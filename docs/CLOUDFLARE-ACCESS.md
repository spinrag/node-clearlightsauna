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

Socket.IO also keeps `polling` as a fallback transport: a blocked WebSocket
upgrade fails opaquely, whereas the polling handshake is an XHR that surfaces a
usable error.

## Access settings worth checking

- **Session duration** — a longer session on both apps means fewer expiries.
- **Auto-redirect to identity provider** — skips the "choose a login method"
  screen, which matters most in a PWA.
- Keep the two hostnames in **one Access application** (they already share AUD
  `REDACTED-ACCESS-AUD…`) so policy changes stay in step.

## Note for LAN clients

`/etc/hosts` entries pointing `sauna.example.com` / `sauna-api.example.com` at
`192.0.2.10` bypass Cloudflare completely — the request goes straight to nginx on
the LAN and **Access never runs**. That is convenient for local troubleshooting,
but it means a LAN client is not exercising Zero Trust at all. When testing
Access, force the public path:

```bash
curl -sI --resolve sauna.example.com:443:203.0.113.10 https://sauna.example.com/
# expect: 302 -> your-team.cloudflareaccess.com, server: cloudflare, cf-ray: ...
```
