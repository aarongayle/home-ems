import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  climateModeValidator,
  fanModeValidator,
  hvacActionValidator,
  commandStatusValidator,
  mapZoneValidator,
  temperatureUnitValidator,
} from "./lib/validators";

export default defineSchema({
  sessions: defineTable({
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  loginAttempts: defineTable({
    key: v.string(),
    failedAt: v.array(v.number()),
  }).index("by_key", ["key"]),

  settings: defineTable({
    key: v.literal("site"),
    homeName: v.string(),
    temperatureUnit: temperatureUnitValidator,
    outdoorTempC: v.optional(v.number()),
    outdoorUpdatedAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  units: defineTable({
    slug: v.string(),
    name: v.string(),
    room: v.string(),
    mapZone: v.optional(mapZoneValidator),
    deviceTokenHash: v.string(),
    online: v.boolean(),
    lastSeenAt: v.optional(v.number()),
    lastReadingAt: v.optional(v.number()),
    mode: climateModeValidator,
    fanMode: fanModeValidator,
    hvacAction: hvacActionValidator,
    roomTempC: v.optional(v.number()),
    internalTempC: v.optional(v.number()),
    remoteTempC: v.optional(v.number()),
    remoteTempAt: v.optional(v.number()),
    targetTempC: v.optional(v.number()),
    outdoorTempC: v.optional(v.number()),
    supplyAirTempC: v.optional(v.number()),
    compressorHz: v.optional(v.number()),
    inputPowerW: v.optional(v.number()),
    energyKwh: v.optional(v.number()),
    verticalVane: v.optional(v.string()),
    horizontalVane: v.optional(v.string()),
    minTempC: v.number(),
    maxTempC: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_token_hash", ["deviceTokenHash"])
    .index("by_name", ["name"])
    .index("by_map_zone", ["mapZone"]),

  readings: defineTable({
    unitId: v.id("units"),
    ts: v.number(),
    roomTempC: v.optional(v.number()),
    targetTempC: v.optional(v.number()),
    outdoorTempC: v.optional(v.number()),
    supplyAirTempC: v.optional(v.number()),
    compressorHz: v.optional(v.number()),
    inputPowerW: v.optional(v.number()),
    mode: climateModeValidator,
    hvacAction: hvacActionValidator,
  })
    .index("by_unit_and_ts", ["unitId", "ts"])
    .index("by_ts", ["ts"]),

  // One compact document per unit per UTC day. Completed days are immutable;
  // today's document is patched as samples arrive and must not be read by the
  // frozen history subscription.
  readingDays: defineTable({
    unitId: v.id("units"),
    dayStartTs: v.number(),
    points: v.array(
      v.object({
        ts: v.number(),
        roomTempC: v.optional(v.number()),
        targetTempC: v.optional(v.number()),
        outdoorTempC: v.optional(v.number()),
        supplyAirTempC: v.optional(v.number()),
        compressorHz: v.optional(v.number()),
        inputPowerW: v.optional(v.number()),
        mode: climateModeValidator,
        hvacAction: hvacActionValidator,
      }),
    ),
  })
    .index("by_unit_and_day", ["unitId", "dayStartTs"])
    .index("by_day", ["dayStartTs"]),

  commands: defineTable({
    unitId: v.id("units"),
    status: commandStatusValidator,
    mode: v.optional(climateModeValidator),
    targetTempC: v.optional(v.number()),
    fanMode: v.optional(fanModeValidator),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_unit_and_status", ["unitId", "status"])
    .index("by_status", ["status"]),

  remoteSensors: defineTable({
    slug: v.string(),
    name: v.string(),
    unitId: v.id("units"),
    deviceTokenHash: v.string(),
    online: v.boolean(),
    lastSeenAt: v.optional(v.number()),
    tempC: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_token_hash", ["deviceTokenHash"])
    .index("by_unit", ["unitId"]),
});
