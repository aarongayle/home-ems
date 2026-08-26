import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "mark-stale-units-offline",
  { minutes: 1 },
  internal.units.markStaleOffline,
);

crons.interval(
  "expire-sessions",
  { hours: 1 },
  internal.auth.expireSessions,
);

crons.interval(
  "prune-old-readings",
  { hours: 6 },
  internal.readings.pruneOld,
);

export default crons;
