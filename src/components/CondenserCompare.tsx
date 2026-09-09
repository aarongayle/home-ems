import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import type { CondenserGroup } from "../lib/floorplan";
import type { TemperatureUnit } from "../lib/format";
import {
  appendLiveTail,
  alignTrendReadings,
  compactTrendReadings,
  loadSeries,
  mergeHistoryAndTail,
  persistSeries,
  temperatureDomain,
  toggleSeries,
  TrendChart,
  TrendSeriesLegend,
  withLiveReading,
  type SeriesId,
  type TrendReading,
} from "./TrendChart";
import { UnitCard, type UnitCardData } from "./UnitCard";

const RANGES = [
  { id: "10m", label: "10 m" },
  { id: "1h", label: "1 h" },
  { id: "12h", label: "12 h" },
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 d" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

const RANGE_MS: Record<RangeId, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function bucketMsForRange(rangeMs: number): number {
  if (rangeMs <= 60 * 60 * 1000) {
    return 45_000;
  }
  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return 5 * 60 * 1000;
  }
  return 15 * 60 * 1000;
}

type CompareUnit = UnitCardData & {
  lastSeenAt?: number;
  lastReadingAt?: number;
  updatedAt?: number;
  outdoorTempC?: number;
  supplyAirTempC?: number;
};

export function CondenserCompare({
  units,
  temperatureUnit,
  groups,
  groupKey,
  onSelectGroup,
  kicker,
  title,
}: {
  units: ReadonlyArray<CompareUnit>;
  temperatureUnit: TemperatureUnit;
  groups?: ReadonlyArray<CondenserGroup<CompareUnit>>;
  groupKey?: string;
  onSelectGroup?: (key: string) => void;
  kicker?: string;
  title?: string;
}) {
  const { authArgs } = useAuth();
  const [range, setRange] = useState<RangeId>("24h");
  const [enabled, setEnabled] = useState<SeriesId[]>(loadSeries);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tails, setTails] = useState<Record<string, TrendReading[]>>({});
  const rangeMs = RANGE_MS[range];
  const bucketMs = bucketMsForRange(rangeMs);
  const unitIdsKey = units.map((unit) => unit._id).join(",");
  const unitIds = useMemo(() => {
    if (unitIdsKey === "") {
      return [];
    }
    return unitIdsKey.split(",") as Array<(typeof units)[number]["_id"]>;
  }, [unitIdsKey]);
  const window = useMemo(() => {
    const endTs = Date.now();
    return { startTs: endTs - rangeMs, endTs };
  }, [rangeMs]);

  useEffect(() => {
    persistSeries(enabled);
  }, [enabled]);

  useEffect(() => {
    setHoverIndex(null);
    setTails({});
  }, [groupKey, range, window.startTs, window.endTs, unitIdsKey]);

  const history = useQuery(
    api.readings.forUnits,
    unitIds.length > 0 && authArgs !== "skip"
      ? {
          ...authArgs,
          unitIds,
          startTs: window.startTs,
          // Frozen so new samples fall outside this range and do not
          // re-read packed history. Live points come from latestForUnits.
          endTs: window.endTs,
          bucketMs,
        }
      : "skip",
  );
  const latest = useQuery(
    api.readings.latestForUnits,
    unitIds.length > 0 && authArgs !== "skip"
      ? { ...authArgs, unitIds }
      : "skip",
  );

  useEffect(() => {
    if (latest === undefined) {
      return;
    }
    setTails((current) => {
      let changed = false;
      const next = { ...current };
      for (const row of latest) {
        const merged = compactTrendReadings(
          appendLiveTail(next[row.unitId] ?? [], row.reading ?? undefined),
          bucketMs,
        );
        const previous = next[row.unitId];
        if (
          merged.length > 0 &&
          (previous === undefined ||
            previous.length !== merged.length ||
            previous.at(-1)?.ts !== merged.at(-1)?.ts)
        ) {
          next[row.unitId] = merged;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [bucketMs, latest]);

  const liveById = useMemo(
    () => new Map(units.map((unit) => [unit._id, unit])),
    [units],
  );

  const aligned = useMemo(() => {
    if (history === undefined) return undefined;
    const byId = new Map(
      history.map((bundle) => {
        const merged = mergeHistoryAndTail(
          bundle.readings,
          tails[bundle.unitId] ?? [],
          bucketMs,
        );
        return [
          bundle.unitId,
          withLiveReading(merged, liveById.get(bundle.unitId)),
        ];
      }),
    );
    const series = units.map((unit) => byId.get(unit._id) ?? []);
    const latestTs = Math.max(
      window.startTs + rangeMs,
      ...series.flatMap((readings) => readings.map((row) => row.ts)),
    );
    return {
      series: alignTrendReadings(series, window.startTs, latestTs),
      xDomain: [window.startTs, latestTs] as [number, number],
    };
  }, [bucketMs, history, liveById, rangeMs, tails, units, window.startTs]);

  const showSat = units.some((unit) => unit.supplyAirTempC !== undefined);
  const tempDomain = useMemo(
    () =>
      aligned
        ? temperatureDomain(aligned.series, temperatureUnit, enabled)
        : undefined,
    [aligned, enabled, temperatureUnit],
  );

  const syncId = units.length > 1 ? `condenser-${groupKey ?? "group"}` : undefined;
  const stacked = units.length > 1;
  const headingKicker = kicker ?? (stacked ? "Condenser" : "Zone");
  const headingTitle =
    title ?? (stacked ? "Heads on this outdoor unit" : "History");

  return (
    <div className="space-y-4">
      {groups && groups.length > 1 && onSelectGroup && (
        <div className="flex flex-wrap gap-1">
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectGroup(group.key)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
                group.key === groupKey
                  ? "bg-paper text-ink"
                  : "border border-line text-mist hover:text-paper"
              }`}
            >
              {group.label}
              <span className="ml-1.5 opacity-60">{group.units.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            {headingKicker}
          </p>
          <h2 className="text-lg">{headingTitle}</h2>
        </div>
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRange(item.id)}
            className={`px-2 py-1 font-mono text-[11px] uppercase ${
              range === item.id ? "bg-paper text-ink" : "text-mist"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <TrendSeriesLegend
        enabled={enabled}
        showSat={showSat}
        onToggle={(id) => setEnabled((current) => toggleSeries(current, id))}
      />

      {units.map((unit, index) => (
        <div key={unit._id} className="space-y-3">
          <UnitCard
            unit={unit}
            temperatureUnit={temperatureUnit}
            showTrends={false}
          />
          {aligned === undefined || history === undefined ? (
            <p className="text-mist">Loading trend…</p>
          ) : (
            <TrendChart
              readings={aligned.series[index] ?? []}
              temperatureUnit={temperatureUnit}
              showSat={showSat}
              syncId={syncId}
              xDomain={aligned.xDomain}
              tempDomain={tempDomain}
              enabled={enabled}
              onEnabledChange={setEnabled}
              showLegend={false}
              heightClass={stacked ? "h-72" : "h-80"}
              hoverIndex={stacked ? hoverIndex : null}
              onHoverIndex={stacked ? setHoverIndex : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
