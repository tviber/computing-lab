import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** Public entry for the lunch-shift lab; sends students into their class context. */
export function LunchShiftRedirectPage() {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const navigate = useNavigate();
  const entry = catalog?.get("lunch-shift");
  const closed = entry?.visible === false;
  // Land on the first class whose students may take the lab — the primary
  // membership itself may be a class this lab is closed to.
  const classId = entry?.visibleClassIds?.[0] ?? primaryMembership?.classId;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    // Non-admins wait for the catalog so a closed lab never flashes through.
    if (classId && (role === "admin" || (catalog !== null && !closed))) {
      void navigate({ to: "/classes/$classId/labs/lunch-shift", params: { classId } });
    }
  }, [status, classId, role, catalog, closed, navigate]);

  if (status === "authenticated" && closed && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 暂未开放</p>
          <h1>这个实验暂未开放</h1>
          <p>「午市救援」暂未对你所在的班级开放，开放后再来。</p>
        </main>
      </AppPageLayout>
    );
  }

  if (status === "authenticated" && !classId) {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 未加入班级</p>
          <h1>你还没有加入班级</h1>
          <p>请联系管理员把你的账号分配到班级后再开始实验。</p>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <p className="home-loading" role="status">
        正在进入实验…
      </p>
    </AppPageLayout>
  );
}
