import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { generateToken } from "./lib/helpers";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const status = query({
  args: {},
  returns: v.object({
    passwordRequired: v.boolean(),
  }),
  handler: async () => {
    return {
      passwordRequired: Boolean(process.env.HOUSEHOLD_PASSWORD),
    };
  },
});

export const login = mutation({
  args: {
    password: v.string(),
  },
  returns: v.object({
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const expected = process.env.HOUSEHOLD_PASSWORD;
    if (!expected) {
      throw new Error("HOUSEHOLD_PASSWORD is not set on the Convex deployment");
    }
    if (args.password !== expected) {
      throw new Error("Invalid password");
    }
    const sessionToken = generateToken();
    const now = Date.now();
    await ctx.db.insert("sessions", {
      token: sessionToken,
      createdAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });
    return { sessionToken };
  },
});

export const logout = mutation({
  args: {
    sessionToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete("sessions", session._id);
    }
    return null;
  },
});

export const expireSessions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db.query("sessions").take(100);
    for (const session of sessions) {
      if (session.expiresAt < now) {
        await ctx.db.delete("sessions", session._id);
      }
    }
    return null;
  },
});
