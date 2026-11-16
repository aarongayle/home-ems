import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// A command the unit took but hasn't reported back stays "in flight" this
// long. After that the unit's own report wins again (it likely rejected it).
export const CONFIRM_TIMEOUT_MS = 60_000;

export type CommandField = "mode" | "targetTempC" | "fanMode";

export type PendingState = {
  stage: "queued" | "sent";
  fields: CommandField[];
};

export function commandFields(command: Doc<"commands">): CommandField[] {
  const fields: CommandField[] = [];
  if (command.mode !== undefined) fields.push("mode");
  if (command.targetTempC !== undefined) fields.push("targetTempC");
  if (command.fanMode !== undefined) fields.push("fanMode");
  return fields;
}

/**
 * Commands the unit hasn't confirmed yet: everything queued, plus anything it
 * claimed within CONFIRM_TIMEOUT_MS. `staleSent` is claimed but timed out.
 */
export async function loadOpenCommands(
  ctx: QueryCtx | MutationCtx,
  unitId: Id<"units">,
  now: number,
) {
  const queued = await ctx.db
    .query("commands")
    .withIndex("by_unit_and_status", (q) =>
      q.eq("unitId", unitId).eq("status", "queued"),
    )
    .take(50);
  // Newest first. Older "sent" rows predate confirmation tracking; the time
  // filter ignores them and ingest retires them a batch at a time.
  const sent = await ctx.db
    .query("commands")
    .withIndex("by_unit_and_status", (q) =>
      q.eq("unitId", unitId).eq("status", "sent"),
    )
    .order("desc")
    .take(25);
  const cutoff = now - CONFIRM_TIMEOUT_MS;
  const liveSent = sent.filter((c) => (c.sentAt ?? c.createdAt) > cutoff);
  const staleSent = sent.filter((c) => (c.sentAt ?? c.createdAt) <= cutoff);
  return { queued, liveSent, staleSent };
}

export function pendingState(
  queued: Doc<"commands">[],
  liveSent: Doc<"commands">[],
): PendingState | undefined {
  if (queued.length === 0 && liveSent.length === 0) return undefined;
  const fields = new Set<CommandField>();
  for (const command of [...queued, ...liveSent]) {
    for (const field of commandFields(command)) fields.add(field);
  }
  return {
    stage: queued.length > 0 ? "queued" : "sent",
    fields: [...fields],
  };
}
