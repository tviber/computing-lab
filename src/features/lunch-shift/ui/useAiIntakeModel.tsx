import { createSignal, onSettled, Show, type Accessor } from "solid-js";
import {
  orderSetCacheKey,
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "./embedRunner.ts";
import { runNeedConfirm } from "./pyodideRunner.ts";

export const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    # 先看 AI 裸跑的散点图，再决定哪些单需要请顾客确认。
    # 返回 True 会让接单台停 1 拍。
    return False
`;

export type IntakeOrderInput = { id: string; request: string };

export type AiIntakeModelState = {
  modelStatus: Accessor<"loading" | "ready" | "error">;
  modelInfo: Accessor<EmbedInfo | null>;
  modelError: Accessor<string | null>;
  progress: Accessor<EmbedProgress | null>;
  predict: (
    orders: readonly IntakeOrderInput[],
  ) => Promise<{ predictions: TicketPrediction[]; cached: boolean }>;
  evaluateConfirm: (
    confirmCode: string,
    orders: readonly IntakeOrderInput[],
  ) => Promise<{ predictions: TicketPrediction[]; confirms: boolean[]; cached: boolean }>;
};

/**
 * Shared local BGE embedder loader, order-set prediction cache, and
 * Python need_confirm runner used by both practice and final stages.
 */
export function useAiIntakeModel(): AiIntakeModelState {
  const [modelStatus, setModelStatus] = createSignal<"loading" | "ready" | "error">("loading");
  const [modelInfo, setModelInfo] = createSignal<EmbedInfo | null>(null);
  const [modelError, setModelError] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal<EmbedProgress | null>(null);

  // Model predictions keyed by the order set — an edit to need_confirm
  // or priority does not re-embed 300+ texts, so a rerun is Python-fast.
  let predictionCache: {
    key: string;
    predictions: TicketPrediction[];
  } | null = null;

  // Start the model download as soon as the stage opens — it's vendored
  // locally and warm by the time the student finishes reading the task.
  onSettled(() => {
    let cancelled = false;
    loadEmbedder(setProgress).then(
      (info) => {
        if (cancelled) return;
        setModelInfo(info);
        setModelStatus("ready");
      },
      (loadError: unknown) => {
        if (cancelled) return;
        setModelError(loadError instanceof Error ? loadError.message : String(loadError));
        setModelStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  });

  const predict = async (
    orders: readonly IntakeOrderInput[],
  ): Promise<{ predictions: TicketPrediction[]; cached: boolean }> => {
    const key = orderSetCacheKey(orders);
    if (predictionCache?.key === key) {
      return { predictions: predictionCache.predictions, cached: true };
    }
    const texts = textsToEmbed(orders.map((order) => order.request));
    const { vectors } = await embedTexts(texts);
    const vectorByText = new Map<string, Vector>();
    for (let i = 0; i < texts.length; i++) vectorByText.set(texts[i], vectors[i]);
    const embedOf = (text: string): Vector => vectorByText.get(text) ?? [];
    const predictions = orders.map((order) => predictTicket(order.request, embedOf));
    predictionCache = { key, predictions };
    return { predictions, cached: false };
  };

  const evaluateConfirm = async (
    confirmCode: string,
    orders: readonly IntakeOrderInput[],
  ): Promise<{ predictions: TicketPrediction[]; confirms: boolean[]; cached: boolean }> => {
    const { predictions, cached } = await predict(orders);
    const cases: [number, number][] = predictions.map((prediction) => [
      Math.round(prediction.similarity * 10000) / 10000,
      Math.round(prediction.margin * 10000) / 10000,
    ]);
    const rawConfirms = await runNeedConfirm(confirmCode, cases);
    const confirms = Array.isArray(rawConfirms) ? rawConfirms : [];
    if (confirms.length !== orders.length || confirms.some((value) => typeof value !== "boolean")) {
      throw new Error("need_confirm 要对每张订单返回 True 或 False。");
    }
    return { predictions, confirms, cached };
  };

  return { modelStatus, modelInfo, modelError, progress, predict, evaluateConfirm };
}

export function AiModelStatusBanner(props: { model: AiIntakeModelState }) {
  return (
    <>
      <p class="lunch-note" role="status">
        本地模型 <code>bge-small-zh-v1.5</code>：
        {props.model.modelStatus() === "loading"
          ? "加载中…"
          : props.model.modelStatus() === "ready"
            ? `已就绪（${props.model.modelInfo()?.device === "webgpu" ? "WebGPU" : "WASM"}）`
            : "加载失败"}
        {props.model.modelStatus() === "loading" && props.model.progress()
          ? ` · 下载 ${Math.round(props.model.progress()!.loaded / 1024 / 1024)}/${Math.round(props.model.progress()!.total / 1024 / 1024)} MB`
          : null}
      </p>
      <Show when={props.model.modelError()}>
        {(err) => (
          <p class="test-error" role="alert">
            {err()}
          </p>
        )}
      </Show>
    </>
  );
}
