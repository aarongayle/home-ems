import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  climateModeValidator,
  fanModeValidator,
} from "./lib/validators";
import { REMOTE_TEMP_STALE_MS } from "./lib/helpers";

const commandPayloadValidator = v.object({
  id: v.id("commands"),
  mode: v.optional(climateModeValidator),
  target_temp: v.optional(v.number()),
  fan_mode: v.optional(fanModeValidator),
});

export const claimQueued = internalMutation({
  args: {
    tokenHash: v.string(),
  },
  returns: v.object({
    slug: v.string(),
    commands: v.array(commandPayloadValidator),
    remote_temp: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const unit = await ctx.db
      .query("units")
      .withIndex("by_token_hash", (q) => q.eq("deviceTokenHash", args.tokenHash))
      .unique();
    if (!unit) {
      throw new Error("Unknown device token");
    }

    const queued = await ctx.db
      .query("commands")
      .withIndex("by_unit_and_status", (q) =>
        q.eq("unitId", unit._id).eq("status", "queued"),
      )
      .take(10);

    const now = Date.now();
    const commands = [];
    for (const command of queued) {
      await ctx.db.patch("commands", command._id, {
        status: "sent",
        sentAt: now,
      });
      commands.push({
        id: command._id,
        mode: command.mode,
        target_temp: command.targetTempC,
        fan_mode: command.fanMode,
      });
    }

    await ctx.db.patch("units", unit._id, {
      online: true,
      lastSeenAt: now,
    });

    const remoteFresh =
      unit.remoteTempC !== undefined &&
      unit.remoteTempAt !== undefined &&
      now - unit.remoteTempAt < REMOTE_TEMP_STALE_MS;

    return {
      slug: unit.slug,
      commands,
      remote_temp: remoteFresh ? unit.remoteTempC : undefined,
    };
  },
});
