import type { JSX } from "@solidjs/web";
import { createContext, createEffect, createSignal, untrack, useContext } from "solid-js";
import { api, ApiError } from "../api/client";

/** Account-level role: admin ⊃ teacher ⊃ user. */
export type AccountRole = "admin" | "teacher" | "user";

/** Per-class membership role, assigned by an admin when provisioning accounts. */
export type Membership = { classId: string; className: string; role: "student" | "teacher" };

export type AuthUser = { id: string; studentNo: string; name: string; role: AccountRole };

export type AuthSession = { user: AuthUser; memberships: Membership[] };

export type AuthState =
  | { status: "loading"; session: null }
  | { status: "anonymous"; session: null }
  | { status: "authenticated"; session: AuthSession };

export type AuthContextValue = {
  readonly status: AuthState["status"];
  readonly session: AuthSession | null;
  /** Primary class for the classroom flow (first membership). */
  readonly primaryMembership: Membership | null;
  /** The signed-in account's global role. */
  readonly role: AccountRole | null;
  login: (input: { studentNo: string; password: string }) => Promise<void>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function isStaffRole(role: AccountRole | null | undefined): boolean {
  return role === "teacher" || role === "admin";
}

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: "管理员",
  teacher: "教师",
  user: "学生",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: {
  children?: JSX.Element;
  /** Tests inject a resolved state to skip the network round trip. */
  initialState?: AuthState;
}) {
  const [state, setState] = createSignal<AuthState>(
    untrack(() => props.initialState) ?? { status: "loading", session: null },
  );

  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const refresh = async (attempt = 0): Promise<void> => {
    try {
      const session = await api.get<AuthSession>("/api/auth/me");
      if (!disposed) setState({ status: "authenticated", session });
    } catch (error) {
      if (disposed) return;
      // A 401 is definitive "not signed in". Anything else (offline, proxy
      // restart, 5xx) is transient: keep the current state and back off,
      // so a blip never bounces a signed-in learner to the login page.
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "anonymous", session: null });
        return;
      }
      if (attempt < 3) {
        retryTimer = setTimeout(() => void refresh(attempt + 1), 1500 * (attempt + 1));
        return;
      }
      setState((current) =>
        current.status === "authenticated" ? current : { status: "anonymous", session: null },
      );
    }
  };

  createEffect(
    () => props.initialState,
    (initial) => {
      disposed = false;
      if (initial) {
        setState(initial);
        return () => {
          disposed = true;
          if (retryTimer !== null) clearTimeout(retryTimer);
        };
      }
      void refresh();
      const onVisible = () => {
        if (document.visibilityState === "visible") void refresh();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        disposed = true;
        if (retryTimer !== null) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
  );

  const login = async (input: { studentNo: string; password: string }) => {
    const session = await api.post<AuthSession>("/api/auth/login", input);
    setState({ status: "authenticated", session });
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setState({ status: "anonymous", session: null });
  };

  const changePassword = async (input: { currentPassword: string; newPassword: string }) => {
    await api.post("/api/auth/change-password", input);
  };

  const value: AuthContextValue = {
    get status() {
      return state().status;
    },
    get session() {
      return state().session;
    },
    get primaryMembership() {
      return state().session?.memberships[0] ?? null;
    },
    get role() {
      return state().session?.user.role ?? null;
    },
    login,
    changePassword,
    logout,
    refresh,
  };

  return <AuthContext value={value}>{props.children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
