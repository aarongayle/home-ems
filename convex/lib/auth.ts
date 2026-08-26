import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

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
