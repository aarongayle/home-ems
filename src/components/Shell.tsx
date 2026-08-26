import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import { displayTemp, formatClock } from "../lib/format";

const links = [
  { to: "/", label: "Zones" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

export function Shell() {
  const { authArgs, logout, passwordRequired } = useAuth();
  const site = useQuery(api.settings.get, authArgs);
  const now = formatClock(Date.now());

  return (
    <div className="ems-grid min-h-svh">
      <header className="border-b border-line bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
              Home EMS
            </p>
            <h1 className="truncate text-lg font-medium text-paper">
              {site?.homeName ?? "Home"}
            </h1>
          </div>
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="font-mono text-[11px] uppercase tracking-widest text-mist">
              Outdoor
            </span>
            <span className="font-mono text-2xl text-paper">
              {displayTemp(site?.outdoorTempC, site?.temperatureUnit ?? "F", 0)}
              <span className="ml-1 text-sm text-mist">
                °{site?.temperatureUnit ?? "F"}
              </span>
            </span>
          </div>
          <nav className="ml-auto flex items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${
                    isActive
                      ? "bg-panel-2 text-paper"
                      : "text-mist hover:text-paper"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {passwordRequired && (
              <button
                type="button"
                onClick={() => void logout()}
                className="ml-2 text-sm text-mist hover:text-paper"
              >
                Lock
              </button>
            )}
            <span className="ml-3 hidden font-mono text-xs text-mist md:inline">
              {now}
            </span>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
