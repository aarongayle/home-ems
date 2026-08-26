import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

const LOGIN_RATE_KEY = "household";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

async function loginAttemptRow(ctx: MutationCtx) {
  return await ctx.db
    .query("loginAttempts")
    .withIndex("by_key", (q) => q.eq("key", LOGIN_RATE_KEY))
    .unique();
}

function recentFailures(failedAt: number[], now: number): number[] {
  return failedAt.filter((timestamp) => now - timestamp < LOGIN_WINDOW_MS);
}

export async function assertLoginAllowed(ctx: MutationCtx): Promise<void> {
  const now = Date.now();
  const row = await loginAttemptRow(ctx);
  const failedAt = recentFailures(row?.failedAt ?? [], now);
  if (failedAt.length < LOGIN_MAX_FAILURES) {
    return;
  }
  const oldest = failedAt[0] ?? now;
  const minutes = Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 60_000));
  throw new Error(
    `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  );
}

export async function recordLoginFailure(ctx: MutationCtx): Promise<void> {
  const now = Date.now();
  const row = await loginAttemptRow(ctx);
  const failedAt = [...recentFailures(row?.failedAt ?? [], now), now];
  if (row) {
    await ctx.db.patch("loginAttempts", row._id, { failedAt });
  } else {
    await ctx.db.insert("loginAttempts", {
      key: LOGIN_RATE_KEY,
      failedAt,
    });
  }
}

export async function clearLoginFailures(ctx: MutationCtx): Promise<void> {
  const row = await loginAttemptRow(ctx);
  if (row && row.failedAt.length > 0) {
    await ctx.db.patch("loginAttempts", row._id, { failedAt: [] });
  }
}

export async function requireHousehold(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined,
): Promise<void> {
  const password = process.env.HOUSEHOLD_PASSWORD;
  if (!password) {
    return;
  }
  if (!sessionToken) {
    throw new Error("Not authenticated");
  }
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .unique();
  if (!session) {
    throw new Error("Not authenticated");
  }
}

export const householdQuery = customQuery(query, {
  args: { sessionToken: v.optional(v.string()) },
  input: async (ctx, args) => {
    await requireHousehold(ctx, args.sessionToken);
    return { ctx, args: {} };
  },
});

export const householdMutation = customMutation(mutation, {
  args: { sessionToken: v.optional(v.string()) },
  input: async (ctx, args) => {
    await requireHousehold(ctx, args.sessionToken);
    return { ctx, args: {} };
  },
});
