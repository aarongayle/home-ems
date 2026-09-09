import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "mark-stale-units-offline",
  { minutes: 1 },
  internal.units.markStaleOffline,
);

crons.interval(
  "mark-stale-remote-sensors-offline",
  { minutes: 1 },
  internal.remoteSensors.markStaleOffline,
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

crons.interval(
  "backfill-reading-days",
  { minutes: 5 },
  internal.readings.backfillDays,
);

export default crons;
