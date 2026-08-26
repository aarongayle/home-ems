import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../lib/auth";
import { TrendChart, withLiveReading } from "../components/TrendChart";

const RANGES = [
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 d" },
] as const;

export function HistoryPage() {
  const { authArgs } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("24h");
  const [selectedId, setSelectedId] = useState<Id<"units"> | null>(null);
  const rangeMs = range === "7d" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const startTs = useMemo(() => Date.now() - rangeMs, [rangeMs]);

  const site = useQuery(api.settings.get, authArgs);
  const units = useQuery(api.units.list, authArgs);
  const activeId = selectedId ?? units?.[0]?._id;
  const readings = useQuery(
    api.readings.forUnit,
    activeId && authArgs !== "skip"
      ? {
          ...authArgs,
          unitId: activeId,
          startTs,
          // Open-ended so new samples stay in the live Convex subscription.
          endTs: startTs + rangeMs * 100,
        }
      : "skip",
  );

  if (units === undefined || site === undefined) {
    return <p className="text-mist">Loading history…</p>;
  }

  if (units.length === 0) {
    return <p className="text-mist">Add a zone before viewing history.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            Trends
          </p>
          <h2 className="text-2xl">Zone history</h2>
        </div>
        <select
          value={activeId}
          onChange={(event) => setSelectedId(event.target.value as Id<"units">)}
          className="border border-line bg-panel px-3 py-2 text-sm"
        >
          {units.map((unit) => (
            <option key={unit._id} value={unit._id}>
              {unit.name}
            </option>
          ))}
        </select>
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
      {readings === undefined ? (
        <p className="text-mist">Loading trend…</p>
      ) : readings.length === 0 ? (
        <p className="border border-line bg-panel p-6 text-mist">
          No samples in this window.
        </p>
      ) : (
        <TrendChart
          readings={withLiveReading(
            readings,
            units.find((unit) => unit._id === activeId),
          )}
          temperatureUnit={site.temperatureUnit}
        />
      )}
    </div>
  );
}
