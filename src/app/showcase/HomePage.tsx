import { For } from "solid-js";
import { LAB_IDS, labMetadata, LAB_CATEGORY_LABELS } from "../../shared/lab/labMetadata";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink } from "../../shared/ui/AppLink";
import { AtlasPlate } from "../atlas/AtlasPlate";
import { FeaturedLabDeck } from "../atlas/FeaturedLabDeck";
import "../pages/home.css";

export function ShowcaseHomePage() {
  return (
    <AppPageLayout class="home-page" topbarProps={{ showHomeLink: false }}>
      <main class="page-content">
        <section class="home-hero">
          <div class="home-hero-copy">
            <p class="eyebrow">COMPUTING LAB / 在线互动实验</p>
            <h1>计算机怎么处理信息？</h1>
            <p class="home-lede">
              搭一段逻辑电路、拆开一张位图文件头、训练一个垃圾短信分类器——每个实验都能在浏览器里直接观察结果。
            </p>
            <p class="home-availability">
              无需登录，所有实验直接开放。进度保存在当前浏览器，可随时回来继续。
            </p>
            <div class="home-hero-actions">
              <AppLink class="button button-primary" href="/labs/calculator">
                开始实现 ALU
              </AppLink>
            </div>
          </div>
          <FeaturedLabDeck />
        </section>
        <section aria-label="全部实验" class="lab-card-grid lab-catalog-grid home-catalog-reveal">
          <For each={LAB_IDS}>
            {(id, index) => (
              <article class="lab-card is-interactive" data-category={labMetadata[id].category}>
                <AtlasPlate labId={id} />
                <div class="lab-card-topline">
                  <span class="lab-card-index">{String(index() + 1).padStart(2, "0")}</span>
                  <span>{LAB_CATEGORY_LABELS[labMetadata[id].category]}</span>
                </div>
                <h2>{labMetadata[id].title}</h2>
                <p class="lab-card-desc">{labMetadata[id].description}</p>
                <div class="lab-card-footer">
                  <AppLink class="lab-card-action" href={`/labs/${id}`}>
                    进入实验
                  </AppLink>
                </div>
              </article>
            )}
          </For>
        </section>
      </main>
    </AppPageLayout>
  );
}
