export type MapZone =
  | "ms-1-1"
  | "ms-1-2"
  | "ms-2-1"
  | "ms-2-2"
  | "ms-3-1"
  | "ms-3-2"
  | "ms-4-1"
  | "ms-4-2";

export type CondenserId = "ms-1" | "ms-2" | "ms-3" | "ms-4";

export const CONDENSERS: ReadonlyArray<{
  id: CondenserId;
  label: string;
}> = [
  { id: "ms-1", label: "MS-1" },
  { id: "ms-2", label: "MS-2" },
  { id: "ms-3", label: "MS-3" },
  { id: "ms-4", label: "MS-4" },
];

export type FloorId = "main" | "upper";

export type FloorplanZone = {
  id: MapZone;
  label: string;
  room: string;
  floor: FloorId;
  x: number;
  y: number;
};

export const FLOORS: ReadonlyArray<{
  id: FloorId;
  label: string;
  image: string;
}> = [
  { id: "main", label: "Main floor", image: "/floorplan-main.svg" },
  { id: "upper", label: "Upper floor", image: "/floorplan-upper.svg" },
];

export const MAP_ZONES: ReadonlyArray<FloorplanZone> = [
  {
    id: "ms-1-1",
    label: "MS-1-1",
    room: "Primary bedroom",
    floor: "main",
    x: 46,
    y: 17,
  },
  {
    id: "ms-4-1",
    label: "MS-4-1",
    room: "Primary bath",
    floor: "main",
    x: 61,
    y: 17,
  },
  {
    id: "ms-2-1",
    label: "MS-2-1",
    room: "Guest dwelling",
    floor: "main",
    x: 81,
    y: 77,
  },
  {
    id: "ms-2-2",
    label: "MS-2-2",
    room: "Study",
    floor: "main",
    x: 46,
    y: 75,
  },
  {
    id: "ms-3-1",
    label: "MS-3-1",
    room: "Bedroom 3",
    floor: "main",
    x: 14,
    y: 54,
  },
  {
    id: "ms-3-2",
    label: "MS-3-2",
    room: "Family room",
    floor: "main",
    x: 37,
    y: 50,
  },
  {
    id: "ms-1-2",
    label: "MS-1-2",
    room: "Theater",
    floor: "upper",
    x: 66,
    y: 24,
  },
  {
    id: "ms-4-2",
    label: "MS-4-2",
    room: "Loft & open to family room",
    floor: "upper",
    x: 49,
    y: 69,
  },
];

const ALIASES: ReadonlyArray<[MapZone, ReadonlyArray<string>]> = [
  ["ms-2-1", ["mil suite", "mother in law", "mother-in-law", "guest dwelling"]],
  ["ms-1-1", ["primary bedroom", "master bedroom"]],
  ["ms-1-2", ["theater"]],
  ["ms-2-2", ["study", "office"]],
  ["ms-3-1", ["bedroom 3", "bedroom #3"]],
  ["ms-4-1", ["primary bath", "master bath"]],
  // Listed before ms-3-2 so "open to family room" is not claimed by the family room.
  ["ms-4-2", ["loft", "bonus room", "open to family room"]],
  ["ms-3-2", ["family room", "kitchen", "living room"]],
];

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function inferMapZone(unit: {
  slug: string;
  name: string;
  room: string;
}): MapZone | undefined {
  const source = normalized(`${unit.slug} ${unit.name} ${unit.room}`);
  const explicit = MAP_ZONES.find((zone) => source.includes(normalized(zone.id)));
  if (explicit) {
    return explicit.id;
  }
  return ALIASES.find(([, aliases]) =>
    aliases.some((alias) => source.includes(alias)),
  )?.[0];
}

export function condenserFromZone(zone: MapZone): CondenserId {
  return zone.replace(/-\d+$/, "") as CondenserId;
}

export type CondenserGroup<T> = {
  key: string;
  label: string;
  condenserId?: CondenserId;
  units: T[];
};

type ZoneUnit = {
  _id: string;
  slug: string;
  name: string;
  room: string;
  mapZone?: MapZone;
};

function zoneForUnit(unit: ZoneUnit): MapZone | undefined {
  return unit.mapZone ?? inferMapZone(unit);
}

function zoneSortKey(unit: ZoneUnit): string {
  return zoneForUnit(unit) ?? unit.name;
}

export function groupUnitsByCondenser<T extends ZoneUnit>(
  units: ReadonlyArray<T>,
): CondenserGroup<T>[] {
  const buckets = new Map<string, CondenserGroup<T>>();

  for (const unit of units) {
    const zone = zoneForUnit(unit);
    if (zone) {
      const condenserId = condenserFromZone(zone);
      const existing = buckets.get(condenserId);
      if (existing) {
        existing.units.push(unit);
      } else {
        const meta = CONDENSERS.find((item) => item.id === condenserId);
        buckets.set(condenserId, {
          key: condenserId,
          label: meta?.label ?? condenserId.toUpperCase(),
          condenserId,
          units: [unit],
        });
      }
    } else {
      buckets.set(unit._id, {
        key: unit._id,
        label: unit.name,
        units: [unit],
      });
    }
  }

  for (const group of buckets.values()) {
    group.units.sort((a, b) => zoneSortKey(a).localeCompare(zoneSortKey(b)));
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.condenserId && b.condenserId) {
      return a.condenserId.localeCompare(b.condenserId);
    }
    if (a.condenserId) return -1;
    if (b.condenserId) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function groupForUnit<T extends ZoneUnit>(
  units: ReadonlyArray<T>,
  unitId: string,
): CondenserGroup<T> | undefined {
  return groupUnitsByCondenser(units).find((group) =>
    group.units.some((unit) => unit._id === unitId),
  );
}
