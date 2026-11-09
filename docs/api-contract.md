# Doude — Data format & API contract (v0.1)

This is the agreement between the **engine** (Python, FastAPI) and the **app** (Next.js). Change it only when both of you agree, and update `contracts/*.json` and `app/lib/types.ts` in the same commit.

Conventions for every file and endpoint:
- Timestamps: ISO 8601, UTC, ending in `Z` (e.g. `2026-11-03T14:00:00Z`).
- Units are in the field name: `_bar`, `_m3s`, `_m`, `_m3`, `_bbl`, `_m2`, `_hours`.
- Coordinates: `[lon, lat]` (GeoJSON order, which Leaflet reverses, so watch out).
- Distances along the pipe: metres from the inlet.

---

## 1. Sensor data file: `data/readings.csv`

Produced by the generator (Day 3). One row per minute, sorted by time, no gaps.

```
timestamp,p_in_bar,p_out_bar,q_in_m3s,q_out_m3s
2026-11-01T00:00:00Z,50.021,37.004,0.10031,0.09987
2026-11-01T00:01:00Z,49.968,37.051,0.09994,0.10012
```

| Column | Type | Meaning |
|---|---|---|
| `timestamp` | string | Reading time (UTC) |
| `p_in_bar` | float, 3 dp | Pressure at inlet sensor |
| `p_out_bar` | float, 3 dp | Pressure at outlet sensor |
| `q_in_m3s` | float, 5 dp | Flow into the pipeline |
| `q_out_m3s` | float, 5 dp | Flow out of the pipeline |

Scenario 01 covers 2026-11-01 00:00 → 2026-11-06 00:00 = **7,201 rows**. After shut-in, both flows are 0 and the pressures settle to static values.

---

## 2. Endpoints

Base URL (local): `http://localhost:8000`. All responses are JSON.

### `GET /health`
```json
{ "status": "ok", "method_version": "doude-method v0.1" }
```

### `GET /scenario`
Returns `scenario.json` **without** the `ground_truth` and `leak` blocks (the app must not see the answers). Used to draw the pipeline and label the charts.

### `GET /readings?step=10`
The sensor data for the charts. `step` = keep every Nth row (default 10, so about 720 points). Shape: `contracts/readings.sample.json`.
```json
{
  "pipeline_id": "BYS-TL-01",
  "step": 10,
  "readings": [
    { "timestamp": "...", "p_in_bar": 50.021, "p_out_bar": 37.004, "q_in_m3s": 0.10031, "q_out_m3s": 0.09987 }
  ]
}
```

### `POST /analyze`
Runs the whole chain (baseline → detect → locate → quantify → impact → report) on `data/readings.csv`. Request body: `{}` for v0.1. Shape: `contracts/analyze_response.sample.json`.

If no leak is found: `detected: false`, and `leak`, `quantification` and `impact` are `null`.

| Field | Meaning |
|---|---|
| `detected` | Whether a leak was found |
| `baseline` | Normal values learned from the data before the alert |
| `leak.detected_at` | First time the alert condition held for the full confirmation window |
| `leak.estimated_start` | Back-calculated start of the deviation |
| `leak.shut_in_at` | When flow dropped to zero (end of release) |
| `leak.location_m` / `location_lonlat` | Estimated breach position |
| `quantification.leak_rate_m3s` | Mean leak rate (mass balance) |
| `quantification.leak_rate_orifice_m3s` | Cross-check from the orifice equation |
| `quantification.volume_m3` / `volume_bbl` | Total released, start → shut-in |
| `quantification.uncertainty_pct` | ± band on volume |
| `impact.polygon_lonlat` | Slick outline for the map (closed ring, first point = last) |
| `report.input_hash` | SHA-256 of the readings file bytes |
| `report.report_hash` | SHA-256 of this response without the `report_hash` field, keys sorted |

### `GET /report.pdf`
The spill report PDF for the last `/analyze` run (Day 10).

---

## 3. Errors
```json
{ "error": "readings_not_found", "message": "data/readings.csv does not exist. Run the generator." }
```
HTTP 4xx/5xx with that shape.
