export type TemperatureUnit = "C" | "F";

export type ClimateMode =
  | "off"
  | "auto"
  | "cool"
  | "heat"
  | "dry"
  | "fan_only"
  | "heat_cool";

export type FanMode = "auto" | "quiet" | "low" | "medium" | "high";

export type HvacAction =
  | "off"
  | "idle"
  | "cooling"
  | "heating"
  | "drying"
  | "fan"
  | "defrost"
  | "preheat";

export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function fToC(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function displayTemp(
  celsius: number | undefined,
  unit: TemperatureUnit,
  digits = 1,
): string {
  if (celsius === undefined) {
    return "—";
  }
  const value = unit === "F" ? cToF(celsius) : celsius;
  return value.toFixed(digits);
}

export function stepTargetC(
  currentC: number,
  direction: 1 | -1,
  unit: TemperatureUnit,
): number {
  const deltaC = unit === "F" ? 5 / 9 : 0.5;
  return roundHalf(currentC + direction * deltaC);
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function convexSiteUrl(cloudUrl: string): string {
  return cloudUrl.replace(/\.convex\.cloud\/?$/, ".convex.site");
}

export const MODE_LABELS: Record<ClimateMode, string> = {
  off: "Off",
  auto: "Auto",
  cool: "Cool",
  heat: "Heat",
  dry: "Dry",
  fan_only: "Fan",
  heat_cool: "Heat/Cool",
};

export const FAN_LABELS: Record<FanMode, string> = {
  auto: "Auto",
  quiet: "Quiet",
  low: "Low",
  medium: "Med",
  high: "High",
};

export const ACTION_LABELS: Record<HvacAction, string> = {
  off: "Off",
  idle: "Idle",
  cooling: "Cooling",
  heating: "Heating",
  drying: "Drying",
  fan: "Fan",
  defrost: "Defrost",
  preheat: "Preheat",
};

export function actionTone(action: HvacAction, online: boolean): string {
  if (!online) return "text-warn";
  if (action === "heating" || action === "preheat") return "text-heat";
  if (action === "cooling") return "text-cool";
  if (action === "defrost") return "text-cool";
  return "text-mist";
}
