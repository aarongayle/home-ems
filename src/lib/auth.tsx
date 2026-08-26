import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { takeUnlockSecret } from "./unlock";

const STORAGE_KEY = "home-ems-session";
let unlockAttempted = false;

type AuthContextValue = {
  ready: boolean;
  unlocking: boolean;
  passwordRequired: boolean;
  sessionToken: string | null;
  authArgs: { sessionToken?: string } | "skip";
  unlockError: string | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const status = useQuery(api.auth.status);
  const loginMutation = useMutation(api.auth.login);
  const logoutMutation = useMutation(api.auth.logout);
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockInFlight, setUnlockInFlight] = useState(
    () => Boolean(takeUnlockSecret()) && !localStorage.getItem(STORAGE_KEY),
  );

  const passwordRequired = status?.passwordRequired ?? false;
  const ready = status !== undefined;
  const unlocking =
    unlockInFlight && !sessionToken && (!ready || passwordRequired);

  const authArgs = useMemo(() => {
    if (!ready) return "skip" as const;
    if (passwordRequired && !sessionToken) return "skip" as const;
    return { sessionToken: sessionToken ?? undefined };
  }, [passwordRequired, ready, sessionToken]);

  const login = useCallback(
    async (password: string) => {
      const result = await loginMutation({ password });
      localStorage.setItem(STORAGE_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      setUnlockError(null);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    if (sessionToken) {
      await logoutMutation({ sessionToken });
    }
    localStorage.removeItem(STORAGE_KEY);
    setSessionToken(null);
  }, [logoutMutation, sessionToken]);

  useEffect(() => {
    const tryUnlock = () => {
      const secret = takeUnlockSecret();
      if (!secret || !ready || !passwordRequired || sessionToken) {
        return;
      }
      if (unlockAttempted) return;
      unlockAttempted = true;
      setUnlockInFlight(true);
      void login(secret)
        .catch((err: unknown) => {
          setUnlockError(
            err instanceof Error ? err.message : "Could not unlock",
          );
        })
        .finally(() => {
          setUnlockInFlight(false);
        });
    };
    tryUnlock();
    window.addEventListener("hashchange", tryUnlock);
    return () => window.removeEventListener("hashchange", tryUnlock);
  }, [login, passwordRequired, ready, sessionToken]);

  const value = useMemo(
    () => ({
      ready,
      unlocking,
      passwordRequired,
      sessionToken,
      authArgs,
      unlockError,
      login,
      logout,
    }),
    [
      authArgs,
      login,
      logout,
      passwordRequired,
      ready,
      sessionToken,
      unlockError,
      unlocking,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
