import { useEffect, useRef, useState } from "react";
import type { OptimisticLocalStore } from "convex/browser";
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
  slug: string;
  deviceHost?: string;
  name: string;
  room: string;
  online: boolean;
  mode: ClimateMode;
  fanMode: FanMode;
  hvacAction: HvacAction;
  roomTempC?: number;
  internalTempC?: number;
  remoteTempC?: number;
  targetTempC?: number;
  supplyAirTempC?: number;
  compressorHz?: number;
  pendingCommandCount: number;
  pending?: PendingChange;
  minTempC: number;
  maxTempC: number;
};

type PendingField = "mode" | "targetTempC" | "fanMode";
type PendingChange = { stage: "queued" | "sent"; fields: PendingField[] };
type ClimatePatch = {
  mode?: ClimateMode;
  targetTempC?: number;
  fanMode?: FanMode;
};

// How long "Set" / "Not applied" stays up after a change settles.
const OUTCOME_MS = 4000;

// Show the change on every unit list the moment it's tapped, instead of
// waiting for the mutation round trip.
function applyOptimisticClimate(
  store: OptimisticLocalStore,
  args: { unitId: Id<"units"> } & ClimatePatch,
) {
  const fields: PendingField[] = [];
  if (args.mode !== undefined) fields.push("mode");
  if (args.targetTempC !== undefined) fields.push("targetTempC");
  if (args.fanMode !== undefined) fields.push("fanMode");
  for (const { args: queryArgs, value } of store.getAllQueries(api.units.list)) {
    if (!value) continue;
    store.setQuery(
      api.units.list,
      queryArgs,
      value.map((unit) => {
        if (unit._id !== args.unitId) return unit;
        const targetTempC =
          args.targetTempC === undefined
            ? unit.targetTempC
            : Math.min(
                unit.maxTempC,
                Math.max(unit.minTempC, Math.round(args.targetTempC * 2) / 2),
              );
        return {
          ...unit,
          mode: args.mode ?? unit.mode,
          fanMode: args.fanMode ?? unit.fanMode,
          targetTempC,
          pendingCommandCount: unit.pendingCommandCount + 1,
          pending: {
            stage: "queued" as const,
            fields: [...new Set([...(unit.pending?.fields ?? []), ...fields])],
          },
        };
      }),
    );
  }
}

const MODES: ClimateMode[] = ["off", "heat", "cool", "auto", "dry", "fan_only"];
const FANS: FanMode[] = ["auto", "quiet", "low", "medium", "high"];

// Taps within this window collapse into one setpoint command.
const SETPOINT_SETTLE_MS = 800;

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
  const setClimate = useMutation(api.units.setClimate).withOptimisticUpdate(
    applyOptimisticClimate,
  );
  const sessionToken =
    authArgs === "skip" ? undefined : authArgs.sessionToken;

  // What the user last asked for, to tell "Set" from "Not applied" once the
  // unit settles.
  const requested = useRef<ClimatePatch>({});
  const [outcome, setOutcome] = useState<"set" | "rejected">();
  const outcomeTimer = useRef<number | undefined>(undefined);

  const sendClimate = (patch: ClimatePatch) => {
    requested.current = { ...requested.current, ...patch };
    window.clearTimeout(outcomeTimer.current);
    setOutcome(undefined);
    return setClimate({
      sessionToken,
      unitId: unit._id,
      ...patch,
    });
  };

  const run = (patch: ClimatePatch) => {
    void sendClimate(patch);
  };

  // Setpoint the user is tapping toward. Each tap steps from here rather than
  // from the server value, which lags until the mutation round-trips.
  const [draftTargetC, setDraftTargetC] = useState<number>();
  const flushTarget = useRef<(() => void) | undefined>(undefined);
  const settleTimer = useRef<number | undefined>(undefined);
  const tapSeq = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
      flushTarget.current?.();
    },
    [],
  );

  const nudgeTarget = (direction: 1 | -1) => {
    const base = draftTargetC ?? unit.targetTempC ?? 21;
    const next = Math.min(
      unit.maxTempC,
      Math.max(unit.minTempC, stepTargetC(base, direction, temperatureUnit)),
    );
    setDraftTargetC(next);
    const seq = ++tapSeq.current;
    const send = () => {
      flushTarget.current = undefined;
      void sendClimate({ targetTempC: next }).finally(() => {
        if (tapSeq.current === seq) setDraftTargetC(undefined);
      });
    };
    flushTarget.current = send;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(send, SETPOINT_SETTLE_MS);
  };

  // When the last pending change clears, say whether the unit took it.
  const isPending = unit.pending !== undefined;
  const wasPending = useRef(isPending);
  useEffect(() => {
    const settled = wasPending.current && !isPending;
    wasPending.current = isPending;
    if (!settled) return;
    const asked = requested.current;
    requested.current = {};
    if (Object.keys(asked).length === 0) return;
    const took =
      (asked.mode === undefined || asked.mode === unit.mode) &&
      (asked.fanMode === undefined || asked.fanMode === unit.fanMode) &&
      (asked.targetTempC === undefined ||
        (unit.targetTempC !== undefined &&
          Math.abs(asked.targetTempC - unit.targetTempC) < 0.3));
    setOutcome(took ? "set" : "rejected");
    window.clearTimeout(outcomeTimer.current);
    outcomeTimer.current = window.setTimeout(
      () => setOutcome(undefined),
      OUTCOME_MS,
    );
  }, [isPending, unit.mode, unit.fanMode, unit.targetTempC]);
  useEffect(() => () => window.clearTimeout(outcomeTimer.current), []);

  const pendingField = (field: PendingField) =>
    unit.pending?.fields.includes(field) ?? false;
  const status =
    draftTargetC !== undefined || unit.pending?.stage === "queued"
      ? { text: "Sending…", tone: "text-heat" }
      : unit.pending?.stage === "sent"
        ? { text: "Unit applying…", tone: "text-heat" }
        : outcome === "set"
          ? { text: "✓ Set", tone: "text-ok" }
          : outcome === "rejected"
            ? { text: "Not applied", tone: "text-warn" }
            : undefined;

  const target = draftTargetC ?? unit.targetTempC ?? 21;
  const canCooler = target > unit.minTempC;
  const canWarmer = target < unit.maxTempC;
  const deviceUrl = `http://${unit.deviceHost ?? unit.slug}.local/`;

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
          {status && (
            <p
              role="status"
              className={`font-mono text-[11px] ${status.tone}`}
            >
              {status.text}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-4 px-4 py-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-mist">
            {unit.remoteTempC !== undefined ? "Room · remote" : "Room"}
          </p>
          <p className="font-mono text-5xl leading-none tracking-tight">
            {displayTemp(unit.roomTempC, temperatureUnit, 1)}
            <span className="ml-1 text-lg text-mist">°{temperatureUnit}</span>
          </p>
          {unit.remoteTempC !== undefined && unit.internalTempC !== undefined && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-mist">
              Head{" "}
              <span className="text-sm tracking-normal text-paper">
                {displayTemp(unit.internalTempC, temperatureUnit, 1)}°
                {temperatureUnit}
              </span>
            </p>
          )}
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
              onClick={() => nudgeTarget(-1)}
              className="h-8 w-8 border border-line text-lg text-mist hover:text-paper disabled:opacity-30"
            >
              −
            </button>
            <span
              className={`font-mono text-3xl ${
                draftTargetC !== undefined || pendingField("targetTempC")
                  ? "animate-pulse text-heat"
                  : ""
              }`}
            >
              {displayTemp(
                draftTargetC ?? unit.targetTempC,
                temperatureUnit,
                0,
              )}
            </span>
            <button
              type="button"
              disabled={!canWarmer}
              onClick={() => nudgeTarget(1)}
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
                ? pendingField("mode")
                  ? "animate-pulse bg-heat text-ink"
                  : "bg-paper text-ink"
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
                ? pendingField("fanMode")
                  ? "animate-pulse bg-panel-2 text-heat"
                  : "bg-panel-2 text-paper"
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
          <a
            href={deviceUrl}
            target="_blank"
            rel="noreferrer"
            title={`ESPHome web UI (${deviceUrl}) — home network only`}
            className="font-mono text-[11px] uppercase tracking-widest text-mist hover:text-paper"
          >
            Device
          </a>
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
