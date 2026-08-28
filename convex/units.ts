import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { householdMutation, householdQuery } from "./lib/auth";
import {
  exceedsDeadband,
  generateToken,
  parseClimateMode,
  parseFanMode,
  parseHvacAction,
  REMOTE_TEMP_STALE_MS,
  roundHalf,
  SAT_DEADBAND_C,
  sha256Hex,
  slugify,
  toPublicUnit,
} from "./lib/helpers";
import {
  climateModeValidator,
  fanModeValidator,
  mapZoneValidator,
  unitPublicValidator,
} from "./lib/validators";

async function remoteSensorForUnit(
  ctx: QueryCtx | MutationCtx,
  unitId: Id<"units">,
) {
  return await ctx.db
    .query("remoteSensors")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .unique();
}

export const list = householdQuery({
  args: {},
  returns: v.array(unitPublicValidator),
  handler: async (ctx) => {
    const units = await ctx.db.query("units").withIndex("by_name").take(50);
    const result = [];
    for (const unit of units) {
      const pending = await ctx.db
        .query("commands")
        .withIndex("by_unit_and_status", (q) =>
          q.eq("unitId", unit._id).eq("status", "queued"),
        )
        .take(20);
      const remoteSensor = await remoteSensorForUnit(ctx, unit._id);
      result.push(toPublicUnit(unit, pending.length, remoteSensor));
    }
    return result;
  },
});

export const get = householdQuery({
  args: {
    unitId: v.id("units"),
  },
  returns: v.union(unitPublicValidator, v.null()),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      return null;
    }
    const pending = await ctx.db
      .query("commands")
      .withIndex("by_unit_and_status", (q) =>
        q.eq("unitId", unit._id).eq("status", "queued"),
      )
      .take(20);
    const remoteSensor = await remoteSensorForUnit(ctx, unit._id);
    return toPublicUnit(unit, pending.length, remoteSensor);
  },
});

export const create = householdMutation({
  args: {
    name: v.string(),
    room: v.string(),
    slug: v.optional(v.string()),
  },
  returns: v.object({
    unitId: v.id("units"),
    slug: v.string(),
    deviceToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const room = args.room.trim();
    if (!name || !room) {
      throw new Error("Name and room are required");
    }
    const slug = slugify(args.slug?.trim() || name);
    const existing = await ctx.db
      .query("units")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      throw new Error(`A unit with slug "${slug}" already exists`);
    }
    const deviceToken = generateToken();
    const now = Date.now();
    const unitId = await ctx.db.insert("units", {
      slug,
      name,
      room,
      deviceTokenHash: await sha256Hex(deviceToken),
      online: false,
      mode: "off",
      fanMode: "auto",
      hvacAction: "off",
      minTempC: 16,
      maxTempC: 31,
      createdAt: now,
      updatedAt: now,
    });
    return { unitId, slug, deviceToken };
  },
});

export const rename = householdMutation({
  args: {
    unitId: v.id("units"),
    name: v.string(),
    room: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const name = args.name.trim();
    const room = args.room.trim();
    if (!name || !room) {
      throw new Error("Name and room are required");
    }
    await ctx.db.patch("units", args.unitId, {
      name,
      room,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setMapZone = householdMutation({
  args: {
    unitId: v.id("units"),
    mapZone: v.optional(mapZoneValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    if (args.mapZone !== undefined) {
      const occupant = await ctx.db
        .query("units")
        .withIndex("by_map_zone", (q) => q.eq("mapZone", args.mapZone))
        .unique();
      if (occupant && occupant._id !== args.unitId) {
        throw new Error(`${args.mapZone.toUpperCase()} is already assigned`);
      }
    }
    await ctx.db.patch("units", args.unitId, {
      mapZone: args.mapZone,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const rotateToken = householdMutation({
  args: {
    unitId: v.id("units"),
  },
  returns: v.object({
    deviceToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const deviceToken = generateToken();
    await ctx.db.patch("units", args.unitId, {
      deviceTokenHash: await sha256Hex(deviceToken),
      updatedAt: Date.now(),
    });
    return { deviceToken };
  },
});

export const remove = householdMutation({
  args: {
    unitId: v.id("units"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_unit_and_ts", (q) => q.eq("unitId", args.unitId))
      .take(200);
    for (const reading of readings) {
      await ctx.db.delete("readings", reading._id);
    }
    const queued = await ctx.db
      .query("commands")
      .withIndex("by_unit_and_status", (q) =>
        q.eq("unitId", args.unitId).eq("status", "queued"),
      )
      .take(50);
    const sent = await ctx.db
      .query("commands")
      .withIndex("by_unit_and_status", (q) =>
        q.eq("unitId", args.unitId).eq("status", "sent"),
      )
      .take(50);
    for (const command of [...queued, ...sent]) {
      await ctx.db.delete("commands", command._id);
    }
    const remoteSensor = await remoteSensorForUnit(ctx, args.unitId);
    if (remoteSensor) {
      await ctx.db.delete("remoteSensors", remoteSensor._id);
    }
    await ctx.db.delete("units", args.unitId);
    return null;
  },
});

export const setClimate = householdMutation({
  args: {
    unitId: v.id("units"),
    mode: v.optional(climateModeValidator),
    targetTempC: v.optional(v.number()),
    fanMode: v.optional(fanModeValidator),
  },
  returns: v.id("commands"),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    if (
      args.mode === undefined &&
      args.targetTempC === undefined &&
      args.fanMode === undefined
    ) {
      throw new Error("No climate change requested");
    }

    const now = Date.now();
    const patch: {
      mode?: typeof args.mode;
      fanMode?: typeof args.fanMode;
      targetTempC?: number;
      updatedAt: number;
    } = { updatedAt: now };

    if (args.mode !== undefined) {
      patch.mode = args.mode;
    }
    if (args.fanMode !== undefined) {
      patch.fanMode = args.fanMode;
    }
    let targetTempC = args.targetTempC;
    if (targetTempC !== undefined) {
      targetTempC = Math.min(
        unit.maxTempC,
        Math.max(unit.minTempC, roundHalf(targetTempC)),
      );
      patch.targetTempC = targetTempC;
    }

    await ctx.db.patch("units", args.unitId, patch);

    return await ctx.db.insert("commands", {
      unitId: args.unitId,
      status: "queued",
      mode: args.mode,
      targetTempC,
      fanMode: args.fanMode,
      createdAt: now,
    });
  },
});

export const markStaleOffline = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 120_000;
    const units = await ctx.db.query("units").take(50);
    for (const unit of units) {
      if (unit.online && (unit.lastSeenAt === undefined || unit.lastSeenAt < cutoff)) {
        await ctx.db.patch("units", unit._id, {
          online: false,
          hvacAction: "off",
        });
      }
    }
    return null;
  },
});

export const applyReportedState = internalMutation({
  args: {
    tokenHash: v.string(),
    slug: v.optional(v.string()),
    roomTempC: v.optional(v.number()),
    targetTempC: v.optional(v.number()),
    outdoorTempC: v.optional(v.number()),
    supplyAirTempC: v.optional(v.number()),
    compressorHz: v.optional(v.number()),
    inputPowerW: v.optional(v.number()),
    energyKwh: v.optional(v.number()),
    mode: v.optional(v.string()),
    fanMode: v.optional(v.string()),
    hvacAction: v.optional(v.string()),
    verticalVane: v.optional(v.string()),
    horizontalVane: v.optional(v.string()),
  },
  returns: v.object({
    unitId: v.id("units"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const unit = await ctx.db
      .query("units")
      .withIndex("by_token_hash", (q) => q.eq("deviceTokenHash", args.tokenHash))
      .unique();
    if (!unit) {
      throw new Error("Unknown device token");
    }
    // Token is the identity. Ignore slug if present so ESPHome hostname
    // can differ from the dashboard slug (e.g. mil-suite vs mother-in-law-s-suite).

    const now = Date.now();
    const mode = parseClimateMode(args.mode) ?? unit.mode;
    const fanMode = parseFanMode(args.fanMode) ?? unit.fanMode;
    const hvacAction = parseHvacAction(args.hvacAction) ?? unit.hvacAction;

    const reportedPatch: {
      online: boolean;
      lastSeenAt: number;
      updatedAt: number;
      mode: typeof mode;
      fanMode: typeof fanMode;
      hvacAction: typeof hvacAction;
      roomTempC?: number;
      internalTempC?: number;
      targetTempC?: number;
      outdoorTempC?: number;
      supplyAirTempC?: number;
      compressorHz?: number;
      inputPowerW?: number;
      energyKwh?: number;
      verticalVane?: string;
      horizontalVane?: string;
    } = {
      online: true,
      lastSeenAt: now,
      updatedAt: now,
      mode,
      fanMode,
      hvacAction,
    };
    if (args.roomTempC !== undefined) {
      reportedPatch.internalTempC = args.roomTempC;
    }
    const remoteFresh =
      unit.remoteTempC !== undefined &&
      unit.remoteTempAt !== undefined &&
      now - unit.remoteTempAt < REMOTE_TEMP_STALE_MS;
    if (remoteFresh) {
      reportedPatch.roomTempC = unit.remoteTempC;
    } else if (args.roomTempC !== undefined) {
      reportedPatch.roomTempC = args.roomTempC;
    }
    if (args.targetTempC !== undefined) reportedPatch.targetTempC = args.targetTempC;
    if (args.outdoorTempC !== undefined) reportedPatch.outdoorTempC = args.outdoorTempC;
    const supplyAirTempC = exceedsDeadband(
      args.supplyAirTempC,
      unit.supplyAirTempC,
      SAT_DEADBAND_C,
    )
      ? args.supplyAirTempC
      : unit.supplyAirTempC;
    if (
      supplyAirTempC !== undefined &&
      supplyAirTempC !== unit.supplyAirTempC
    ) {
      reportedPatch.supplyAirTempC = supplyAirTempC;
    }
    if (args.compressorHz !== undefined) reportedPatch.compressorHz = args.compressorHz;
    if (args.inputPowerW !== undefined) reportedPatch.inputPowerW = args.inputPowerW;
    if (args.energyKwh !== undefined) reportedPatch.energyKwh = args.energyKwh;
    if (args.verticalVane !== undefined) reportedPatch.verticalVane = args.verticalVane;
    if (args.horizontalVane !== undefined) {
      reportedPatch.horizontalVane = args.horizontalVane;
    }

    await ctx.db.patch("units", unit._id, reportedPatch);

    const shouldSample =
      unit.lastReadingAt === undefined || now - unit.lastReadingAt >= 45_000;
    if (shouldSample) {
      await ctx.db.insert("readings", {
        unitId: unit._id,
        ts: now,
        roomTempC: remoteFresh ? unit.remoteTempC : args.roomTempC,
        targetTempC: args.targetTempC ?? unit.targetTempC,
        outdoorTempC: args.outdoorTempC,
        supplyAirTempC,
        compressorHz: args.compressorHz,
        inputPowerW: args.inputPowerW,
        mode,
        hvacAction,
      });
      await ctx.db.patch("units", unit._id, { lastReadingAt: now });
    }

    if (args.outdoorTempC !== undefined) {
      const site = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "site"))
        .unique();
      if (site) {
        await ctx.db.patch("settings", site._id, {
          outdoorTempC: args.outdoorTempC,
          outdoorUpdatedAt: now,
        });
      } else {
        await ctx.db.insert("settings", {
          key: "site",
          homeName: "Home",
          temperatureUnit: "F",
          outdoorTempC: args.outdoorTempC,
          outdoorUpdatedAt: now,
        });
      }
    }

    return { unitId: unit._id, slug: unit.slug };
  },
});
