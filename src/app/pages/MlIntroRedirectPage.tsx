import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** Public entry for the ml-intro lab; routes students into their class workspace. */
export function MlIntroRedirectPage() {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const navigate = useNavigate();
  const entry = catalog?.get("ml-intro");
  const closed = entry?.visible === false;
  const classId = entry?.visibleClassIds?.[0] ?? primaryMembership?.classId;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    if (classId && (role === "admin" || (catalog !== null && !closed))) {
      void navigate({ to: "/classes/$classId/labs/ml-intro", params: { classId } });
    }
  }, [status, classId, role, catalog, closed, navigate]);

  if (status === "authenticated" && closed && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 暂未开放</p>
          <h1>这个实验暂未开放</h1>
          <p>「机器学习入门」暂未对你所在的班级开放，开放后再来。</p>
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
