import type { LabResetControlsProps } from "../../../shared/lab/LabPageShell";
import type { PixelHover, PixelMatrix } from "../domain/bmp.ts";
import type {
  DecoderChoice,
  DecodingDraft,
  DecodingJudgeResult,
  LabPayload,
} from "../domain/protocol.ts";
import type { DecodingStageDef } from "../domain/stages.ts";
import type { SaveStatus } from "../lesson/state.ts";

export type DecodingRunResult = { text: string } | { pixels: PixelMatrix };

export type SampleOutcome = { stdout: string; pixels: PixelMatrix | null };

export type DecodingStageItem = Readonly<{
  id: string;
  index: number;
  title: string;
  englishTitle: string;
  active: boolean;
  passed: boolean;
  unlocked: boolean;
}>;

export type FileVerdict = {
  decoder: DecoderChoice;
  text?: string;
  pixels?: PixelMatrix;
} | null;

export type DecodingLabViewModel = Readonly<{
  stage: DecodingStageDef | null;
  stagePassed: boolean;
  rail: Readonly<{
    corePassed: number;
    coreTotal: number;
    core: readonly Readonly<{
      stage: DecodingStageItem;
      challenges: readonly DecodingStageItem[];
    }>[];
    challenges: readonly DecodingStageItem[];
  }>;
  feedback: Readonly<{
    saveStatus: SaveStatus;
    unresolvedSyncConflict: boolean;
    conflictLocalAvailable: boolean;
    message: string | null;
    error: string | null;
  }>;
  payload: LabPayload | null;
  verdicts: DecodingDraft["verdicts"];
  editor: Readonly<{
    template: string;
    source: string;
    fills: Record<string, string>;
    cloze: boolean;
    complete: boolean;
    running: boolean;
    sampleFills: Record<string, string>;
  }> | null;
  output: Readonly<{
    runError: string | null;
    preview: PixelMatrix | null;
    lastRun: DecodingRunResult | null;
    targetPixels: PixelMatrix | null;
    pixelDiff: number | null;
    sample: Readonly<{
      printout: string | null;
      pixels: PixelMatrix | null;
      error: string | null;
      hover: PixelHover | null;
    }>;
  }> | null;
  concepts: Readonly<{
    answered: ReadonlySet<string>;
    wrongPick: { promptId: string; option: number } | null;
  }>;
  submission: Readonly<{
    submitting: boolean;
    blocker: string | null;
  }>;
  judge: Readonly<{
    outcome: DecodingJudgeResult;
    nextStageIndex: number | null;
  }> | null;
}>;

export type DecodingLabActions = {
  selectStage(index: number): void;
  dismissMessage(): void;
  setFill(blankId: string, value: string): void;
  setSampleFill(blankId: string, value: string): void;
  setSampleHover(hover: PixelHover | null): void;
  run(): void;
  runPreview(): void;
  printExample(): void;
  answerPrompt(promptId: string, option: number): void;
  setVerdict(fileIndex: number, verdict: FileVerdict, expectDecoder?: DecoderChoice): void;
  submit(): Promise<void>;
  restoreConflictLocal(): void;
  discardConflictLocal(): void;
  retrySyncConflict(): void;
};

export type DecodingWorkspaceProps = {
  model: DecodingLabViewModel;
  actions: DecodingLabActions;
  resetControls?: LabResetControlsProps;
};
