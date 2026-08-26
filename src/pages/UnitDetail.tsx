import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../lib/auth";
import { TrendChart, withLiveReading } from "../components/TrendChart";
import { UnitCard } from "../components/UnitCard";

const RANGES = [
  { id: "12h", label: "12 h" },
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 d" },
] as const;

export function UnitDetailPage() {
  const { unitId } = useParams();
  const { authArgs } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("24h");
  const rangeMs =
    range === "12h"
      ? 12 * 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const startTs = useMemo(() => Date.now() - rangeMs, [rangeMs]);

  const typedId = unitId as Id<"units"> | undefined;
  const site = useQuery(api.settings.get, authArgs);
  const unit = useQuery(
    api.units.get,
    typedId && authArgs !== "skip" ? { ...authArgs, unitId: typedId } : "skip",
  );
  const readings = useQuery(
    api.readings.forUnit,
    typedId && authArgs !== "skip"
      ? {
          ...authArgs,
          unitId: typedId,
          startTs,
          // Open-ended so new samples stay in the live Convex subscription.
          endTs: startTs + rangeMs * 100,
        }
      : "skip",
  );

  if (!typedId) {
    return <p className="text-mist">Missing unit.</p>;
  }
  if (unit === undefined || site === undefined) {
    return <p className="text-mist">Loading unit…</p>;
  }
  if (unit === null) {
    return <p className="text-mist">Unit not found.</p>;
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="font-mono text-[11px] uppercase tracking-widest text-mist">
        ← Zones
      </Link>
      <UnitCard unit={unit} temperatureUnit={site.temperatureUnit} />
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-lg">History</h2>
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
          No samples yet. Once the ESP32 starts posting, this chart fills in.
        </p>
      ) : (
        <TrendChart
          readings={withLiveReading(readings, unit)}
          temperatureUnit={site.temperatureUnit}
          showSat={unit.supplyAirTempC !== undefined}
        />
      )}
    </div>
  );
}
