# Prompt: WebSocket fails behind Cloudflare Tunnel + Access

A portable prompt to hand to a coding agent when an app behind Cloudflare loads
in the browser but its WebSocket never connects. Written from the incident
documented in [CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md), generalised with
placeholders so it applies to any project.

Copy everything below the line.

---

A web app behind Cloudflare (Tunnel + Access) loads in the browser, but its
Socket.IO/WebSocket connection never establishes. It works from the LAN and
fails through Cloudflare. Diagnose and fix it.

Fill in: APP_HOST=<app.example.com>, ORIGIN=<origin host/IP>,
proxy port (usually nginx :443), app server port, backend port.

## Read this first — three ways this investigation goes wrong

1. TESTING FROM THE LAN LIES. If /etc/hosts pins APP_HOST to the origin, or
   internal DNS is split-horizon, curl goes straight to the reverse proxy and
   NEVER TOUCHES CLOUDFLARE. It returns 200 while every real client gets an
   error. Always force the public path and confirm a `cf-ray` response header
   is present. Resolve with a PUBLIC resolver — a plain `dig` may return the
   internal address:
     CF=$(dig +short A APP_HOST @1.1.1.1 | head -1)
     curl -sI --resolve "APP_HOST:443:$CF" "https://APP_HOST/socket.io/?EIO=4&transport=polling"
   No cf-ray means you tested the wrong path and the result is meaningless.

2. YOU MAY BE DEBUGGING STALE CLIENT CODE. If it's an installed PWA and the
   service worker lacks self.skipWaiting(), a new worker sits in "waiting"
   until every client closes — which never happens for a PWA in the app
   switcher. Desktop updates, phone doesn't. Confirm the client is running the
   build you think it is before drawing any conclusion from its behaviour.

3. DON'T GUESS FROM SYMPTOMS. Get the actual HTTP status of the socket path
   through the real edge. It identifies the cause outright.

## Diagnostic — status of /socket.io/ through Cloudflare

- 404  → THE MOST LIKELY CAUSE. The tunnel's ingress points at the app server
         directly, bypassing the reverse proxy. Any /api/ and /socket.io/
         location blocks live only in the proxy, so Cloudflare traffic never
         sees them and the app server returns its own 404. The page still
         loads, which is why this reads as a "connection problem".
         Confirm by comparing the same path against each origin:
           curl via proxy (LAN)            -> expect 200
           curl direct to app server port  -> expect 404   <- matches Cloudflare
         Then read the ingress: /etc/cloudflared/config.yml
- 302  → Access is challenging. Expected when unauthenticated. Re-test with a
         valid session before concluding anything.
- 200  → Reaching the origin fine; the fault is client-side. Go to the
         transport-order check below.

## Fix for the 404 case

Point the tunnel at the reverse proxy instead of the app server:

  - hostname: APP_HOST
    service: https://localhost:443
    originRequest:
      originServerName: APP_HOST
      noTLSVerify: true

Do NOT target port 80 if that vhost redirects to https — the tunnel will loop.
Verify the proxy handles the upgrade (expect `101 Switching Protocols`) and
that its /socket.io/ block sets `proxy_http_version 1.1`, `Upgrade`/`Connection`
headers, and a long `proxy_read_timeout`.

WARNING: restarting cloudflared drops EVERY hostname on that tunnel. List the
full ingress first (`cloudflared tunnel ingress validate`) and check whether
unrelated services share it before restarting.

## Also check — client transport order

If socket.io-client sets `transports: ['websocket', 'polling']`, remove it.
That is NOT a fallback: the client retries the FIRST transport indefinitely
rather than stepping down the array, so wherever a websocket upgrade cannot
complete it fails with `timeout` about every 21s and never connects. The
default (polling first, then a silent upgrade) connects immediately and
degrades to plain polling when websockets are unavailable.

## Also check — one Access session, not two

If the frontend and API are on separate hostnames, each has its own Access
cookie expiring independently. When the API's lapses first, the page stays
loaded while XHR and WebSocket get redirects they cannot follow, and only a
top-level navigation can complete an Access login — which an installed PWA
cannot trigger on its own. Serving the API same-origin behind the same proxy
avoids this entirely.

## Done when

Through the public path (cf-ray present), authenticated:
  /                                    -> 200
  /api/health                          -> 200 (or your API route)
  /socket.io/?EIO=4&transport=polling  -> 200, body starts `0{"sid":`
and the browser's Network -> WS panel shows a live websocket.
