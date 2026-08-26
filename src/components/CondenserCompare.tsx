import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import type { CondenserGroup } from "../lib/floorplan";
import type { TemperatureUnit } from "../lib/format";
import {
  alignTrendReadings,
  loadSeries,
  persistSeries,
  temperatureDomain,
  toggleSeries,
  TrendChart,
  TrendSeriesLegend,
  withLiveReading,
  type SeriesId,
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
  const rangeMs = RANGE_MS[range];
  const startTs = useMemo(() => Date.now() - rangeMs, [rangeMs]);
  const unitIds = useMemo(() => units.map((unit) => unit._id), [units]);

  useEffect(() => {
    persistSeries(enabled);
  }, [enabled]);

  useEffect(() => {
    setHoverIndex(null);
  }, [groupKey, range, startTs]);

  const bundles = useQuery(
    api.readings.forUnits,
    unitIds.length > 0 && authArgs !== "skip"
      ? {
          ...authArgs,
          unitIds,
          startTs,
          // Open-ended so new samples stay in the live Convex subscription.
          endTs: startTs + rangeMs * 100,
        }
      : "skip",
  );

  const liveById = useMemo(
    () => new Map(units.map((unit) => [unit._id, unit])),
    [units],
  );

  const aligned = useMemo(() => {
    if (bundles === undefined) return undefined;
    const byId = new Map(
      bundles.map((bundle) => [
        bundle.unitId,
        withLiveReading(bundle.readings, liveById.get(bundle.unitId)),
      ]),
    );
    const series = units.map((unit) => byId.get(unit._id) ?? []);
    const latest = Math.max(
      startTs + rangeMs,
      ...series.flatMap((readings) => readings.map((row) => row.ts)),
    );
    return {
      series: alignTrendReadings(series, startTs, latest),
      xDomain: [startTs, latest] as [number, number],
    };
  }, [bundles, liveById, rangeMs, startTs, units]);

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
          {aligned === undefined || bundles === undefined ? (
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
