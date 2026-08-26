import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import { convexSiteUrl } from "../lib/format";
import { esphomeSnippet } from "../lib/esphome";
import { MAP_ZONES, type MapZone } from "../lib/floorplan";
import type { Id } from "../../convex/_generated/dataModel";

export function SettingsPage() {
  const { authArgs } = useAuth();
  const site = useQuery(api.settings.get, authArgs);
  const units = useQuery(api.units.list, authArgs);
  const updateSite = useMutation(api.settings.update);
  const createUnit = useMutation(api.units.create);
  const renameUnit = useMutation(api.units.rename);
  const setMapZone = useMutation(api.units.setMapZone);
  const rotateToken = useMutation(api.units.rotateToken);
  const removeUnit = useMutation(api.units.remove);
  const seed = useMutation(api.seed.demoHome);

  const [homeName, setHomeName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [issued, setIssued] = useState<{
    unitId: Id<"units">;
    slug: string;
    name: string;
    deviceToken: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cloudUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  const siteUrl = cloudUrl ? convexSiteUrl(cloudUrl) : "";
  const session = authArgs === "skip" ? {} : authArgs;

  if (site === undefined || units === undefined) {
    return <p className="text-mist">Loading settings…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-5">
        <div className="border border-line bg-panel p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            Site
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-mist">
              Home name
              <input
                value={homeName ?? site.homeName}
                onChange={(event) => setHomeName(event.target.value)}
                className="mt-1 w-full border border-line bg-ink px-3 py-2 text-paper"
              />
            </label>
            <div className="flex gap-2">
              {(["F", "C"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() =>
                    void updateSite({ ...session, temperatureUnit: unit })
                  }
                  className={`px-3 py-1.5 text-sm ${
                    site.temperatureUnit === unit
                      ? "bg-paper text-ink"
                      : "border border-line text-mist"
                  }`}
                >
                  °{unit}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                void updateSite({
                  ...session,
                  homeName: (homeName ?? site.homeName).trim() || site.homeName,
                })
              }
              className="bg-paper px-4 py-2 text-sm text-ink"
            >
              Save site
            </button>
          </div>
        </div>

        <div className="border border-line bg-panel p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
            Add unit
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              void createUnit({ ...session, name, room })
                .then((result) => {
                  setIssued({ ...result, name });
                  setName("");
                  setRoom("");
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Could not add unit");
                });
            }}
          >
            <input
              required
              placeholder="Living Room"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full border border-line bg-ink px-3 py-2"
            />
            <input
              required
              placeholder="Main floor"
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              className="w-full border border-line bg-ink px-3 py-2"
            />
            <button type="submit" className="bg-paper px-4 py-2 text-sm text-ink">
              Create unit
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-warn">{error}</p>}
          {units.length === 0 && (
            <button
              type="button"
              className="mt-4 text-sm text-mist underline"
              onClick={() => void seed(session)}
            >
              Or load demo home
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        {issued && (
          <div className="border border-heat bg-panel p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-heat">
              Device token — shown once
            </p>
            <p className="mt-2 font-mono text-sm break-all">{issued.deviceToken}</p>
            <p className="mt-3 text-sm text-mist">
              Put this in the ESPHome YAML. Ingest URL: {siteUrl}/ingest
            </p>
            <pre className="mt-3 max-h-64 overflow-auto bg-ink p-3 font-mono text-[11px] leading-5">
              {esphomeSnippet({
                slug: issued.slug,
                name: issued.name,
                convexSiteUrl: siteUrl,
                deviceToken: issued.deviceToken,
              })}
            </pre>
          </div>
        )}

        {units.map((unit) => (
          <article key={unit._id} className="border border-line bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg">{unit.name}</h3>
                <p className="font-mono text-[11px] text-mist">
                  {unit.slug} · {unit.online ? "online" : "offline"}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-warn"
                onClick={() => {
                  if (confirm(`Remove ${unit.name}?`)) {
                    void removeUnit({ ...session, unitId: unit._id });
                  }
                }}
              >
                Remove
              </button>
            </div>
            <label className="mt-4 block text-sm text-mist">
              Floorplan zone
              <select
                value={unit.mapZone ?? ""}
                onChange={(event) => {
                  setError(null);
                  const value = event.target.value;
                  void setMapZone({
                    ...session,
                    unitId: unit._id,
                    mapZone: value ? (value as MapZone) : undefined,
                  }).catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not place unit on floorplan",
                    );
                  });
                }}
                className="mt-1 w-full border border-line bg-ink px-3 py-2 text-paper"
              >
                <option value="">Auto / not assigned</option>
                {MAP_ZONES.map((zone) => {
                  const occupied = units.some(
                    (candidate) =>
                      candidate._id !== unit._id &&
                      candidate.mapZone === zone.id,
                  );
                  return (
                    <option key={zone.id} value={zone.id} disabled={occupied}>
                      {zone.label} — {zone.room}
                      {occupied ? " (assigned)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void renameUnit({
                  ...session,
                  unitId: unit._id,
                  name: String(form.get("name") ?? unit.name),
                  room: String(form.get("room") ?? unit.room),
                });
              }}
            >
              <input
                name="name"
                defaultValue={unit.name}
                className="border border-line bg-ink px-3 py-2 text-sm"
              />
              <input
                name="room"
                defaultValue={unit.room}
                className="border border-line bg-ink px-3 py-2 text-sm"
              />
              <button type="submit" className="border border-line px-3 py-2 text-sm">
                Rename
              </button>
              <button
                type="button"
                className="border border-line px-3 py-2 text-sm"
                onClick={() => {
                  void rotateToken({ ...session, unitId: unit._id }).then((result) => {
                    setIssued({
                      unitId: unit._id,
                      slug: unit.slug,
                      name: unit.name,
                      deviceToken: result.deviceToken,
                    });
                  });
                }}
              >
                New token
              </button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
