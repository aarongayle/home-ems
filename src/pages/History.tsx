import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import { CondenserCompare } from "../components/CondenserCompare";
import { groupUnitsByCondenser } from "../lib/floorplan";

export function HistoryPage() {
  const { authArgs } = useAuth();
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const site = useQuery(api.settings.get, authArgs);
  const units = useQuery(api.units.list, authArgs);

  if (units === undefined || site === undefined) {
    return <p className="text-mist">Loading history…</p>;
  }

  if (units.length === 0) {
    return <p className="text-mist">Add a zone before viewing history.</p>;
  }

  const groups = groupUnitsByCondenser(units);
  const active = groups.find((group) => group.key === groupKey) ?? groups[0];
  if (!active) {
    return <p className="text-mist">Add a zone before viewing history.</p>;
  }

  return (
    <CondenserCompare
      units={active.units}
      temperatureUnit={site.temperatureUnit}
      groups={groups}
      groupKey={active.key}
      onSelectGroup={setGroupKey}
      kicker="Trends"
      title={
        active.units.length > 1
          ? `${active.label} · ${active.units.length} heads`
          : `${active.label} history`
      }
    />
  );
}
