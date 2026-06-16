import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const PASS_KEY = "auth_admin_pass_v1";
const SESSION_KEY = "auth_admin_session_v1";

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type AuthCtx = {
  ready: boolean;
  hasPassword: boolean;
  isAuthenticated: boolean;
  setPassword: (pwd: string) => Promise<void>;
  login: (pwd: string) => Promise<boolean>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    try {
      setHasPassword(!!localStorage.getItem(PASS_KEY));
      setIsAuthenticated(sessionStorage.getItem(SESSION_KEY) === "1");
    } catch {}
    setReady(true);
  }, []);

  const setPassword = useCallback(async (pwd: string) => {
    const h = await sha256(pwd);
    localStorage.setItem(PASS_KEY, h);
    sessionStorage.setItem(SESSION_KEY, "1");
    setHasPassword(true);
    setIsAuthenticated(true);
  }, []);

  const login = useCallback(async (pwd: string) => {
    const stored = localStorage.getItem(PASS_KEY);
    if (!stored) return false;
    const h = await sha256(pwd);
    if (h !== stored) return false;
    sessionStorage.setItem(SESSION_KEY, "1");
    setIsAuthenticated(true);
    return true;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ ready, hasPassword, isAuthenticated, setPassword, login, logout }),
    [ready, hasPassword, isAuthenticated, setPassword, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}