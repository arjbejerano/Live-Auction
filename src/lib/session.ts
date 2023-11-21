import { useCallback, useEffect, useState } from "react";
import type { Role, SessionUser } from "./auction-types";

/**
 * Simulated auth. A real build would swap this for Cloud auth + a user_roles
 * table; the rest of the app only depends on the SessionUser shape below.
 */
const STORAGE_KEY = "auction.session";
const EVENT = "auction-session-change";

const BUYER_NAMES = ["Marcus V.", "Lena K.", "Priya R.", "Dmitri S.", "Chloe B.", "Yusuf A."];

export function readSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signIn(role: Role, name?: string): SessionUser {
  const user: SessionUser = {
    id: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
    name:
      name?.trim() ||
      (role === "ADMIN"
        ? "Auctioneer"
        : BUYER_NAMES[Math.floor(Math.random() * BUYER_NAMES.length)]),
    role,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(EVENT));
  return user;
}

export function signOut() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Session state, kept in sync across tabs and within the tab. */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => setUser(readSession()), []);

  useEffect(() => {
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  return { user, ready };
}
