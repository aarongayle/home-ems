import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
};

function isSeriesId(value: unknown): value is SeriesId {
  return typeof value === "string" && SERIES_IDS.has(value as SeriesId);
}

function loadSeries(): SeriesId[] {
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
  payload?: ReadonlyArray<{ dataKey?: string | number; payload?: ChartPoint }>;
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
      <p className="mt-1.5 text-mist">
        {MODE_LABELS[point.mode]} · {ACTION_LABELS[point.hvacAction]}
      </p>
    </div>
  );
}

export function TrendChart({
  readings,
  temperatureUnit,
  showSat = false,
}: {
  readings: TrendReading[];
  temperatureUnit: TemperatureUnit;
  showSat?: boolean;
}) {
  const [enabled, setEnabled] = useState<SeriesId[]>(loadSeries);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  }, [enabled]);

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
      })),
    [readings, temperatureUnit],
  );

  const toggle = (id: SeriesId) => {
    setEnabled((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  };

  const renderAxis = (
    scale: Scale | undefined,
    yAxisId: string,
    orientation: "left" | "right",
    width: number,
  ) => {
    if (!scale) return null;
    return (
      <YAxis
        yAxisId={yAxisId}
        orientation={orientation}
        stroke="#8b978c"
        tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }}
        width={width}
        domain={scale === "temp" ? ["auto", "auto"] : [0, "auto"]}
        tickFormatter={(value: number) =>
          scale === "temp" ? Number(value).toFixed(0) : String(Math.round(value))
        }
      />
    );
  };

  const rightMargin = layout.right ? 40 : 8;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {available.map((series) => {
          const on = enabled.includes(series.id);
          return (
            <button
              key={series.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(series.id)}
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
      <div className="h-80 w-full border border-line bg-panel p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: rightMargin, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#2a352c" vertical={false} />
            <XAxis
              dataKey="ts"
              tickFormatter={formatClock}
              stroke="#8b978c"
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }}
            />
            {renderAxis(layout.left, "left", "left", 36)}
            {renderAxis(layout.right, "right", "right", 36)}
            <Tooltip
              content={
                <ChartTooltip
                  temperatureUnit={temperatureUnit}
                  selected={selected}
                />
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
