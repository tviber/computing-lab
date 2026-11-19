import {
  MAX_SAMPLE_SIZE,
  selectExperienceThreshold,
  trainLogisticRegression,
} from "./logisticRegression.ts";
import type { TrainingSettings } from "./protocol.ts";
import { inspectMessageWithModel } from "./tokenizer.ts";

export const EXPERIENCE_EXAMPLES = [
  { id: "everyday", label: "日常消息", text: "明天下午和同学一起去学校看电影，别忘了带手机！" },
  {
    id: "promotion",
    label: "促销短信",
    text: "尊敬的客户，本店年终促销，全场五折，欢迎到店选购！咨询电话 TEL。",
  },
  { id: "ad", label: "简短广告", text: "限时优惠！免费领取现金红包，回复 TD 退订。" },
] as const;

export function createExperienceClassifier({ eta, epochs }: TrainingSettings) {
  const run = trainLogisticRegression({ trainCount: MAX_SAMPLE_SIZE, eta, epochs });
  const { weightsByWord, bias, vocabSet, wordToIndex } = run.finalModel;
  const threshold = selectExperienceThreshold(run.valPredictions);
  return {
    threshold,
    inspect: (text: string) =>
      inspectMessageWithModel(text, weightsByWord, bias, vocabSet, threshold, wordToIndex),
  };
}
