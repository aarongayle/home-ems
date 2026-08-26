import type { Doc } from "../_generated/dataModel";
import type {
  ClimateMode,
  FanMode,
  HvacAction,
} from "./types";

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Name must include letters or numbers");
  }
  return slug;
}

export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function sanitizeOutdoorTempC(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  // Mitsubishi reports -63.5 C on some outdoor units when idle / unsupported.
  if (value < -50) {
    return undefined;
  }
  return value;
}

const CLIMATE_MODES: ReadonlyArray<ClimateMode> = [
  "off",
  "auto",
  "cool",
  "heat",
  "dry",
  "fan_only",
  "heat_cool",
];

const FAN_MODES: ReadonlyArray<FanMode> = [
  "auto",
  "quiet",
  "low",
  "medium",
  "high",
];

const HVAC_ACTIONS: ReadonlyArray<HvacAction> = [
  "off",
  "idle",
  "cooling",
  "heating",
  "drying",
  "fan",
  "defrost",
  "preheat",
];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, "_");
}

export function parseClimateMode(value: unknown): ClimateMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const key = normalizeKey(value);
  const aliases: Record<string, ClimateMode> = {
    off: "off",
    auto: "auto",
    cool: "cool",
    cooling: "cool",
    heat: "heat",
    heating: "heat",
    dry: "dry",
    fan: "fan_only",
    fan_only: "fan_only",
    fanonly: "fan_only",
    heat_cool: "heat_cool",
    heatcool: "heat_cool",
    auto_heat_cool: "heat_cool",
  };
  const mapped = aliases[key];
  if (mapped && CLIMATE_MODES.includes(mapped)) {
    return mapped;
  }
  return undefined;
}

export function parseFanMode(value: unknown): FanMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const key = normalizeKey(value);
  const aliases: Record<string, FanMode> = {
    auto: "auto",
    quiet: "quiet",
    silent: "quiet",
    low: "low",
    medium: "medium",
    med: "medium",
    mid: "medium",
    high: "high",
  };
  const mapped = aliases[key];
  if (mapped && FAN_MODES.includes(mapped)) {
    return mapped;
  }
  return undefined;
}

export function parseHvacAction(value: unknown): HvacAction | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const key = normalizeKey(value);
  const aliases: Record<string, HvacAction> = {
    off: "off",
    idle: "idle",
    cooling: "cooling",
    heating: "heating",
    drying: "drying",
    fan: "fan",
    defrost: "defrost",
    preheat: "preheat",
  };
  const mapped = aliases[key];
  if (mapped && HVAC_ACTIONS.includes(mapped)) {
    return mapped;
  }
  return undefined;
}

export function toPublicUnit(
  unit: Doc<"units">,
  pendingCommandCount: number,
) {
  const { deviceTokenHash: _deviceTokenHash, ...rest } = unit;
  return { ...rest, pendingCommandCount };
}

export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
