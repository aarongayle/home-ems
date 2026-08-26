import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/Dashboard";
import { HistoryPage } from "./pages/History";
import { LoginPage } from "./pages/Login";
import { SettingsPage } from "./pages/Settings";
import { UnitDetailPage } from "./pages/UnitDetail";
import { UnlockPage } from "./pages/Unlock";

export function App() {
  const { ready, unlocking, passwordRequired, sessionToken } = useAuth();

  if (!ready) {
    return (
      <div className="ems-grid flex min-h-svh items-center justify-center text-mist">
        Connecting…
      </div>
    );
  }

  if (unlocking) {
    return (
      <div className="ems-grid flex min-h-svh items-center justify-center text-mist">
        Unlocking…
      </div>
    );
  }

  if (passwordRequired && !sessionToken) {
    return (
      <Routes>
        <Route path="/unlock" element={<UnlockPage />} />
        <Route path="/unlock/:secret" element={<UnlockPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/unlock" element={<Navigate to="/" replace />} />
      <Route path="/unlock/:secret" element={<Navigate to="/" replace />} />
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/unit/:unitId" element={<UnitDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
