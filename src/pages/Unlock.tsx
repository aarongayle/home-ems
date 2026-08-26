import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LoginPage } from "./Login";

export function UnlockPage() {
  const { unlocking, sessionToken, passwordRequired, unlockError } = useAuth();

  if (sessionToken || !passwordRequired) {
    return <Navigate to="/" replace />;
  }
  if (unlocking) {
    return (
      <div className="ems-grid flex min-h-svh items-center justify-center text-mist">
        Unlocking…
      </div>
    );
  }
  if (unlockError) {
    return <LoginPage />;
  }
  return <Navigate to="/" replace />;
}
