import { useEffect, useMemo, useState, type PointerEvent } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACTION_LABELS,
  MODE_LABELS,
  cToF,
  formatClock,
  type ClimateMode,
  type HvacAction,
  type TemperatureUnit,
} from "../lib/format";

const STORAGE_KEY = "home-ems.trend-series";

export type SeriesId = "room" | "target" | "outdoor" | "sat" | "hz" | "power";
type Scale = "temp" | "hz" | "power";

type SeriesDef = {
  id: SeriesId;
  label: string;
  color: string;
  kind: "area" | "line";
  scale: Scale;
  dataKey: string;
};

const SERIES: SeriesDef[] = [
  {
    id: "room",
    label: "Room",
    color: "#e7eee6",
    kind: "area",
    scale: "temp",
    dataKey: "room",
  },
  {
    id: "target",
    label: "Setpoint",
    color: "#e2a04a",
    kind: "line",
    scale: "temp",
    dataKey: "target",
  },
  {
    id: "outdoor",
    label: "Outdoor",
    color: "#5aa7bc",
    kind: "line",
    scale: "temp",
    dataKey: "outdoor",
  },
  {
    id: "sat",
    label: "SAT",
    color: "#a88bc4",
    kind: "line",
    scale: "temp",
    dataKey: "sat",
  },
  {
    id: "hz",
    label: "Hz",
    color: "#86b56a",
    kind: "line",
    scale: "hz",
    dataKey: "hz",
  },
  {
    id: "power",
    label: "Power",
    color: "#d17a4a",
    kind: "line",
    scale: "power",
    dataKey: "power",
  },
];

const DEFAULT_SERIES: SeriesId[] = ["room", "target", "outdoor", "sat"];
const SERIES_IDS = new Set<SeriesId>(SERIES.map((item) => item.id));

export type TrendReading = {
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

type LiveSource = {
  ts?: number;
  lastSeenAt?: number;
  lastReadingAt?: number;
  updatedAt?: number;
  roomTempC?: number;
  targetTempC?: number;
  outdoorTempC?: number;
  supplyAirTempC?: number;
  compressorHz?: number;
  inputPowerW?: number;
  mode: ClimateMode;
  hvacAction: HvacAction;
};

export function compactTrendReadings(
  rows: TrendReading[],
  bucketMs: number,
): TrendReading[] {
  if (bucketMs <= 1 || rows.length <= 1) {
    return rows;
  }
  const buckets = new Map<number, TrendReading>();
  for (const row of rows) {
    const ts = Math.floor(row.ts / bucketMs) * bucketMs;
    buckets.set(ts, { ...row, ts });
  }
  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, row]) => row);
}

/** Fold newly arrived samples onto frozen history without re-fetching it. */
export function mergeHistoryAndTail(
  history: TrendReading[],
  tail: TrendReading[],
  bucketMs: number,
): TrendReading[] {
  if (tail.length === 0) {
    return history;
  }
  const cutoff = history.at(-1)?.ts ?? Number.NEGATIVE_INFINITY;
  const newer = tail.filter((row) => row.ts > cutoff);
  if (newer.length === 0) {
    return history;
  }
  return compactTrendReadings([...history, ...newer], bucketMs);
}

export function appendLiveTail(
  current: TrendReading[],
  next: TrendReading | null | undefined,
): TrendReading[] {
  if (!next) {
    return current;
  }
  const last = current.at(-1);
  if (last !== undefined && next.ts <= last.ts) {
    return current;
  }
  return [...current, next];
}

/** Keep the chart's latest point in sync with the live unit snapshot. */
export function withLiveReading(
  readings: TrendReading[],
  live: LiveSource | null | undefined,
): TrendReading[] {
  if (!live) return readings;
  const ts = live.lastSeenAt ?? live.lastReadingAt ?? live.updatedAt ?? live.ts;
  if (ts === undefined) return readings;
  const last = readings.at(-1);
  if (last !== undefined && ts <= last.ts) return readings;
  return [
    ...readings,
    {
      ts,
      roomTempC: live.roomTempC,
      targetTempC: live.targetTempC,
      outdoorTempC: live.outdoorTempC,
      supplyAirTempC: live.supplyAirTempC,
      compressorHz: live.compressorHz,
      inputPowerW: live.inputPowerW,
      mode: live.mode,
      hvacAction: live.hvacAction,
    },
  ];
}

function hasSample(row: TrendReading): boolean {
  return (
    row.roomTempC !== undefined ||
    row.targetTempC !== undefined ||
    row.outdoorTempC !== undefined ||
    row.supplyAirTempC !== undefined ||
    row.compressorHz !== undefined ||
    row.inputPowerW !== undefined
  );
}

/**
 * Put every series on the same timestamps so synced tooltips land on the
 * same instant, and so charts draw the same window even when sample counts differ.
 */
export function alignTrendReadings(
  series: ReadonlyArray<ReadonlyArray<TrendReading>>,
  startTs: number,
  endTs: number,
): TrendReading[][] {
  const stamps = new Set<number>([startTs, endTs]);
  for (const readings of series) {
    for (const row of readings) {
      if (row.ts >= startTs && row.ts <= endTs) {
        stamps.add(row.ts);
      }
    }
  }
  const times = [...stamps].sort((a, b) => a - b);

  return series.map((readings) => {
    let index = 0;
    let last: TrendReading | undefined;
    const aligned: TrendReading[] = [];
    for (const ts of times) {
      while (index < readings.length) {
        const candidate = readings[index];
        if (candidate === undefined || candidate.ts > ts) break;
        last = candidate;
        index += 1;
      }
      if (last !== undefined && last.ts <= ts) {
        aligned.push(last.ts === ts ? last : { ...last, ts });
      } else {
        aligned.push({ ts, mode: "off", hvacAction: "off" });
      }
    }
    return aligned;
  });
}

export function temperatureDomain(
  series: ReadonlyArray<ReadonlyArray<TrendReading>>,
  temperatureUnit: TemperatureUnit,
  enabled: ReadonlyArray<SeriesId>,
): [number, number] | undefined {
  const values: number[] = [];
  const wantRoom = enabled.includes("room");
  const wantTarget = enabled.includes("target");
  const wantOutdoor = enabled.includes("outdoor");
  const wantSat = enabled.includes("sat");
  for (const readings of series) {
    for (const row of readings) {
      if (wantRoom) {
        const value = toDisplay(row.roomTempC, temperatureUnit);
        if (value !== undefined) values.push(value);
      }
      if (wantTarget) {
        const value = toDisplay(row.targetTempC, temperatureUnit);
        if (value !== undefined) values.push(value);
      }
      if (wantOutdoor) {
        const value = toDisplay(row.outdoorTempC, temperatureUnit);
        if (value !== undefined) values.push(value);
      }
      if (wantSat) {
        const value = toDisplay(row.supplyAirTempC, temperatureUnit);
        if (value !== undefined) values.push(value);
      }
    }
  }
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.08);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

type ChartPoint = {
  ts: number;
  room?: number;
  target?: number;
  outdoor?: number;
  sat?: number;
  hz?: number;
  power?: number;
  mode: ClimateMode;
  hvacAction: HvacAction;
  sparse: boolean;
};

function isSeriesId(value: unknown): value is SeriesId {
  return typeof value === "string" && SERIES_IDS.has(value as SeriesId);
}

export function loadSeries(): SeriesId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SERIES;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SERIES;
    const valid = parsed.filter(isSeriesId);
    return valid.length > 0 ? valid : DEFAULT_SERIES;
  } catch {
    return DEFAULT_SERIES;
  }
}

export function persistSeries(enabled: SeriesId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
}

function toDisplay(celsius: number | undefined, unit: TemperatureUnit) {
  if (celsius === undefined) return undefined;
  return unit === "F" ? cToF(celsius) : celsius;
}

function unitFor(scale: Scale, temperatureUnit: TemperatureUnit): string {
  if (scale === "temp") return `°${temperatureUnit}`;
  if (scale === "hz") return "Hz";
  return "W";
}

function formatValue(value: number, scale: Scale): string {
  if (scale === "temp") return value.toFixed(1);
  return String(Math.round(value));
}

function axisLayout(selected: SeriesDef[]) {
  const scales = new Set(selected.map((item) => item.scale));
  const hasTemp = scales.has("temp");
  const hasOther = scales.has("hz") || scales.has("power");
  const left: Scale | undefined = hasTemp
    ? "temp"
    : scales.has("hz")
      ? "hz"
      : scales.has("power")
        ? "power"
        : undefined;
  const right: Scale | undefined =
    hasTemp && hasOther ? (scales.has("hz") ? "hz" : "power") : undefined;

  const yAxisId = (scale: Scale): string =>
    scale === "temp" || !hasTemp ? "left" : "right";

  return { left, right, yAxisId };
}

function ChartTooltip({
  active,
  payload,
  label,
  temperatureUnit,
  selected,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  label?: string | number;
  temperatureUnit: TemperatureUnit;
  selected: SeriesDef[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="border border-line bg-ink px-3 py-2 font-mono text-xs text-paper">
      <p className="mb-1.5 text-mist">{formatClock(Number(label))}</p>
      {selected.map((series) => {
        const value = point[series.dataKey as keyof ChartPoint];
        if (typeof value !== "number") return null;
        return (
          <p key={series.id} style={{ color: series.color }}>
            {series.label} {formatValue(value, series.scale)}
            {unitFor(series.scale, temperatureUnit)}
          </p>
        );
      })}
      {!point.sparse && (
        <p className="mt-1.5 text-mist">
          {MODE_LABELS[point.mode]} · {ACTION_LABELS[point.hvacAction]}
        </p>
      )}
    </div>
  );
}

export function TrendSeriesLegend({
  enabled,
  showSat,
  onToggle,
}: {
  enabled: ReadonlyArray<SeriesId>;
  showSat: boolean;
  onToggle: (id: SeriesId) => void;
}) {
  const available = showSat ? SERIES : SERIES.filter((item) => item.id !== "sat");
  return (
    <div className="flex flex-wrap gap-1">
      {available.map((series) => {
        const on = enabled.includes(series.id);
        return (
          <button
            key={series.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(series.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
              on
                ? "bg-panel-2 text-paper"
                : "border border-line text-mist hover:text-paper"
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0"
              style={{ background: series.color, opacity: on ? 1 : 0.35 }}
            />
            {series.label}
          </button>
        );
      })}
    </div>
  );
}

export function toggleSeries(
  current: ReadonlyArray<SeriesId>,
  id: SeriesId,
): SeriesId[] {
  if (current.includes(id)) {
    if (current.length === 1) return [...current];
    return current.filter((item) => item !== id);
  }
  return [...current, id];
}

export function TrendChart({
  readings,
  temperatureUnit,
  showSat = false,
  syncId,
  xDomain,
  tempDomain,
  enabled: enabledProp,
  onEnabledChange,
  showLegend = true,
  heightClass = "h-80",
  hoverIndex = null,
  onHoverIndex,
}: {
  readings: TrendReading[];
  temperatureUnit: TemperatureUnit;
  showSat?: boolean;
  syncId?: string;
  xDomain?: [number, number];
  tempDomain?: [number, number];
  enabled?: SeriesId[];
  onEnabledChange?: (next: SeriesId[]) => void;
  showLegend?: boolean;
  heightClass?: string;
  hoverIndex?: number | null;
  onHoverIndex?: (index: number | null) => void;
}) {
  const [internalEnabled, setInternalEnabled] = useState<SeriesId[]>(loadSeries);
  const enabled = enabledProp ?? internalEnabled;

  useEffect(() => {
    if (enabledProp !== undefined) return;
    persistSeries(internalEnabled);
  }, [enabledProp, internalEnabled]);

  const available = useMemo(() => {
    const hasSat =
      showSat || readings.some((row) => row.supplyAirTempC !== undefined);
    return hasSat ? SERIES : SERIES.filter((item) => item.id !== "sat");
  }, [readings, showSat]);

  const selected = useMemo(
    () => available.filter((item) => enabled.includes(item.id)),
    [available, enabled],
  );
  const layout = useMemo(() => axisLayout(selected), [selected]);

  const data = useMemo<ChartPoint[]>(
    () =>
      readings.map((row) => ({
        ts: row.ts,
        room: toDisplay(row.roomTempC, temperatureUnit),
        target: toDisplay(row.targetTempC, temperatureUnit),
        outdoor: toDisplay(row.outdoorTempC, temperatureUnit),
        sat: toDisplay(row.supplyAirTempC, temperatureUnit),
        hz: row.compressorHz,
        power: row.inputPowerW,
        mode: row.mode,
        hvacAction: row.hvacAction,
        sparse: !hasSample(row),
      })),
    [readings, temperatureUnit],
  );

  const toggle = (id: SeriesId) => {
    const next = toggleSeries(enabled, id);
    if (onEnabledChange) {
      onEnabledChange(next);
      return;
    }
    setInternalEnabled(next);
  };

  const renderAxis = (
    scale: Scale | undefined,
    yAxisId: string,
    orientation: "left" | "right",
    width: number,
  ) => {
    if (!scale) return null;
    const domain =
      scale === "temp"
        ? (tempDomain ?? ["auto", "auto"])
        : ([0, "auto"] as const);
    return (
      <YAxis
        yAxisId={yAxisId}
        orientation={orientation}
        stroke="#8b978c"
        tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }}
        width={width}
        domain={domain}
        tickFormatter={(value: number) =>
          scale === "temp" ? Number(value).toFixed(0) : String(Math.round(value))
        }
      />
    );
  };

  const rightMargin = layout.right ? 40 : 8;
  const hovered = hoverIndex !== null ? data[hoverIndex] : undefined;
  const sharedHover = onHoverIndex !== undefined;

  const emitHoverIndex = (raw: number | string | undefined) => {
    if (!onHoverIndex) return;
    if (raw === undefined || raw === "") {
      return;
    }
    const index = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(index)) {
      onHoverIndex(index);
    }
  };

  const hoverFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!onHoverIndex || !xDomain || data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotLeft = 36;
    const plotRight = rect.width - (layout.right ? 40 : 8) - 12;
    const span = Math.max(1, plotRight - plotLeft);
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - plotLeft) / span));
    const ts = xDomain[0] + ratio * (xDomain[1] - xDomain[0]);
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      if (point === undefined) continue;
      const dist = Math.abs(point.ts - ts);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    onHoverIndex(best);
  };

  const tooltip = (
    <ChartTooltip
      active
      payload={hovered ? [{ payload: hovered }] : []}
      label={hovered?.ts}
      temperatureUnit={temperatureUnit}
      selected={selected}
    />
  );

  return (
    <div className="space-y-3">
      {showLegend && (
        <TrendSeriesLegend
          enabled={enabled}
          showSat={available.some((item) => item.id === "sat")}
          onToggle={toggle}
        />
      )}
      <div
        data-trend-chart
        className={`relative w-full border border-line bg-panel p-3 ${heightClass}`}
        onPointerMove={sharedHover ? hoverFromPointer : undefined}
        onPointerLeave={sharedHover ? () => onHoverIndex?.(null) : undefined}
      >
        {sharedHover && hovered && (
          <div className="pointer-events-none absolute right-4 top-4 z-10">
            {tooltip}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: rightMargin, left: 0, bottom: 0 }}
            {...(syncId ? { syncId, syncMethod: "index" as const } : {})}
            onMouseMove={(state) => emitHoverIndex(state.activeTooltipIndex ?? undefined)}
            onMouseLeave={() => onHoverIndex?.(null)}
          >
            <CartesianGrid stroke="#2a352c" vertical={false} />
            <XAxis
              dataKey="ts"
              type={xDomain ? "number" : "category"}
              domain={xDomain}
              tickFormatter={formatClock}
              stroke="#8b978c"
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }}
            />
            {renderAxis(layout.left, "left", "left", 36)}
            {renderAxis(layout.right, "right", "right", 36)}
            {hovered && (
              <ReferenceLine
                x={hovered.ts}
                stroke="#8b978c"
                strokeDasharray="3 3"
                ifOverflow="visible"
              />
            )}
            <Tooltip
              animationDuration={0}
              cursor={
                sharedHover
                  ? false
                  : { stroke: "#8b978c", strokeDasharray: "3 3" }
              }
              content={
                sharedHover
                  ? () => null
                  : (props) => {
                      const point = props.payload?.[0]?.payload as
                        | ChartPoint
                        | undefined;
                      return (
                        <ChartTooltip
                          active={props.active}
                          payload={point ? [{ payload: point }] : []}
                          label={props.label}
                          temperatureUnit={temperatureUnit}
                          selected={selected}
                        />
                      );
                    }
              }
            />
            {selected.map((series) =>
              series.kind === "area" ? (
                <Area
                  key={series.id}
                  yAxisId={layout.yAxisId(series.scale)}
                  type="monotone"
                  dataKey={series.dataKey}
                  name={series.label}
                  stroke={series.color}
                  fill="#1c241e"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={series.id}
                  yAxisId={layout.yAxisId(series.scale)}
                  type="monotone"
                  dataKey={series.dataKey}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
