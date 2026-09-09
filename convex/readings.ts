import { v } from "convex/values";
import { householdQuery } from "./lib/auth";
import { chartReadingValidator } from "./lib/validators";
import {
  compactHistoryForUnit,
  DAY_MS,
  dayPointsFromReadings,
  toChartReading,
  utcDayStart,
} from "./lib/series";
import { internalMutation } from "./_generated/server";

const MAX_UNITS = 8;

export const forUnit = householdQuery({
  args: {
    unitId: v.id("units"),
    startTs: v.number(),
    endTs: v.number(),
    bucketMs: v.number(),
  },
  returns: v.array(chartReadingValidator),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    return await compactHistoryForUnit(
      ctx,
      args.unitId,
      args.startTs,
      args.endTs,
      args.bucketMs,
    );
  },
});

export const forUnits = householdQuery({
  args: {
    unitIds: v.array(v.id("units")),
    startTs: v.number(),
    endTs: v.number(),
    bucketMs: v.number(),
  },
  returns: v.array(
    v.object({
      unitId: v.id("units"),
      readings: v.array(chartReadingValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.unitIds.length > MAX_UNITS) {
      throw new Error("Too many units");
    }
    const result = [];
    for (const unitId of args.unitIds) {
      const unit = await ctx.db.get("units", unitId);
      if (!unit) {
        throw new Error("Unit not found");
      }
      result.push({
        unitId,
        readings: await compactHistoryForUnit(
          ctx,
          unitId,
          args.startTs,
          args.endTs,
          args.bucketMs,
        ),
      });
    }
    return result;
  },
});

export const latestForUnits = householdQuery({
  args: {
    unitIds: v.array(v.id("units")),
  },
  returns: v.array(
    v.object({
      unitId: v.id("units"),
      reading: v.union(chartReadingValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.unitIds.length > MAX_UNITS) {
      throw new Error("Too many units");
    }
    const result = [];
    for (const unitId of args.unitIds) {
      const unit = await ctx.db.get("units", unitId);
      if (!unit) {
        throw new Error("Unit not found");
      }
      const latest = await ctx.db
        .query("readings")
        .withIndex("by_unit_and_ts", (q) => q.eq("unitId", unitId))
        .order("desc")
        .take(1);
      const row = latest[0];
      result.push({
        unitId,
        reading: row === undefined ? null : toChartReading(row),
      });
    }
    return result;
  },
});

export const pruneOld = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * DAY_MS;
    const old = await ctx.db
      .query("readings")
      .withIndex("by_ts", (q) => q.lt("ts", cutoff))
      .take(400);
    for (const reading of old) {
      await ctx.db.delete("readings", reading._id);
    }
    const oldDays = await ctx.db
      .query("readingDays")
      .withIndex("by_day", (q) => q.lt("dayStartTs", cutoff))
      .take(40);
    for (const day of oldDays) {
      await ctx.db.delete("readingDays", day._id);
    }
    return old.length + oldDays.length;
  },
});

export const backfillDays = internalMutation({
  args: {},
  returns: v.object({
    written: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx) => {
    const todayStart = utcDayStart(Date.now());
    const units = await ctx.db.query("units").take(50);
    let written = 0;
    for (const unit of units) {
      if (written >= 8) {
        return { written, done: false };
      }
      const existing = await ctx.db
        .query("readingDays")
        .withIndex("by_unit_and_day", (q) => q.eq("unitId", unit._id))
        .take(100);
      const have = new Set(existing.map((day) => day.dayStartTs));
      const oldest = await ctx.db
        .query("readings")
        .withIndex("by_unit_and_ts", (q) => q.eq("unitId", unit._id))
        .order("asc")
        .take(1);
      const first = oldest[0];
      if (first === undefined) {
        continue;
      }
      const startDay = utcDayStart(first.ts);
      for (let dayStartTs = startDay; dayStartTs < todayStart; dayStartTs += DAY_MS) {
        if (have.has(dayStartTs)) {
          continue;
        }
        const rows = await ctx.db
          .query("readings")
          .withIndex("by_unit_and_ts", (q) =>
            q.eq("unitId", unit._id).gte("ts", dayStartTs).lt("ts", dayStartTs + DAY_MS),
          )
          .take(3000);
        have.add(dayStartTs);
        if (rows.length === 0) {
          continue;
        }
        await ctx.db.insert("readingDays", {
          unitId: unit._id,
          dayStartTs,
          points: dayPointsFromReadings(rows),
        });
        written += 1;
        if (written >= 8) {
          return { written, done: false };
        }
      }
    }
    return { written, done: true };
  },
});
