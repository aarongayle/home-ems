import { v } from "convex/values";
import { householdQuery } from "./lib/auth";
import { readingValidator } from "./lib/validators";
import { internalMutation } from "./_generated/server";

const MAX_POINTS = 400;

export const forUnit = householdQuery({
  args: {
    unitId: v.id("units"),
    startTs: v.number(),
    endTs: v.optional(v.number()),
  },
  returns: v.array(readingValidator),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("units", args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    const rows = await ctx.db
      .query("readings")
      .withIndex("by_unit_and_ts", (q) =>
        args.endTs === undefined
          ? q.eq("unitId", args.unitId).gte("ts", args.startTs)
          : q
              .eq("unitId", args.unitId)
              .gte("ts", args.startTs)
              .lte("ts", args.endTs),
      )
      .order("desc")
      .take(8000);
    rows.reverse();

    const stride = rows.length > MAX_POINTS ? Math.ceil(rows.length / MAX_POINTS) : 1;
    const sampled = rows.filter((_, index) => index % stride === 0);
    const last = rows[rows.length - 1];
    if (last !== undefined && sampled[sampled.length - 1]?._id !== last._id) {
      sampled.push(last);
    }
    return sampled.map((row) => ({
      _id: row._id,
      ts: row.ts,
      roomTempC: row.roomTempC,
      targetTempC: row.targetTempC,
      outdoorTempC: row.outdoorTempC,
      compressorHz: row.compressorHz,
      inputPowerW: row.inputPowerW,
      mode: row.mode,
      hvacAction: row.hvacAction,
    }));
  },
});

export const pruneOld = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("readings")
      .withIndex("by_ts", (q) => q.lt("ts", cutoff))
      .take(400);
    for (const reading of old) {
      await ctx.db.delete("readings", reading._id);
    }
    return old.length;
  },
});
