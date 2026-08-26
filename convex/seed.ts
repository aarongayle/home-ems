import { v } from "convex/values";
import { householdMutation } from "./lib/auth";
import { sha256Hex } from "./lib/helpers";
import type { ClimateMode, HvacAction } from "./lib/types";

const DEMO_UNITS = [
  {
    slug: "living-room",
    name: "Living Room",
    room: "Main Floor",
    mode: "heat" as ClimateMode,
    target: 21,
    base: 21.4,
    outdoor: 2.5,
    action: "heating" as HvacAction,
    hz: 34,
  },
  {
    slug: "primary-bedroom",
    name: "Primary Bedroom",
    room: "Upstairs",
    mode: "heat" as ClimateMode,
    target: 20,
    base: 20.2,
    outdoor: 2.5,
    action: "idle" as HvacAction,
    hz: 0,
  },
  {
    slug: "office",
    name: "Office",
    room: "Main Floor",
    mode: "cool" as ClimateMode,
    target: 22.5,
    base: 23.1,
    outdoor: 2.5,
    action: "cooling" as HvacAction,
    hz: 22,
  },
  {
    slug: "garage",
    name: "Garage",
    room: "Garage",
    mode: "off" as ClimateMode,
    target: 16,
    base: 12.8,
    outdoor: 2.5,
    action: "off" as HvacAction,
    hz: 0,
  },
];

export const demoHome = householdMutation({
  args: {},
  returns: v.object({
    created: v.number(),
  }),
  handler: async (ctx) => {
    const existing = await ctx.db.query("units").take(1);
    if (existing.length > 0) {
      throw new Error("Units already exist. Demo seed is only for an empty home.");
    }

    const now = Date.now();
    const site = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .unique();
    if (site) {
      await ctx.db.patch("settings", site._id, {
        homeName: "Home",
        temperatureUnit: "F",
        outdoorTempC: 2.5,
        outdoorUpdatedAt: now,
      });
    } else {
      await ctx.db.insert("settings", {
        key: "site",
        homeName: "Home",
        temperatureUnit: "F",
        outdoorTempC: 2.5,
        outdoorUpdatedAt: now,
      });
    }

    let created = 0;
    for (const demo of DEMO_UNITS) {
      const unitId = await ctx.db.insert("units", {
        slug: demo.slug,
        name: demo.name,
        room: demo.room,
        deviceTokenHash: await sha256Hex(`demo-${demo.slug}`),
        online: demo.mode !== "off",
        lastSeenAt: now,
        lastReadingAt: now,
        mode: demo.mode,
        fanMode: "auto",
        hvacAction: demo.action,
        roomTempC: demo.base,
        targetTempC: demo.target,
        outdoorTempC: demo.outdoor,
        compressorHz: demo.hz,
        minTempC: 16,
        maxTempC: 31,
        createdAt: now,
        updatedAt: now,
      });

      const hours = 24;
      const stepMs = 15 * 60 * 1000;
      for (let ts = now - hours * 60 * 60 * 1000; ts <= now; ts += stepMs) {
        const t = (ts - now) / (60 * 60 * 1000);
        const swing = Math.sin(t / 3) * 1.2;
        const outdoorSwing = Math.sin((t + 4) / 5) * 4;
        await ctx.db.insert("readings", {
          unitId,
          ts,
          roomTempC: demo.base + swing,
          targetTempC: demo.target,
          outdoorTempC: demo.outdoor + outdoorSwing,
          compressorHz:
            demo.hz === 0 ? 0 : Math.max(0, demo.hz + Math.sin(t) * 8),
          inputPowerW:
            demo.hz === 0
              ? 0
              : Math.max(40, demo.hz * 18 + Math.sin(t * 1.4) * 80),
          mode: demo.mode,
          hvacAction: demo.action,
        });
      }
      created += 1;
    }

    return { created };
  },
});
