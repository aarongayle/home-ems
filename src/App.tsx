import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/Dashboard";
import { HistoryPage } from "./pages/History";
import { LoginPage } from "./pages/Login";
import { SettingsPage } from "./pages/Settings";
import { UnitDetailPage } from "./pages/UnitDetail";

export function App() {
  const { ready, passwordRequired, sessionToken } = useAuth();

  if (!ready) {
    return (
      <div className="ems-grid flex min-h-svh items-center justify-center text-mist">
        Connecting…
      </div>
    );
  }

  if (passwordRequired && !sessionToken) {
    return <LoginPage />;
  }

  return (
    <Routes>
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
