export type MapZone =
  | "ms-1-1"
  | "ms-1-2"
  | "ms-1-3"
  | "ms-2-1"
  | "ms-2-2"
  | "ms-3-1"
  | "ms-3-2";

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
    x: 48,
    y: 20,
  },
  {
    id: "ms-1-2",
    label: "MS-1-2",
    room: "Primary bath",
    floor: "main",
    x: 60,
    y: 20,
  },
  {
    id: "ms-2-1",
    label: "MS-2-1",
    room: "Guest dwelling",
    floor: "main",
    x: 76,
    y: 76,
  },
  {
    id: "ms-2-2",
    label: "MS-2-2",
    room: "Study",
    floor: "main",
    x: 47,
    y: 74,
  },
  {
    id: "ms-3-1",
    label: "MS-3-1",
    room: "Bedroom 3",
    floor: "main",
    x: 21,
    y: 55,
  },
  {
    id: "ms-3-2",
    label: "MS-3-2",
    room: "Family room",
    floor: "main",
    x: 40,
    y: 51,
  },
  {
    id: "ms-1-3",
    label: "MS-1-3",
    room: "Theater",
    floor: "upper",
    x: 55,
    y: 22,
  },
];

const ALIASES: ReadonlyArray<[MapZone, ReadonlyArray<string>]> = [
  ["ms-2-1", ["mil suite", "mother in law", "mother-in-law", "guest dwelling"]],
  ["ms-1-1", ["primary bedroom", "master bedroom"]],
  ["ms-1-2", ["primary bath", "master bath"]],
  ["ms-1-3", ["theater"]],
  ["ms-2-2", ["study", "office"]],
  ["ms-3-1", ["bedroom 3", "bedroom #3"]],
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
