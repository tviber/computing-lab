import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  useParams,
  type RouterHistory,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { normalizeBasePath } from "../shared/basePath";
import { useAuth } from "../shared/auth";
import { LabAccessGate } from "../shared/lab/LabGate";
import { useLabCatalog } from "../shared/lab/labs";
import { LAB_IDS, labMetadata, type LabId } from "../shared/lab/labMetadata";
import { APP_LABS } from "./labRegistry";
import { HomePage } from "./pages/HomePage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LabRedirectPage } from "./pages/LabRedirectPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function RootLayout() {
  return <Outlet />;
}

function resolveRuntimeBasePath(configuredBasePath: string): string {
  if (configuredBasePath === "/" || typeof window === "undefined") return configuredBasePath;
  const pathname = window.location.pathname;
  const isConfiguredPath =
    pathname === configuredBasePath || pathname.startsWith(`${configuredBasePath}/`);
  return isConfiguredPath ? configuredBasePath : "/";
}

const configuredBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export type AppRouterOptions = {
  history?: RouterHistory;
  basepath?: string;
};

export const passThroughSearch = (search: Record<string, unknown>): Record<string, unknown> =>
  search;

function GuardedLabRoute({ labId }: { labId: LabId }) {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const Component = APP_LABS[labId].component;
  return (
    <LabAccessGate
      checkingAccess={status === "authenticated" && role !== "admin" && catalog === null}
      classId={classId}
      closed={catalog?.get(labId)?.visible === false}
      labName={labMetadata[labId].title}
      noClassHint="请联系管理员把你的账号分配到班级后再开始实验。"
      role={role}
      status={status}
    >
      <Suspense
        fallback={
          <p className="home-loading" role="status">
            正在载入…
          </p>
        }
      >
        <Component />
      </Suspense>
    </LabAccessGate>
  );
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("./pages/LoginPage"), "LoginPage"),
});
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: lazyRouteComponent(() => import("./pages/ProfilePage"), "ProfilePage"),
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("./pages/AdminPage"), "AdminPage"),
});
const adminLabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/labs",
  component: lazyRouteComponent(() => import("./pages/AdminLabsPage"), "AdminLabsPage"),
});
const adminClassesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/classes",
  component: lazyRouteComponent(() => import("./pages/AdminClassesPage"), "AdminClassesPage"),
});

const teacherLabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teacher/labs",
  component: lazyRouteComponent(() => import("./pages/TeacherLabsPage"), "TeacherLabsPage"),
});

function createLabRoutePair<TId extends LabId>(id: TId) {
  const labComponent = APP_LABS[id].component;
  const guardedComponent = Object.assign(() => <GuardedLabRoute labId={id} />, {
    preload: (): Promise<void> | undefined => {
      void labComponent.preload?.();
      return undefined;
    },
  });
  const entryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: `/labs/${id}`,
    validateSearch: passThroughSearch,
    component: () => <LabRedirectPage labId={id} />,
    errorComponent: LabErrorPage,
  });
  const labRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: `/classes/$classId/labs/${id}`,
    validateSearch: passThroughSearch,
    component: guardedComponent,
    errorComponent: LabErrorPage,
  });
  return [entryRoute, labRoute] as const;
}

const labRoutes = LAB_IDS.flatMap((id) => createLabRoutePair(id));

const legacyLogisticRegressionEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/ml-intro",
  validateSearch: passThroughSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/labs/logistic-regression", search, replace: true });
  },
});

const legacyLogisticRegressionClassRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/ml-intro",
  validateSearch: passThroughSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/classes/$classId/labs/logistic-regression",
      params,
      search,
      replace: true,
    });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/dashboard",
  validateSearch: passThroughSearch,
  beforeLoad: ({ params, search }) => {
    if (search.lab === "ml-intro") {
      throw redirect({
        to: "/classes/$classId/dashboard",
        params,
        search: { ...search, lab: "logistic-regression" },
        replace: true,
      });
    }
  },
  component: lazyRouteComponent(
    () => import("./pages/TeacherDashboardPage"),
    "TeacherDashboardPage",
  ),
  errorComponent: LabErrorPage,
});

const classMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/members",
  component: lazyRouteComponent(() => import("./pages/ClassMembersPage"), "ClassMembersPage"),
  errorComponent: LabErrorPage,
});

const studentLabPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/students/$userId/labs/calculator",
  validateSearch: passThroughSearch,
  component: lazyRouteComponent(
    () => import("./pages/StudentLabPreviewPage"),
    "StudentLabPreviewPage",
  ),
  errorComponent: LabErrorPage,
});

const taskSheetListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: lazyRouteComponent(() => import("./pages/TaskSheetListPage"), "TaskSheetListPage"),
  errorComponent: LabErrorPage,
});

const taskSheetEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$sheetId/edit",
  component: lazyRouteComponent(() => import("./pages/TaskSheetEditorPage"), "TaskSheetEditorPage"),
  errorComponent: LabErrorPage,
});

const taskAssignmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/tasks/$assignmentId",
  component: lazyRouteComponent(() => import("./pages/TaskAssignmentPage"), "TaskAssignmentPage"),
  errorComponent: LabErrorPage,
});

const devRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/__dev/labs/decoding",
        validateSearch: passThroughSearch,
        component: lazyRouteComponent(
          () => import("../features/decoding/preview/DecodingPreviewPage"),
          "DecodingPreviewPage",
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/__dev/labs/lunch-shift-ai",
        validateSearch: passThroughSearch,
        component: lazyRouteComponent(
          () => import("../features/lunch-shift/ai/AiIntakePocPage"),
          "AiIntakePocPage",
        ),
      }),
    ]
  : [];

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  profileRoute,
  adminRoute,
  adminClassesRoute,
  adminLabsRoute,
  teacherLabsRoute,
  ...labRoutes,
  legacyLogisticRegressionEntryRoute,
  legacyLogisticRegressionClassRoute,
  dashboardRoute,
  classMembersRoute,
  studentLabPreviewRoute,
  taskSheetListRoute,
  taskSheetEditorRoute,
  taskAssignmentRoute,
  ...devRoutes,
]);

export function createAppRouter({
  history = createBrowserHistory(),
  basepath = resolveRuntimeBasePath(configuredBasePath),
}: AppRouterOptions = {}) {
  return createRouter({ history, basepath, defaultPreload: "intent", routeTree });
}

export const router = createAppRouter();

export { normalizeBasePath, resolveRuntimeBasePath };
export { basePathPrefix } from "../shared/basePath";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
