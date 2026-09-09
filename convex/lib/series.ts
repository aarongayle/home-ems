import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ClimateMode, HvacAction } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPACT_BUCKET_MS = 5 * 60 * 1000;
export const SHORT_RANGE_MS = 60 * 60 * 1000;
export const MAX_DAY_DOCS = 14;
export const MAX_TODAY_RAW = 3000;
export const MAX_FALLBACK_RAW = 8000;

export type ChartReading = {
  ts: number;
  roomTempC?: number;
  targetTempC?: number;
  outdoorTempC?: number;
  supplyAirTempC?: number;
  compressorHz?: number;
  inputPowerW?: number;
  mode: ClimateMode;
  hvacAction: HvacAction;
};

type SampleFields = {
  ts: number;
  roomTempC?: number;
  targetTempC?: number;
  outdoorTempC?: number;
  supplyAirTempC?: number;
  compressorHz?: number;
  inputPowerW?: number;
  mode: ClimateMode;
  hvacAction: HvacAction;
};

export function utcDayStart(ts: number): number {
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function alignBucket(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs;
}

export function toChartReading(row: SampleFields): ChartReading {
  return {
    ts: row.ts,
    roomTempC: row.roomTempC,
    targetTempC: row.targetTempC,
    outdoorTempC: row.outdoorTempC,
    supplyAirTempC: row.supplyAirTempC,
    compressorHz: row.compressorHz,
    inputPowerW: row.inputPowerW,
    mode: row.mode,
    hvacAction: row.hvacAction,
  };
}

export function compactReadings(
  rows: ChartReading[],
  bucketMs: number,
): ChartReading[] {
  if (bucketMs <= 1 || rows.length <= 1) {
    return rows;
  }
  const buckets = new Map<number, ChartReading>();
  for (const row of rows) {
    buckets.set(alignBucket(row.ts, bucketMs), { ...row, ts: alignBucket(row.ts, bucketMs) });
  }
  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, row]) => row);
}

function pointFromSample(sample: SampleFields): ChartReading {
  return {
    ...toChartReading(sample),
    ts: alignBucket(sample.ts, COMPACT_BUCKET_MS),
  };
}

export async function upsertReadingDay(
  ctx: MutationCtx,
  unitId: Id<"units">,
  sample: SampleFields,
): Promise<void> {
  const dayStartTs = utcDayStart(sample.ts);
  const point = pointFromSample(sample);
  const existing = await ctx.db
    .query("readingDays")
    .withIndex("by_unit_and_day", (q) =>
      q.eq("unitId", unitId).eq("dayStartTs", dayStartTs),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("readingDays", {
      unitId,
      dayStartTs,
      points: [point],
    });
    return;
  }
  const points = [...existing.points];
  const index = points.findIndex((row) => row.ts === point.ts);
  if (index >= 0) {
    points[index] = point;
  } else {
    points.push(point);
    points.sort((left, right) => left.ts - right.ts);
  }
  await ctx.db.patch("readingDays", existing._id, { points });
}

export function dayPointsFromReadings(rows: Doc<"readings">[]): ChartReading[] {
  return compactReadings(rows.map(toChartReading), COMPACT_BUCKET_MS);
}

export async function readingsInRange(
  ctx: QueryCtx | MutationCtx,
  unitId: Id<"units">,
  startTs: number,
  endTs: number,
  limit: number,
) {
  const rows = await ctx.db
    .query("readings")
    .withIndex("by_unit_and_ts", (q) =>
      q.eq("unitId", unitId).gte("ts", startTs).lt("ts", endTs),
    )
    .order("desc")
    .take(limit);
  rows.reverse();
  return rows;
}

export async function compactHistoryForUnit(
  ctx: QueryCtx,
  unitId: Id<"units">,
  startTs: number,
  endTs: number,
  bucketMs: number,
): Promise<ChartReading[]> {
  const todayStart = utcDayStart(endTs);
  const rangeMs = endTs - startTs;
  if (rangeMs <= SHORT_RANGE_MS) {
    const rows = await readingsInRange(ctx, unitId, startTs, endTs, MAX_TODAY_RAW);
    return compactReadings(rows.map(toChartReading), bucketMs);
  }

  const startDay = utcDayStart(startTs);
  const days = await ctx.db
    .query("readingDays")
    .withIndex("by_unit_and_day", (q) =>
      q.eq("unitId", unitId).gte("dayStartTs", startDay).lt("dayStartTs", todayStart),
    )
    .take(MAX_DAY_DOCS);

  const packed: ChartReading[] = [];
  for (const day of days.sort((left, right) => left.dayStartTs - right.dayStartTs)) {
    for (const point of day.points) {
      if (point.ts >= startTs && point.ts < endTs) {
        packed.push(toChartReading(point));
      }
    }
  }

  const todayRaw = await readingsInRange(
    ctx,
    unitId,
    Math.max(startTs, todayStart),
    endTs,
    MAX_TODAY_RAW,
  );
  const today = compactReadings(
    todayRaw.map(toChartReading),
    Math.max(bucketMs, COMPACT_BUCKET_MS),
  );

  let series = packed;
  const firstPacked = series[0]?.ts ?? todayStart;
  if (firstPacked > startTs + COMPACT_BUCKET_MS) {
    const gap = await readingsInRange(
      ctx,
      unitId,
      startTs,
      Math.min(firstPacked, todayStart),
      MAX_FALLBACK_RAW,
    );
    series = [
      ...compactReadings(gap.map(toChartReading), bucketMs),
      ...series,
    ];
  }
  const lastPacked = series[series.length - 1]?.ts ?? startTs;
  if (lastPacked < todayStart - COMPACT_BUCKET_MS) {
    const gap = await readingsInRange(
      ctx,
      unitId,
      lastPacked + 1,
      todayStart,
      MAX_FALLBACK_RAW,
    );
    series = [
      ...series,
      ...compactReadings(gap.map(toChartReading), bucketMs),
    ];
  }

  return compactReadings([...series, ...today], bucketMs);
}
