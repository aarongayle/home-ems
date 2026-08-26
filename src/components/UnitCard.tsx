import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import {
  ACTION_LABELS,
  FAN_LABELS,
  MODE_LABELS,
  actionTone,
  displayTemp,
  stepTargetC,
  type ClimateMode,
  type FanMode,
  type HvacAction,
  type TemperatureUnit,
} from "../lib/format";
import type { Id } from "../../convex/_generated/dataModel";

export type UnitCardData = {
  _id: Id<"units">;
  name: string;
  room: string;
  online: boolean;
  mode: ClimateMode;
  fanMode: FanMode;
  hvacAction: HvacAction;
  roomTempC?: number;
  targetTempC?: number;
  supplyAirTempC?: number;
  compressorHz?: number;
  pendingCommandCount: number;
  minTempC: number;
  maxTempC: number;
};

const MODES: ClimateMode[] = ["off", "heat", "cool", "auto", "dry", "fan_only"];
const FANS: FanMode[] = ["auto", "quiet", "low", "medium", "high"];

export function UnitCard({
  unit,
  temperatureUnit,
  showTrends = true,
}: {
  unit: UnitCardData;
  temperatureUnit: TemperatureUnit;
  showTrends?: boolean;
}) {
  const { authArgs } = useAuth();
  const setClimate = useMutation(api.units.setClimate);
  const sessionToken =
    authArgs === "skip" ? undefined : authArgs.sessionToken;

  const run = (patch: {
    mode?: ClimateMode;
    targetTempC?: number;
    fanMode?: FanMode;
  }) => {
    void setClimate({
      sessionToken,
      unitId: unit._id,
      ...patch,
    });
  };

  const target = unit.targetTempC ?? 21;
  const canCooler = target > unit.minTempC;
  const canWarmer = target < unit.maxTempC;

  return (
    <section className="flex flex-col border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-mist">
            {unit.room}
          </p>
          <h2 className="text-lg text-paper">{unit.name}</h2>
        </div>
        <div className="text-right">
          <p
            className={`font-mono text-[11px] uppercase tracking-widest ${actionTone(unit.hvacAction, unit.online)}`}
          >
            {unit.online ? ACTION_LABELS[unit.hvacAction] : "Offline"}
          </p>
          {unit.pendingCommandCount > 0 && (
            <p className="font-mono text-[11px] text-heat">Calling</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-4 px-4 py-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-mist">
            Room
          </p>
          <p className="font-mono text-5xl leading-none tracking-tight">
            {displayTemp(unit.roomTempC, temperatureUnit, 1)}
            <span className="ml-1 text-lg text-mist">°{temperatureUnit}</span>
          </p>
          {unit.supplyAirTempC !== undefined && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-mist">
              SAT{" "}
              <span className="text-sm tracking-normal text-paper">
                {displayTemp(unit.supplyAirTempC, temperatureUnit, 1)}°
                {temperatureUnit}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end">
          <p className="font-mono text-[11px] uppercase tracking-widest text-mist">
            Setpoint
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              disabled={!canCooler}
              onClick={() =>
                run({ targetTempC: stepTargetC(target, -1, temperatureUnit) })
              }
              className="h-8 w-8 border border-line text-lg text-mist hover:text-paper disabled:opacity-30"
            >
              −
            </button>
            <span className="font-mono text-3xl">
              {displayTemp(unit.targetTempC, temperatureUnit, 0)}
            </span>
            <button
              type="button"
              disabled={!canWarmer}
              onClick={() =>
                run({ targetTempC: stepTargetC(target, 1, temperatureUnit) })
              }
              className="h-8 w-8 border border-line text-lg text-mist hover:text-paper disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-4">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => run({ mode })}
            className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
              unit.mode === mode
                ? "bg-paper text-ink"
                : "border border-line text-mist hover:text-paper"
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 px-4 pb-4">
        <span className="mr-2 font-mono text-[11px] uppercase tracking-widest text-mist">
          Speed
        </span>
        {FANS.map((fanMode) => (
          <button
            key={fanMode}
            type="button"
            onClick={() => run({ fanMode })}
            className={`px-2 py-1 font-mono text-[11px] uppercase ${
              unit.fanMode === fanMode
                ? "bg-panel-2 text-paper"
                : "text-mist hover:text-paper"
            }`}
          >
            {FAN_LABELS[fanMode]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {unit.compressorHz !== undefined && (
            <span className="font-mono text-[11px] text-mist">
              {Math.round(unit.compressorHz)} Hz
            </span>
          )}
          {showTrends && (
            <Link
              to={`/unit/${unit._id}`}
              className="font-mono text-[11px] uppercase tracking-widest text-mist hover:text-paper"
            >
              Trends
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
