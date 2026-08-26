import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  asFiniteNumber,
  sanitizeOutdoorTempC,
  sha256Hex,
} from "./lib/helpers";

const http = httpRouter();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("Authorization") ?? request.headers.get("X-Device-Token");
  if (!header) {
    return undefined;
  }
  return header.replace(/^Bearer\s+/i, "").trim() || undefined;
}

type IngestBody = {
  token?: unknown;
  slug?: unknown;
  room_temp?: unknown;
  current_temperature?: unknown;
  target_temp?: unknown;
  target_temperature?: unknown;
  outdoor_temp?: unknown;
  supply_air_temp?: unknown;
  sat?: unknown;
  compressor_hz?: unknown;
  compressor_frequency?: unknown;
  input_power?: unknown;
  energy_kwh?: unknown;
  mode?: unknown;
  fan_mode?: unknown;
  hvac_action?: unknown;
  action?: unknown;
  vertical_vane?: unknown;
  horizontal_vane?: unknown;
};

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json({ ok: true })),
});

http.route({
  path: "/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: IngestBody;
    try {
      // ESPHome snprintf emits nan/inf for missing sensors, which is not JSON.
      const raw = await request.text();
      const sanitized = raw
        .replace(/-?nan/gi, "null")
        .replace(/-?inf/gi, "null");
      body = JSON.parse(sanitized) as IngestBody;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const token =
      bearerToken(request) ??
      (typeof body.token === "string" ? body.token : undefined);
    if (!token) {
      return json({ error: "Missing device token" }, 401);
    }

    const tokenHash = await sha256Hex(token);
    const outdoorTempC = sanitizeOutdoorTempC(
      asFiniteNumber(body.outdoor_temp),
    );

    try {
      const result = await ctx.runMutation(internal.units.applyReportedState, {
        tokenHash,
        slug: typeof body.slug === "string" ? body.slug : undefined,
        roomTempC: asFiniteNumber(body.room_temp ?? body.current_temperature),
        targetTempC: asFiniteNumber(body.target_temp ?? body.target_temperature),
        outdoorTempC,
        supplyAirTempC: asFiniteNumber(body.supply_air_temp ?? body.sat),
        compressorHz: asFiniteNumber(
          body.compressor_hz ?? body.compressor_frequency,
        ),
        inputPowerW: asFiniteNumber(body.input_power),
        energyKwh: asFiniteNumber(body.energy_kwh),
        mode: typeof body.mode === "string" ? body.mode : undefined,
        fanMode: typeof body.fan_mode === "string" ? body.fan_mode : undefined,
        hvacAction:
          typeof body.hvac_action === "string"
            ? body.hvac_action
            : typeof body.action === "string"
              ? body.action
              : undefined,
        verticalVane:
          typeof body.vertical_vane === "string" ? body.vertical_vane : undefined,
        horizontalVane:
          typeof body.horizontal_vane === "string"
            ? body.horizontal_vane
            : undefined,
      });
      return json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ingest failed";
      const status = message.includes("Unknown") ? 401 : 400;
      return json({ error: message }, status);
    }
  }),
});

http.route({
  path: "/commands",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request);
    if (!token) {
      return json({ error: "Missing device token" }, 401);
    }
    try {
      const result = await ctx.runMutation(internal.commands.claimQueued, {
        tokenHash: await sha256Hex(token),
      });
      return json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command poll failed";
      const status = message.includes("Unknown") ? 401 : 400;
      return json({ error: message }, status);
    }
  }),
});

export default http;
