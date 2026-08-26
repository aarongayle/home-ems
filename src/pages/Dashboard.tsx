import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LayoutGrid, Map } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import { FloorplanMap } from "../components/FloorplanMap";
import { UnitCard } from "../components/UnitCard";

export function DashboardPage() {
  const [view, setView] = useState<"map" | "controls">("map");
  const { authArgs } = useAuth();
  const units = useQuery(api.units.list, authArgs);
  const site = useQuery(api.settings.get, authArgs);
  const seed = useMutation(api.seed.demoHome);

  if (units === undefined || site === undefined) {
    return <p className="text-mist">Loading zones…</p>;
  }

  if (units.length === 0) {
    return (
      <div className="max-w-xl border border-line bg-panel p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
          No zones yet
        </p>
        <h2 className="mt-2 text-2xl">Bring the house online</h2>
        <p className="mt-3 text-mist">
          Add a Mitsubishi head from Settings, or load a demo home to explore
          the dashboard before the ESP32s are installed.
        </p>
        <button
          type="button"
          onClick={() => void seed(authArgs === "skip" ? {} : authArgs)}
          className="mt-5 bg-paper px-4 py-2 text-sm text-ink"
        >
          Load demo home
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            Climate overview
          </p>
          <p className="text-sm text-mist">
            {units.filter((unit) => unit.online).length} of {units.length} units online
          </p>
        </div>
        <div className="flex border border-line bg-panel p-1">
          <button
            type="button"
            onClick={() => setView("map")}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
              view === "map" ? "bg-paper text-ink" : "text-mist hover:text-paper"
            }`}
          >
            <Map size={15} aria-hidden="true" />
            Map
          </button>
          <button
            type="button"
            onClick={() => setView("controls")}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
              view === "controls"
                ? "bg-paper text-ink"
                : "text-mist hover:text-paper"
            }`}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            Controls
          </button>
        </div>
      </div>

      {view === "map" ? (
        <FloorplanMap units={units} temperatureUnit={site.temperatureUnit} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {units.map((unit) => (
            <UnitCard
              key={unit._id}
              unit={unit}
              temperatureUnit={site.temperatureUnit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
