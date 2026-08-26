import { v } from "convex/values";

export const climateModeValidator = v.union(
  v.literal("off"),
  v.literal("auto"),
  v.literal("cool"),
  v.literal("heat"),
  v.literal("dry"),
  v.literal("fan_only"),
  v.literal("heat_cool"),
);

export const fanModeValidator = v.union(
  v.literal("auto"),
  v.literal("quiet"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const hvacActionValidator = v.union(
  v.literal("off"),
  v.literal("idle"),
  v.literal("cooling"),
  v.literal("heating"),
  v.literal("drying"),
  v.literal("fan"),
  v.literal("defrost"),
  v.literal("preheat"),
);

export const commandStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("acked"),
);

export const temperatureUnitValidator = v.union(
  v.literal("C"),
  v.literal("F"),
);

export const mapZoneValidator = v.union(
  v.literal("ms-1-1"),
  v.literal("ms-1-2"),
  v.literal("ms-2-1"),
  v.literal("ms-2-2"),
  v.literal("ms-3-1"),
  v.literal("ms-3-2"),
  v.literal("ms-4-1"),
  v.literal("ms-4-2"),
);

export const unitPublicValidator = v.object({
  _id: v.id("units"),
  _creationTime: v.number(),
  slug: v.string(),
  name: v.string(),
  room: v.string(),
  mapZone: v.optional(mapZoneValidator),
  online: v.boolean(),
  lastSeenAt: v.optional(v.number()),
  lastReadingAt: v.optional(v.number()),
  mode: climateModeValidator,
  fanMode: fanModeValidator,
  hvacAction: hvacActionValidator,
  roomTempC: v.optional(v.number()),
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
  pendingCommandCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const readingValidator = v.object({
  _id: v.id("readings"),
  ts: v.number(),
  roomTempC: v.optional(v.number()),
  targetTempC: v.optional(v.number()),
  outdoorTempC: v.optional(v.number()),
  supplyAirTempC: v.optional(v.number()),
  compressorHz: v.optional(v.number()),
  inputPowerW: v.optional(v.number()),
  mode: climateModeValidator,
  hvacAction: hvacActionValidator,
});

export const siteValidator = v.object({
  homeName: v.string(),
  temperatureUnit: temperatureUnitValidator,
  outdoorTempC: v.optional(v.number()),
  outdoorUpdatedAt: v.optional(v.number()),
});
