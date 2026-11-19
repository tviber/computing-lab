import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
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
export function LabRedirectPage({ labId }: { labId: LabId }) {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const entry = catalog?.get(labId);
  const closed = entry?.visible === false;
  // Land on the first class whose students may take the lab — the primary
  // membership itself may be a class this lab is closed to.
  const classId = entry?.visibleClassIds?.[0] ?? primaryMembership?.classId;
  const title = labMetadata[labId].title;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login", replace: true });
      return;
    }
    // Non-admins wait for the catalog so a closed lab never flashes through.
    if (classId && (role === "admin" || (catalog !== null && !closed))) {
      void navigate({
        to: `/classes/$classId/labs/${labId}`,
        params: { classId },
        search,
        replace: true,
      });
    }
  }, [status, classId, role, catalog, closed, labId, navigate, search]);

  if (status === "authenticated" && closed && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 暂未开放</p>
          <h1>这个实验暂未开放</h1>
          <p>「{title}」暂未对你所在的班级开放，开放后再来。</p>
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
