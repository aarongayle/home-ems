import { useMemo, useState } from "react";
import { Layers3, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ACTION_LABELS,
  displayTemp,
  type HvacAction,
  type TemperatureUnit,
} from "../lib/format";
import {
  FLOORS,
  MAP_ZONES,
  inferMapZone,
  type FloorId,
  type MapZone,
} from "../lib/floorplan";

export type FloorplanUnit = {
  _id: Id<"units">;
  slug: string;
  name: string;
  room: string;
  mapZone?: MapZone;
  online: boolean;
  hvacAction: HvacAction;
  roomTempC?: number;
  targetTempC?: number;
};

function markerTone(unit: FloorplanUnit): string {
  if (!unit.online) {
    return "border-warn bg-ink/95";
  }
  if (unit.hvacAction === "heating" || unit.hvacAction === "preheat") {
    return "border-heat bg-ink/95 shadow-[0_0_18px_rgba(226,160,74,0.3)]";
  }
  if (unit.hvacAction === "cooling" || unit.hvacAction === "defrost") {
    return "border-cool bg-ink/95 shadow-[0_0_18px_rgba(90,167,188,0.3)]";
  }
  return "border-ok bg-ink/95";
}

export function FloorplanMap({
  units,
  temperatureUnit,
}: {
  units: ReadonlyArray<FloorplanUnit>;
  temperatureUnit: TemperatureUnit;
}) {
  const assignments = useMemo(
    () =>
      units.map((unit) => ({
        unit,
        zoneId: unit.mapZone ?? inferMapZone(unit),
      })),
    [units],
  );
  const firstMappedFloor =
    MAP_ZONES.find((zone) =>
      assignments.some((assignment) => assignment.zoneId === zone.id),
    )?.floor ?? "main";
  const [floor, setFloor] = useState<FloorId>(firstMappedFloor);
  const floorConfig = FLOORS.find((item) => item.id === floor) ?? FLOORS[0];
  const zones = MAP_ZONES.filter((zone) => zone.floor === floor);
  const unmapped = assignments.filter((assignment) => !assignment.zoneId);

  return (
    <section className="overflow-hidden border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            Live floorplan
          </p>
          <h2 className="text-lg text-paper">Temperature by zone</h2>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {FLOORS.map((item) => {
            const count = assignments.filter((assignment) =>
              MAP_ZONES.some(
                (zone) =>
                  zone.id === assignment.zoneId && zone.floor === item.id,
              ),
            ).length;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFloor(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide ${
                  floor === item.id
                    ? "bg-paper text-ink"
                    : "border border-line text-mist hover:text-paper"
                }`}
              >
                {item.label}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="overflow-x-auto bg-black">
        <div className="relative mx-auto min-w-[720px] max-w-[1024px]">
          <img
            src={floorConfig?.image}
            alt={`${floorConfig?.label ?? "Floor"} floorplan`}
            className="block h-auto w-full select-none"
            draggable={false}
          />
          {zones.map((zone) => {
            const matches = assignments.filter(
              (assignment) => assignment.zoneId === zone.id,
            );
            const assignment = matches[0];
            if (!assignment) {
              return null;
            }
            const { unit } = assignment;
            return (
              <Link
                key={zone.id}
                to={`/unit/${unit._id}`}
                title={`${unit.name} · ${zone.label}`}
                className={`absolute w-24 -translate-x-1/2 -translate-y-1/2 border-2 px-2 py-1.5 text-center backdrop-blur-sm transition hover:z-10 hover:scale-110 focus:z-10 focus:outline-none focus:ring-2 focus:ring-paper ${markerTone(unit)}`}
                style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
              >
                <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-mist">
                  {zone.label} · {unit.name}
                </span>
                <span className="block font-mono text-2xl leading-none text-paper">
                  {displayTemp(unit.roomTempC, temperatureUnit, 0)}
                  <span className="text-xs text-mist">°{temperatureUnit}</span>
                </span>
                <span className="mt-1 flex items-center justify-center gap-1 font-mono text-[9px] uppercase tracking-wide text-mist">
                  {!unit.online && <WifiOff size={10} aria-hidden="true" />}
                  {unit.online ? ACTION_LABELS[unit.hvacAction] : "Offline"}
                  {unit.targetTempC !== undefined &&
                    ` · ${displayTemp(unit.targetTempC, temperatureUnit, 0)}°`}
                </span>
                {matches.length > 1 && (
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-warn font-mono text-[10px] text-ink">
                    {matches.length}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-mist">
        <span className="flex items-center gap-2">
          <Layers3 size={14} aria-hidden="true" />
          Click a temperature for controls and trends
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-heat" /> Heating
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-cool" /> Cooling
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 bg-ok" /> Idle
        </span>
        {unmapped.length > 0 && (
          <span className="ml-auto">
            {unmapped.length} unassigned{" "}
            <Link to="/settings" className="text-paper underline">
              Place in Settings
            </Link>
          </span>
        )}
      </footer>
    </section>
  );
}
