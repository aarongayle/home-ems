import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const STORAGE_KEY = "home-ems-session";

type AuthContextValue = {
  ready: boolean;
  passwordRequired: boolean;
  sessionToken: string | null;
  authArgs: { sessionToken?: string } | "skip";
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

  const passwordRequired = status?.passwordRequired ?? false;
  const ready = status !== undefined;

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

  const value = useMemo(
    () => ({
      ready,
      passwordRequired,
      sessionToken,
      authArgs,
      login,
      logout,
    }),
    [authArgs, login, logout, passwordRequired, ready, sessionToken],
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
