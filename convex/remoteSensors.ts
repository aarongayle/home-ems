import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { householdMutation } from "./lib/auth";
import {
  clampRemoteTempC,
  generateToken,
  REMOTE_TEMP_MAX_C,
  REMOTE_TEMP_MIN_C,
  REMOTE_TEMP_STALE_MS,
  sha256Hex,
} from "./lib/helpers";

export const create = householdMutation({
  args: {
    unitId: v.id("units"),
    name: v.optional(v.string()),
  },
  returns: v.object({
    sensorId: v.id("remoteSensors"),
    slug: v.string(),
    name: v.string(),
    deviceToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const existing = await ctx.db
      .query("remoteSensors")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .unique();
    if (existing) {
      throw new Error("This unit already has a remote room sensor");
    }

    const slug = `${unit.slug}-room`;
    const slugTaken = await ctx.db
      .query("remoteSensors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (slugTaken) {
      throw new Error(`A sensor with slug "${slug}" already exists`);
    }

    const name = args.name?.trim() || `${unit.name} room`;
    const deviceToken = generateToken();
    const now = Date.now();
    const sensorId = await ctx.db.insert("remoteSensors", {
      slug,
      name,
      unitId: unit._id,
      deviceTokenHash: await sha256Hex(deviceToken),
      online: false,
      createdAt: now,
      updatedAt: now,
    });
    return { sensorId, slug, name, deviceToken };
  },
});

export const rotateToken = householdMutation({
  args: {
    sensorId: v.id("remoteSensors"),
  },
  returns: v.object({
    deviceToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const sensor = await ctx.db.get("remoteSensors", args.sensorId);
    if (!sensor) {
      throw new Error("Remote sensor not found");
    }
    const deviceToken = generateToken();
    await ctx.db.patch("remoteSensors", args.sensorId, {
      deviceTokenHash: await sha256Hex(deviceToken),
      updatedAt: Date.now(),
    });
    return { deviceToken };
  },
});

export const issueToken = internalMutation({
  args: {
    slug: v.string(),
  },
  returns: v.object({
    deviceToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("remoteSensors")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!sensor) {
      throw new Error("Remote sensor not found");
    }
    const deviceToken = generateToken();
    await ctx.db.patch("remoteSensors", sensor._id, {
      deviceTokenHash: await sha256Hex(deviceToken),
      updatedAt: Date.now(),
    });
    return { deviceToken };
  },
});

export const remove = householdMutation({
  args: {
    sensorId: v.id("remoteSensors"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sensor = await ctx.db.get("remoteSensors", args.sensorId);
    if (!sensor) {
      throw new Error("Remote sensor not found");
    }
    const unit = await ctx.db.get("units", sensor.unitId);
    const now = Date.now();
    if (unit) {
      await ctx.db.patch("units", unit._id, {
        remoteTempC: undefined,
        remoteTempAt: undefined,
        roomTempC: unit.internalTempC,
        updatedAt: now,
      });
    }
    await ctx.db.delete("remoteSensors", args.sensorId);
    return null;
  },
});

export const applyReading = internalMutation({
  args: {
    tokenHash: v.string(),
    roomTempC: v.number(),
  },
  returns: v.object({
    sensorId: v.id("remoteSensors"),
    unitId: v.id("units"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const roomTempC = clampRemoteTempC(args.roomTempC);
    if (roomTempC === undefined) {
      throw new Error(
        `Room temp must be between ${REMOTE_TEMP_MIN_C} and ${REMOTE_TEMP_MAX_C} C`,
      );
    }

    const sensor = await ctx.db
      .query("remoteSensors")
      .withIndex("by_token_hash", (q) => q.eq("deviceTokenHash", args.tokenHash))
      .unique();
    if (!sensor) {
      throw new Error("Unknown device token");
    }
    const unit = await ctx.db.get("units", sensor.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    const now = Date.now();
    await ctx.db.patch("remoteSensors", sensor._id, {
      online: true,
      lastSeenAt: now,
      tempC: roomTempC,
      updatedAt: now,
    });
    await ctx.db.patch("units", unit._id, {
      remoteTempC: roomTempC,
      remoteTempAt: now,
      roomTempC,
      updatedAt: now,
    });
    return { sensorId: sensor._id, unitId: unit._id, slug: sensor.slug };
  },
});

export const markStaleOffline = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const onlineCutoff = now - 120_000;
    const tempCutoff = now - REMOTE_TEMP_STALE_MS;

    const sensors = await ctx.db.query("remoteSensors").take(50);
    for (const sensor of sensors) {
      if (
        sensor.online &&
        (sensor.lastSeenAt === undefined || sensor.lastSeenAt < onlineCutoff)
      ) {
        await ctx.db.patch("remoteSensors", sensor._id, { online: false });
      }
    }

    const units = await ctx.db.query("units").take(50);
    for (const unit of units) {
      if (
        unit.remoteTempC !== undefined &&
        (unit.remoteTempAt === undefined || unit.remoteTempAt < tempCutoff)
      ) {
        await ctx.db.patch("units", unit._id, {
          remoteTempC: undefined,
          roomTempC: unit.internalTempC,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});
