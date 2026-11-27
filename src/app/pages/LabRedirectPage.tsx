import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, Match, Switch } from "solid-js";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { labMetadata, type LabId } from "../../shared/lab/labMetadata";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/**
 * Public `/labs/<labId>` entry redirect shared by every lab: forwards a
 * signed-in member to the first class where the lab is open, and blocks
 * non-admins with a clear notice when the lab is hidden or closed to them.
 */
export function LabRedirectPage(props: { labId: LabId }) {
  const auth = useAuth();
  const catalog = useLabCatalog(() => auth.status === "authenticated");
  const navigate = useNavigate();
  const location = useLocation();
  const entry = createMemo(() => catalog()?.get(props.labId));
  const closed = createMemo(() => entry()?.visible === false);
  // Land on the first class whose students may take the lab — the primary
  // membership itself may be a class this lab is closed to.
  const classId = createMemo(
    () => entry()?.visibleClassIds?.[0] ?? auth.primaryMembership?.classId,
  );
  const title = createMemo(() => labMetadata[props.labId].title);

  const redirectTarget = createMemo(() => {
    if (auth.status === "anonymous") return "/login";
    const cid = classId();
    if (cid && (auth.role === "admin" || (catalog() !== null && !closed()))) {
      return `/classes/${cid}/labs/${props.labId}${location.search}`;
    }
    return null;
  });

  createEffect(redirectTarget, (target) => {
    if (target) navigate(target, { replace: true });
  });

  return (
    <Switch
      fallback={
        <AppPageLayout>
          <p class="home-loading" role="status">
            正在进入实验…
          </p>
        </AppPageLayout>
      }
    >
      <Match when={auth.status === "authenticated" && closed() && auth.role !== "admin"}>
        <AppPageLayout>
          <main class="not-found" role="status">
            <p class="eyebrow">实验 / 暂未开放</p>
            <h1>这个实验暂未开放</h1>
            <p>「{title()}」暂未对你所在的班级开放，开放后再来。</p>
          </main>
        </AppPageLayout>
      </Match>
      <Match when={auth.status === "authenticated" && !classId()}>
        <AppPageLayout>
          <main class="not-found" role="status">
            <p class="eyebrow">实验 / 未加入班级</p>
            <h1>你还没有加入班级</h1>
            <p>请联系管理员把你的账号分配到班级后再开始实验。</p>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
