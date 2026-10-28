import {
  Outlet,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { normalizeBasePath } from "../shared/basePath";
import { CalculatorLabPage } from "../features/calculator";
import { HomePage } from "./pages/HomePage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { CalculatorRedirectPage } from "./pages/CalculatorRedirectPage";
import { ImageSamplingRedirectPage } from "./pages/ImageSamplingRedirectPage";
import { ColorQuantizationRedirectPage } from "./pages/ColorQuantizationRedirectPage";
import { CpuRedirectPage } from "./pages/CpuRedirectPage";
import { DecodingRedirectPage } from "./pages/DecodingRedirectPage";
import { IsSimRedirectPage } from "./pages/IsSimRedirectPage";
import { LunchShiftRedirectPage } from "./pages/LunchShiftRedirectPage";
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
import { AudioEncodingEntryPage } from "./pages/AudioEncodingEntryPage";

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

/** Public entry point; forwards a signed-in member to their own class. */
const calculatorEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/calculator",
  component: CalculatorRedirectPage,
  errorComponent: LabErrorPage,
});

const calculatorLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/calculator",
  validateSearch: passThroughSearch,
  component: CalculatorLabPage,
  errorComponent: LabErrorPage,
});

/** Public entry for image sampling; forwards members to their own class. */
const imageSamplingEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/image-sampling",
  component: ImageSamplingRedirectPage,
  errorComponent: LabErrorPage,
});

const imageSamplingLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/image-sampling",
  validateSearch: passThroughSearch,
  // Lazy: keeps the CodeMirror editor + lab UI out of the main bundle.
  component: lazyRouteComponent(() => import("../features/image-sampling"), "ImageSamplingLabPage"),
  errorComponent: LabErrorPage,
});

/** Public entry for color quantization; forwards members to their own class. */
const colorQuantizationEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/color-quantization",
  component: ColorQuantizationRedirectPage,
  errorComponent: LabErrorPage,
});

const colorQuantizationLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/color-quantization",
  validateSearch: passThroughSearch,
  // Lazy: keeps the CodeMirror editor + lab UI out of the main bundle.
  component: lazyRouteComponent(
    () => import("../features/color-quantization"),
    "ColorQuantizationLabPage",
  ),
  errorComponent: LabErrorPage,
});

const cpuEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/cpu",
  component: CpuRedirectPage,
  errorComponent: LabErrorPage,
});

const cpuLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/cpu",
  validateSearch: passThroughSearch,
  component: lazyRouteComponent(() => import("../features/cpu"), "CpuLabPage"),
  errorComponent: LabErrorPage,
});

const decodingEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/decoding",
  component: DecodingRedirectPage,
  errorComponent: LabErrorPage,
});

const decodingLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/decoding",
  validateSearch: passThroughSearch,
  // Lazy: keeps the CodeMirror editor + lab UI out of the main bundle.
  component: lazyRouteComponent(() => import("../features/decoding"), "DecodingLabPage"),
  errorComponent: LabErrorPage,
});

const isSimEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/is-sim",
  component: IsSimRedirectPage,
  errorComponent: LabErrorPage,
});

const isSimLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/is-sim",
  validateSearch: passThroughSearch,
  component: lazyRouteComponent(() => import("../features/is-sim"), "IsLabPage"),
  errorComponent: LabErrorPage,
});

const lunchShiftEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/lunch-shift",
  component: LunchShiftRedirectPage,
  errorComponent: LabErrorPage,
});

const lunchShiftLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classes/$classId/labs/lunch-shift",
  validateSearch: passThroughSearch,
  component: lazyRouteComponent(() => import("../features/lunch-shift"), "LunchShiftLabPage"),
  errorComponent: LabErrorPage,
});

/** Audio-encoding demo page — a tool, not a judged lab: no stages,
 * no submissions, everything runs locally in the browser. */
const audioEncodingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/labs/audio-encoding",
  validateSearch: passThroughSearch,
  component: AudioEncodingEntryPage,
  errorComponent: LabErrorPage,
});

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
        path: "/__dev/labs/cpu",
        validateSearch: passThroughSearch,
        component: lazyRouteComponent(
          () => import("../features/cpu/preview/CpuPreviewPage"),
          "CpuPreviewPage",
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/__dev/labs/decoding",
        validateSearch: passThroughSearch,
        component: lazyRouteComponent(
          () => import("../features/decoding/preview/DecodingPreviewPage"),
          "DecodingPreviewPage",
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
  calculatorEntryRoute,
  calculatorLabRoute,
  imageSamplingEntryRoute,
  imageSamplingLabRoute,
  colorQuantizationEntryRoute,
  colorQuantizationLabRoute,
  cpuEntryRoute,
  cpuLabRoute,
  decodingEntryRoute,
  decodingLabRoute,
  isSimEntryRoute,
  isSimLabRoute,
  lunchShiftEntryRoute,
  lunchShiftLabRoute,
  audioEncodingRoute,
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
