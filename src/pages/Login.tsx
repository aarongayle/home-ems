import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    }
  };

  return (
    <div className="ems-grid flex min-h-svh items-center justify-center px-5">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="w-full max-w-sm border border-line bg-panel p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
          Home EMS
        </p>
        <h1 className="mt-2 text-2xl">Household access</h1>
        <p className="mt-2 text-sm text-mist">
          Enter the password set as HOUSEHOLD_PASSWORD on the Convex deployment.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-5 w-full border border-line bg-ink px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-warn">{error}</p>}
        <button type="submit" className="mt-4 w-full bg-paper py-2 text-ink">
          Unlock
        </button>
      </form>
    </div>
  );
}
