import { v } from "convex/values";
import { householdMutation, householdQuery } from "./lib/auth";
import { siteValidator, temperatureUnitValidator } from "./lib/validators";

const defaultSite = {
  homeName: "Home",
  temperatureUnit: "F" as const,
  outdoorTempC: undefined,
  outdoorUpdatedAt: undefined,
};

export const get = householdQuery({
  args: {},
  returns: siteValidator,
  handler: async (ctx) => {
    const site = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .unique();
    if (!site) {
      return defaultSite;
    }
    return {
      homeName: site.homeName,
      temperatureUnit: site.temperatureUnit,
      outdoorTempC: site.outdoorTempC,
      outdoorUpdatedAt: site.outdoorUpdatedAt,
    };
  },
});

export const update = householdMutation({
  args: {
    homeName: v.optional(v.string()),
    temperatureUnit: v.optional(temperatureUnitValidator),
  },
  returns: siteValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .unique();
    const homeName = args.homeName?.trim() || existing?.homeName || "Home";
    const temperatureUnit =
      args.temperatureUnit ?? existing?.temperatureUnit ?? "F";

    if (existing) {
      await ctx.db.patch("settings", existing._id, {
        homeName,
        temperatureUnit,
      });
      return {
        homeName,
        temperatureUnit,
        outdoorTempC: existing.outdoorTempC,
        outdoorUpdatedAt: existing.outdoorUpdatedAt,
      };
    }

    await ctx.db.insert("settings", {
      key: "site",
      homeName,
      temperatureUnit,
    });
    return {
      homeName,
      temperatureUnit,
      outdoorTempC: undefined,
      outdoorUpdatedAt: undefined,
    };
  },
});
