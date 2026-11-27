import { LayoutHost } from "../shared/layout/host";
import { AccountMenu } from "../shared/auth";
import {
  memoryHistory,
  useLocation,
  useNavigate,
  type MemoryHistoryAdapter,
  type Navigator,
} from "@solidjs/router";
import { render, waitFor } from "@solidjs/testing-library";
import { flush, Loading } from "solid-js";
import { AuthProvider, type AuthState } from "../shared/auth";
import { createAppRouter } from "../app/router";

/** Default harness identity for authenticated page tests. */
export const teacherAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const adminAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const anonymousAuthState: AuthState = { status: "anonymous", session: null };

export const studentAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20240101", name: "学生", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
  },
};

export type RenderAppOptions = { auth?: AuthState };

export type TestHistory = MemoryHistoryAdapter & {
  readonly length: number;
};

function createTrackedMemoryHistory(initial: string): TestHistory {
  const inner = memoryHistory(initial);
  const entries = [initial];
  let index = 0;

  return {
    get: () => inner.get(),
    set: (next) => {
      if (next.replace) {
        entries[index] = next.value;
      } else {
        entries.splice(index + 1, entries.length - index, next.value);
        index += 1;
      }
      inner.set(next);
    },
    go: (delta) => {
      index = Math.max(0, Math.min(index + delta, entries.length - 1));
      inner.go(delta);
    },
    back: () => {
      index = Math.max(0, index - 1);
      inner.back();
    },
    forward: () => {
      index = Math.min(entries.length - 1, index + 1);
      inner.forward();
    },
    listen: inner.listen,
    init: inner.init,
    utils: inner.utils,
    get length() {
      return entries.length;
    },
  };
}

export async function renderAppAt(initialEntry: string, options: RenderAppOptions = {}) {
  const auth = options.auth ?? adminAuthState;
  const history = createTrackedMemoryHistory(initialEntry);
  const AppRouter = createAppRouter({ history });

  let navigateFn: Navigator | null = null;
  let currentPathname = () => new URL(history.get(), "http://localhost").pathname;
  let currentSearch = () => new URL(history.get(), "http://localhost").search;

  function RouterBridge(props: { children?: import("@solidjs/web").JSX.Element }) {
    const nav = useNavigate();
    const loc = useLocation();
    navigateFn = nav;
    currentPathname = () => loc.pathname;
    currentSearch = () => loc.search;
    return (
      <AuthProvider initialState={auth}>
        <Loading
          fallback={
            <p class="home-loading" role="status">
              正在载入…
            </p>
          }
        >
          <LayoutHost account={() => <AccountMenu />}>{props.children}</LayoutHost>
        </Loading>
      </AuthProvider>
    );
  }

  const rendered = render(() => (
    <AppRouter>
      {(props) => (
        <RouterBridge>
          <LayoutHost account={() => <AccountMenu />}>{props.children}</LayoutHost>
        </RouterBridge>
      )}
    </AppRouter>
  ));

  flush();
  await waitFor(() => {
    if (navigateFn === null) throw new Error("Router not ready");
  });
  await Promise.resolve();
  flush();

  const routerHandle = {
    get location() {
      const url = new URL(history.get(), "http://localhost");
      return {
        pathname: currentPathname(),
        search: currentSearch(),
        searchParams: url.searchParams,
      };
    },
    navigate: (to: string, navOptions?: { replace?: boolean }) => {
      navigateFn?.(to, navOptions);
      flush();
    },
    match: AppRouter.match,
    routes: AppRouter.routes,
  };

  return { ...rendered, history, router: routerHandle };
}
