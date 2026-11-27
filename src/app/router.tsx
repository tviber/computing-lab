import { ClassroomRuntime } from "./classroom/ClassroomRuntime";
import {
  browserHistory,
  createRouter,
  defineRoutes,
  intentPreload,
  useLocation,
  useNavigate,
  useParams,
  type RouteDefinition,
  type RouterHistory,
} from "@solidjs/router";
import {
  createEffect,
  createMemo,
  Errored,
  lazy,
  Loading,
  untrack,
  type Component,
} from "solid-js";
import { normalizeBasePath, resolveRuntimeBasePath } from "../shared/basePath";
import { isStaffRole, useAuth } from "../shared/auth";
import { LabAccessGate } from "../shared/lab/LabGate";
import { rememberRecentLab } from "../shared/lab/recentLab";
import { useLabCatalog } from "../shared/lab/labs";
import { LAB_IDS, labMetadata, type LabId } from "../shared/lab/labMetadata";
import { APP_LABS } from "./labRegistry";
import { HomePage } from "./pages/HomePage";
import { LabErrorPage } from "./pages/LabErrorPage";
import { LabRedirectPage } from "./pages/LabRedirectPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const configuredBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export type AppRouterOptions = {
  history?: RouterHistory;
  basepath?: string;
};

function withLabErrorBoundary(Comp: Component): Component {
  return function LabErrorBoundaryWrapper() {
    return (
      <Errored fallback={(err, reset) => <LabErrorPage error={err()} reset={reset} />}>
        <Loading
          fallback={
            <p class="home-loading" role="status">
              正在载入…
            </p>
          }
        >
          <Comp />
        </Loading>
      </Errored>
    );
  };
}

function GuardedLabRoute(props: { labId: LabId }) {
  const params = useParams<{ classId?: string }>();
  const auth = useAuth();
  const catalog = useLabCatalog(() => auth.status === "authenticated");
  const visibleClass = createMemo(() =>
    Boolean(
      params.classId && catalog()?.get(props.labId)?.visibleClassIds?.includes(params.classId),
    ),
  );
  const studentId = createMemo(() => (!isStaffRole(auth.role) ? auth.session?.user.id : undefined));
  const LabComponent = APP_LABS[props.labId].component;

  const recentVisit = createMemo(() => {
    const sid = studentId();
    const cid = params.classId;
    return sid && cid && visibleClass() ? { sid, cid, labId: props.labId } : null;
  });

  const recentVisitKey = createMemo(() => {
    const visit = recentVisit();
    return visit ? `${visit.sid}\0${visit.cid}\0${visit.labId}` : "";
  });

  createEffect(recentVisitKey, () => {
    const visit = untrack(recentVisit);
    if (visit) {
      rememberRecentLab(visit.sid, { labId: visit.labId, classId: visit.cid });
    }
  });

  return (
    <LabAccessGate
      checkingAccess={
        auth.status === "authenticated" && auth.role !== "admin" && catalog() === null
      }
      classId={params.classId}
      closed={catalog()?.get(props.labId)?.visible === false}
      labName={labMetadata[props.labId].title}
      noClassHint="请联系管理员把你的账号分配到班级后再开始实验。"
      role={auth.role}
      status={auth.status}
    >
      <Errored fallback={(err, reset) => <LabErrorPage error={err()} reset={reset} />}>
        <Loading
          fallback={
            <p class="home-loading" role="status">
              正在载入…
            </p>
          }
        >
          <ClassroomRuntime>
            <LabComponent />
          </ClassroomRuntime>
        </Loading>
      </Errored>
    </LabAccessGate>
  );
}

function LegacyMlIntroEntryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  createEffect(
    () => location.search,
    (search) => {
      navigate(`/labs/logistic-regression${search}`, { replace: true });
    },
  );
  return null;
}

function LegacyMlIntroClassRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ classId: string }>();
  const target = createMemo(
    () => `/classes/${params.classId}/labs/logistic-regression${location.search}`,
  );
  createEffect(target, (href) => {
    navigate(href, { replace: true });
  });
  return null;
}

const LoginPage = lazy(() => import("./pages/LoginPage"), { export: "LoginPage" });
const ProfilePage = lazy(() => import("./pages/ProfilePage"), { export: "ProfilePage" });
const AdminPage = lazy(() => import("./pages/AdminPage"), { export: "AdminPage" });
const AdminClassesPage = lazy(() => import("./pages/AdminClassesPage"), {
  export: "AdminClassesPage",
});
const AdminLabsPage = lazy(() => import("./pages/AdminLabsPage"), { export: "AdminLabsPage" });
const TeacherLabsPage = lazy(() => import("./pages/TeacherLabsPage"), {
  export: "TeacherLabsPage",
});
const TeacherDashboardPage = withLabErrorBoundary(
  lazy(() => import("./pages/TeacherDashboardPage"), { export: "TeacherDashboardPage" }),
);
const ClassMembersPage = withLabErrorBoundary(
  lazy(() => import("./pages/ClassMembersPage"), { export: "ClassMembersPage" }),
);
const StudentLabPreviewPage = withLabErrorBoundary(
  lazy(() => import("./pages/StudentLabPreviewPage"), { export: "StudentLabPreviewPage" }),
);
const TaskSheetListPage = withLabErrorBoundary(
  lazy(() => import("./pages/TaskSheetListPage"), { export: "TaskSheetListPage" }),
);
const TaskSheetEditorPage = withLabErrorBoundary(
  lazy(() => import("./pages/TaskSheetEditorPage"), { export: "TaskSheetEditorPage" }),
);
const TaskAssignmentPage = withLabErrorBoundary(
  lazy(() => import("./pages/TaskAssignmentPage"), { export: "TaskAssignmentPage" }),
);

function createLabRoutePair<TId extends LabId>(id: TId): RouteDefinition[] {
  const labComponent = APP_LABS[id].component;
  const guardedComponent = Object.assign(() => <GuardedLabRoute labId={id} />, {
    preload: (): Promise<void> | undefined => {
      void labComponent.preload?.();
      return undefined;
    },
  });
  return [
    {
      path: `/labs/${id}`,
      component: () => (
        <Errored fallback={(err, reset) => <LabErrorPage error={err()} reset={reset} />}>
          <LabRedirectPage labId={id} />
        </Errored>
      ),
      info: { errorBoundary: LabErrorPage },
    },
    {
      path: `/classes/:classId/labs/${id}`,
      component: guardedComponent,
      preload: () => {
        void guardedComponent.preload?.();
      },
      info: { errorBoundary: LabErrorPage },
    },
  ];
}

const labRoutes: RouteDefinition[] = LAB_IDS.flatMap((id) => createLabRoutePair(id));

const devRoutes: RouteDefinition[] = import.meta.env.DEV
  ? [
      {
        path: "/__dev/labs/decoding",
        component: lazy(() => import("../features/decoding/preview/DecodingPreviewPage"), {
          export: "DecodingPreviewPage",
        }),
      },
      {
        path: "/__dev/labs/lunch-shift-ai",
        component: lazy(() => import("../features/lunch-shift/ai/AiIntakePocPage"), {
          export: "AiIntakePocPage",
        }),
      },
    ]
  : [];

export const appRoutes = defineRoutes([
  { path: "/", component: HomePage },
  { path: "/login", component: LoginPage },
  { path: "/profile", component: ProfilePage },
  { path: "/admin", component: AdminPage },
  { path: "/admin/classes", component: AdminClassesPage },
  { path: "/admin/labs", component: AdminLabsPage },
  { path: "/teacher/labs", component: TeacherLabsPage },
  ...labRoutes,
  { path: "/labs/ml-intro", component: LegacyMlIntroEntryRedirect },
  { path: "/classes/:classId/labs/ml-intro", component: LegacyMlIntroClassRedirect },
  {
    path: "/classes/:classId/dashboard",
    component: TeacherDashboardPage,
    info: { errorBoundary: LabErrorPage },
  },
  {
    path: "/classes/:classId/members",
    component: ClassMembersPage,
    info: { errorBoundary: LabErrorPage },
  },
  {
    path: "/classes/:classId/students/:userId/labs/calculator",
    component: StudentLabPreviewPage,
    info: { errorBoundary: LabErrorPage },
  },
  {
    path: "/tasks",
    component: TaskSheetListPage,
    info: { errorBoundary: LabErrorPage },
  },
  {
    path: "/tasks/:sheetId/edit",
    component: TaskSheetEditorPage,
    info: { errorBoundary: LabErrorPage },
  },
  {
    path: "/classes/:classId/tasks/:assignmentId",
    component: TaskAssignmentPage,
    info: { errorBoundary: LabErrorPage },
  },
  ...devRoutes,
  { path: "*404", component: NotFoundPage },
]);

export function createAppRouter({
  history = browserHistory(),
  basepath = resolveRuntimeBasePath(configuredBasePath),
}: AppRouterOptions = {}) {
  return createRouter({
    routes: appRoutes,
    base: basepath === "/" ? undefined : basepath,
    history,
    preloadLinks: intentPreload(),
  });
}

export const router = createAppRouter();

export { normalizeBasePath };
export { basePathPrefix } from "../shared/basePath";
