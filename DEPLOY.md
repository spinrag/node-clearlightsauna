# Deploy / Redeploy Runbook

Practical steps for getting changes onto a running host. First-time
infrastructure setup (Nginx, SSL, process manager) lives in
[README.md → Production Deployment](README.md#production-deployment); this file
is the **update** flow you run every time you ship.

## Updating a running deployment

Run from the repo root on the deploy host:

```bash
# 1. Pull code AND submodule updates (node-gizwits is a submodule)
git pull --recurse-submodules
# (if you pulled without it: git submodule update --init --recursive)

# 2. Install dependencies — REQUIRED after every pull.
#    New commits may add packages (e.g. @influxdata/influxdb-client); skipping
#    this makes the backend crash at startup with a missing-module error.
pnpm install --frozen-lockfile

# 3. If the submodule changed, refresh its own deps
cd lib/node-gizwits && npm install && cd ../..

# 4. Reconcile environment variables (see "Env changes" below)

# 5. Rebuild the frontend (SvelteKit production build)
pnpm build

# 6. Restart the services (use your process manager — examples below)
```

> **Why `--frozen-lockfile`?** It installs exactly what the committed
> `pnpm-lock.yaml` specifies and fails loudly if `package.json` and the lockfile
> disagree, instead of silently resolving different versions. This is the safe
> choice for deploys.

> **Native module:** `better-sqlite3` compiles on install (it's in
> `onlyBuiltDependencies`). A fresh host needs build tools
> (`build-essential`, `python3`) for that step.

## Env changes

After pulling, **diff your `backend/.env` against `backend/.env.example`** and
add any new keys — new features add new variables, and a missing one usually
just disables that feature silently (or, for required ones, fails at startup):

```bash
# Show keys present in the example but missing from your live .env
comm -23 \
  <(grep -oE '^[A-Z_]+' backend/.env.example | sort -u) \
  <(grep -oE '^[A-Z_]+' backend/.env | sort -u)
```

Recently added keys:

- `API_KEY` — token for `?token=` query-param auth (HTTP automation).
- `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` — enable InfluxDB
  stats logging (all four required; optional `INFLUX_DEVICE`,
  `INFLUX_MEASUREMENT`, `INFLUX_SAMPLE_INTERVAL_MS`). See
  [grafana/README.md](grafana/README.md).

## Restarting the services

The backend (`pnpm start`) and the built frontend
(`PORT=8099 node frontend/build`) should run under a process manager. Examples:

```bash
# systemd
sudo systemctl restart clearlight-backend clearlight-frontend

# pm2
pm2 restart clearlight-backend clearlight-frontend
```

## Verify after deploy

```bash
# Backend is up, device connected, and stats logging status
curl -s http://localhost:3000/health
# => {"status":"ok","device":"connected","logging":"influx","uptime":...}
```

- `logging` is `influx` only when all four `INFLUX_*` vars are set; otherwise `off`.
- If `device` is `disconnected`, check `CLEARLIGHT_IP` and network reachability.
- With InfluxDB configured, points appear in the `sauna` bucket within ~15s; the
  Grafana dashboard (`grafana/sauna-dashboard.json`) should populate.

## Rollback

```bash
git log --oneline -5            # find the previous good commit
git checkout <sha> -- .         # or: git reset --hard <sha> on a deploy branch
pnpm install --frozen-lockfile  # re-sync deps to that commit's lockfile
pnpm build && <restart services>
```
