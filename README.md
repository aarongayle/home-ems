# Home EMS

Household dashboard for Mitsubishi mini splits on ESP32 (CN105 / ESPHome). Live zone temperatures and setpoints, plus stored trends for room and outdoor air.

ESP32 firmware: [echavet/MitsubishiCN105ESPHome](https://github.com/echavet/MitsubishiCN105ESPHome)

## Architecture

- **Dashboard** — Vite + React. Each zone card shows room temp, setpoint, mode, and fan. Charts read historical samples.
- **Convex** — live unit state, command queue, and time-series readings. ESP32s talk to HTTP endpoints on `*.convex.site`.
- **ESPHome** — CN105 UART to the indoor unit. Posts telemetry every 20s and polls for commands. The on-device web UI still works if the internet is down.

Temperatures are stored in Celsius. The dashboard can display °F.

## Development

```bash
pnpm install
pnpm dev:backend    # npx convex dev — use this, not convex deploy
pnpm dev             # Vite on http://localhost:5173
```

Copy the printed Convex URL into `.env.local`:

```
VITE_CONVEX_URL=https://YOUR_DEPLOYMENT.convex.cloud
HOUSEHOLD_PASSWORD=your-house-word
```

`HOUSEHOLD_PASSWORD` belongs in `.env.local` without a `VITE_` prefix. Vite never sends it to the browser; `pnpm dev:backend` copies it onto the Convex deployment, which is what actually locks the API. If it is unset on Convex, the dashboard is open to anyone who has the deployment URL.

Guests can skip the form with a fridge QR or bookmark:

```
https://YOUR_DOMAIN/#unlock=your-house-word
https://YOUR_DOMAIN/unlock/your-house-word
```

Prefer the `#unlock=` form so the word is not written to server access logs. After a successful unlock, that device stays signed in for a year. Login attempts are limited to 5 failures per 15 minutes.

## First run

1. Open the app and either **Load demo home** or add real zones in Settings.
2. Creating a unit shows a device token once. Put it in `esphome/unit.example.yaml`.
3. HTTP ingest URL is `https://YOUR_DEPLOYMENT.convex.site/ingest`.
4. Flash ESPHome, plug the ESP32 into CN105, confirm the zone goes online.

Demo units cannot be controlled by a real ESP32. Remove them and create units with fresh tokens before installing hardware.

## ESPHome notes

- Prefer ESP32-S3 over ESP8266 for this firmware.
- UART is 2400 baud; TX/RX pins depend on the board. See the MitsubishiCN105ESPHome README.
- `outside_air_temperature_sensor` is not supported on every outdoor unit. Some report -63.5 °C when idle; Home EMS drops that as invalid.
- Keep `web_server` enabled so you can still change setpoints on the LAN.

## Data

- Latest state lives on each `units` document (realtime).
- A reading is stored at most once per ~45 seconds per unit.
- Samples older than 90 days are pruned.
