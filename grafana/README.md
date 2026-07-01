# Grafana — Sauna stats

Visualizes the stats the backend writes to InfluxDB (see `backend/influx.js`).
Measurement `sauna`, tag `device`, fields `current_temp`, `set_temp`,
`power_flag`, `pre_time_flag`.

## Prerequisites

1. Backend configured with `INFLUX_*` (see `backend/.env.example`) and writing
   points — confirm with `GET /health` returning `"logging":"influx"`.
2. A Grafana **InfluxDB datasource in Flux query language** pointed at the same
   org/bucket:
   - URL: your InfluxDB 2.x URL (e.g. `http://influx:8086`)
   - Query language: **Flux**
   - Organization, Token, Default bucket: `sauna`

## Import the dashboard

1. Grafana → Dashboards → **New → Import**.
2. Upload `sauna-dashboard.json` (or paste its contents).
3. When prompted for **InfluxDB**, pick your Flux datasource. Click Import.

The dashboard has two hidden constants you can edit under Dashboard settings →
Variables if your naming differs:

- `bucket` (default `sauna`) — must match `INFLUX_BUCKET`
- `device` (default `clearlight`) — must match `INFLUX_DEVICE`
- `target_temp` (default `120`) — **editable textbox at the top of the dashboard**;
  type any target °F to re-estimate the heat-up time.

## Panels

- **Current Temp / Set Temp / Heating / Pre-Heat Armed** — at-a-glance state.
- **Heat-up Curve** — `current_temp` (solid) vs `set_temp` (dashed). Read
  time-to-temp directly: from where the curve starts rising to where it meets
  the target line.
- **Power & Pre-Heat State** — timeline of `power_flag` / `pre_time_flag`; aligns
  under the curve so you can see exactly when a session started.
- **Heat-up Rate (°F/min)** — first derivative of `current_temp`; how fast it's
  climbing.
- **Est. Time to `${target_temp}`°F** — predicted heat-up time, with the assumed
  start (24h low) and heating rate shown alongside. See below.
- **Last Session → `${target_temp}`°F (actual heating)** — the measured time from
  when heating actually engaged to reaching the target, for the most recent
  session in the last 24h. Excludes any pre-heat delay (see below).

## Time-to-temp estimate

The "Est. Time to …°F" panel answers "from a cold start, how long to reach the
target?" using:

```
estimate (min) = (target − 24h-low current_temp) ÷ median heating rate
```

- **Start** = the lowest `current_temp` in the last 24h (the cold-start baseline).
- **Rate** = the median per-minute rise of `current_temp` over the last 30 days,
  measured **only while actually heating** — `power_flag` true **and**
  `pre_time_flag` false — keeping rises between 0.2 and 15 °F/min to drop noise
  and cross-session jumps. Both filters matter: idle time drags the rate toward
  zero, and during a pre-heat delay the power is on but the unit isn't heating
  yet (temp is flat), so those samples must be excluded too. Currently ~3.3 °F/min.
- **Target** = the `target_temp` textbox variable — change it to re-estimate.

### Last Session → target (actual heating)

Separately, the **Last Session** panel reports the *measured* time for the most
recent run: from when heating actually engaged (`power_flag` true **and**
`pre_time_flag` cleared) to the first sample at/above the target. This is the
real heating duration with any pre-heat delay stripped out — e.g. a 1-hour
pre-heat that then heats to 120°F in ~32 min shows **32 min** here, not 93.
Assumes one heating ramp in the last 24h.

It's a **linear** estimate: it assumes a steady climb. Real heating slows as it
nears the element's ceiling, so very high targets read optimistically — and if
the target is hotter than the sauna has ever reached in the data, the rate is
extrapolated and less trustworthy. Treat it as a ballpark; the **Heat-up Curve**
remains the ground truth. The rate window (30d) and the 0.3 °F/min threshold are
in the panel's Flux if you want to tune them.

## Optional: time-to-temp as a single number

The curve makes time-to-temp visible. For a numeric readout over the selected
range, add a **Table** (or Stat) panel with this Flux query. Assumptions: the
range contains exactly one heat-up — at least one power-on and one moment where
`current_temp >= set_temp`. If those aren't present the panel will error; widen
or narrow the time range to a single session.

```flux
import "array"

data = from(bucket: "sauna")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "sauna" and r.device == "clearlight")

powerOn = data
  |> filter(fn: (r) => r._field == "power_flag" and r._value == true)
  |> first()
  |> findColumn(fn: (key) => true, column: "_time")

reached = data
  |> filter(fn: (r) => r._field == "current_temp" or r._field == "set_temp")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => r.current_temp >= r.set_temp)
  |> first()
  |> findColumn(fn: (key) => true, column: "_time")

array.from(rows: [{
  _time: now(),
  minutes_to_temp: float(v: int(v: reached[0]) - int(v: powerOn[0])) / 60000000000.0
}])
```
