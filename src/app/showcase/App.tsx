import {
  browserHistory,
  createRouter,
  defineRoutes,
  intentPreload,
  useLocation,
  useNavigate,
  type RouterHistory,
} from "@solidjs/router";
import { createEffect, Errored, Loading } from "solid-js";
import { LAB_IDS } from "../../shared/lab/labMetadata";
import { LabRuntimeProvider } from "../../shared/lab/runtime";
import { APP_LABS } from "../labRegistry";
import { LabErrorPage } from "../pages/LabErrorPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ShowcaseHomePage } from "./HomePage";
import { createLocalRuntime } from "./localRuntime";
import { normalizeBasePath, resolveRuntimeBasePath } from "../../shared/basePath";

function LegacyRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  createEffect(
    () => location.search,
    (search) => navigate(`/labs/logistic-regression${search}`, { replace: true }),
  );
  return null;
}

export const showcaseRoutes = defineRoutes([
  { path: "/", component: ShowcaseHomePage },
  ...LAB_IDS.map((id) => ({ path: `/labs/${id}`, component: APP_LABS[id].component })),
  { path: "/labs/ml-intro", component: LegacyRedirect },
  { path: "*404", component: NotFoundPage },
]);

export function createShowcaseRouter(history: RouterHistory = browserHistory()) {
  const base = resolveRuntimeBasePath(normalizeBasePath(import.meta.env.BASE_URL));
  return createRouter({
    routes: showcaseRoutes,
    history,
    base: base === "/" ? undefined : base,
    preloadLinks: intentPreload(),
  });
}

export default function ShowcaseApp() {
  const Router = createShowcaseRouter();
  const runtime = createLocalRuntime(localStorage);
  return (
    <Router>
      {(props) => (
        <LabRuntimeProvider value={runtime}>
          <Errored fallback={(error, reset) => <LabErrorPage error={error()} reset={reset} />}>
            <Loading
              fallback={
                <p class="home-loading" role="status">
                  正在载入…
                </p>
              }
            >
              {props.children}
            </Loading>
          </Errored>
        </LabRuntimeProvider>
      )}
    </Router>
  );
}
