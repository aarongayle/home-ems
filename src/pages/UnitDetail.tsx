import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../lib/auth";
import { CondenserCompare } from "../components/CondenserCompare";
import { groupForUnit, groupUnitsByCondenser } from "../lib/floorplan";

export function UnitDetailPage() {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const { authArgs } = useAuth();
  const typedId = unitId as Id<"units"> | undefined;
  const site = useQuery(api.settings.get, authArgs);
  const units = useQuery(api.units.list, authArgs);

  if (!typedId) {
    return <p className="text-mist">Missing unit.</p>;
  }
  if (units === undefined || site === undefined) {
    return <p className="text-mist">Loading unit…</p>;
  }

  const groups = groupUnitsByCondenser(units);
  const group = groupForUnit(units, typedId);
  if (!group) {
    return <p className="text-mist">Unit not found.</p>;
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="font-mono text-[11px] uppercase tracking-widest text-mist">
        ← Zones
      </Link>
      <CondenserCompare
        units={group.units}
        temperatureUnit={site.temperatureUnit}
        groups={groups}
        groupKey={group.key}
        onSelectGroup={(key) => {
          const next = groups.find((item) => item.key === key)?.units[0];
          if (next) {
            void navigate(`/unit/${next._id}`);
          }
        }}
        kicker={group.label}
        title={
          group.units.length > 1
            ? `${group.units.length} indoor heads`
            : (group.units[0]?.name ?? "History")
        }
      />
    </div>
  );
}
