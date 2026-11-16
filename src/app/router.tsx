import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
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
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { ClassMembersPage } from "./pages/ClassMembersPage";
import { StudentLabPreviewPage } from "./pages/StudentLabPreviewPage";
import { TaskSheetListPage } from "./pages/TaskSheetListPage";
import { TaskAssignmentPage } from "./pages/TaskAssignmentPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { AdminClassesPage } from "./pages/AdminClassesPage";
import { AdminLabsPage } from "./pages/AdminLabsPage";
import { TeacherLabsPage } from "./pages/TeacherLabsPage";

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
  component: LoginPage,
});
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfilePage,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});
const adminLabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/labs",
  component: AdminLabsPage,
});
const adminClassesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/classes",
  component: AdminClassesPage,
});

/** Teacher-scoped lab management: per-own-class open switches only. */
const teacherLabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teacher/labs",
  component: TeacherLabsPage,
});

function createLabRoutePair<TId extends LabId>(id: TId) {
  const labComponent = APP_LABS[id].component as {
    (props: object): React.ReactNode;
    preload?: () => Promise<void> | undefined;
  };
  const guardedComponent = Object.assign(() => <GuardedLabRoute labId={id} />, {
    preload: (): Promise<void> | undefined => {
      // Start the lab chunk early without delaying the gate's catalog request.
      void labComponent.preload?.();
      return undefined;
    },
  });
  const entryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: `/labs/${id}`,
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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/dashboard",
  validateSearch: passThroughSearch,
  component: TeacherDashboardPage,
  errorComponent: LabErrorPage,
});

/** Teacher-scoped roster management: enroll/rename/reset/remove students of
 * classes the caller teaches. */
const classMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/members",
  component: ClassMembersPage,
  errorComponent: LabErrorPage,
});

/**
 * Admin-only replay of a student's calculator lab — deliberately separate
 * from the student's own /classes/$classId/labs/calculator route so a
 * preview URL can never be mistaken for (or overwrite) the real thing.
 */
const studentLabPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/students/$userId/labs/calculator",
  validateSearch: passThroughSearch,
  component: StudentLabPreviewPage,
  errorComponent: LabErrorPage,
});

const taskSheetListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TaskSheetListPage,
  errorComponent: LabErrorPage,
});

const taskSheetEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$sheetId/edit",
  // Lazy: the editor stays out of the student-facing main bundle.
  component: lazyRouteComponent(() => import("./pages/TaskSheetEditorPage"), "TaskSheetEditorPage"),
  errorComponent: LabErrorPage,
});

const taskAssignmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/tasks/$assignmentId",
  component: TaskAssignmentPage,
  errorComponent: LabErrorPage,
});

// Vite erases this branch and its lazy import from production builds.
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
