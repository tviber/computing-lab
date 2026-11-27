import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

export function NotFoundPage() {
  return (
    <AppPageLayout>
      <main class="not-found">
        <p class="eyebrow">404 / 找不到页面</p>
        <h1>实验不存在</h1>
        <p>这个地址没有对应的 Computing Lab 实验。</p>
      </main>
    </AppPageLayout>
  );
}
