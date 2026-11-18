/**
 * Presentation contract between the decoding controller and the workspace:
 * no reducer, network client, timers or worker — everything the page needs
 * as display-ready data plus the user-intent actions.
 */

import type { LabStaffControlsProps } from "../../../shared/lab/LabPageShell";
import type { PixelHover, PixelMatrix } from "../domain/bmp.ts";
import type {
  DecoderChoice,
  DecodingDraft,
  DecodingJudgeResult,
  LabPayload,
} from "../domain/protocol.ts";
import type { DecodingStageDef } from "../domain/stages.ts";
import type { SaveStatus } from "../lesson/state.ts";

/** What a student `decode(data)` run produced — the artifact a stage submits. */
export type DecodingRunResult = { text: string } | { pixels: PixelMatrix };

/** What the sample-input generator printed plus, on BMP stages, the decoded
 * sample image from the same run. */
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
    /** A post-refusal reconcile fetch failed and is still unreconciled —
     *  the retry stays visible while set, even when the flag reads dirty. */
    unresolvedSyncConflict: boolean;
    /** A pre-conflict local draft of this stage is recoverable. */
    conflictLocalAvailable: boolean;
    message: string | null;
    error: string | null;
  }>;
  payload: LabPayload | null;
  /** Stage 4: per-file pinned decoder verdicts from the draft. */
  verdicts: DecodingDraft["verdicts"];
  editor: Readonly<{
    /** The cloze template (or starter) shown in the editor. */
    template: string;
    /** The assembled program sent to the worker for run/submit. */
    source: string;
    fills: Record<string, string>;
    cloze: boolean;
    complete: boolean;
    running: boolean;
    sampleFills: Record<string, string>;
  }> | null;
  output: Readonly<{
    runError: string | null;
    /** bmp-script: the provided decoder's preview of the payload image. */
    preview: PixelMatrix | null;
    lastRun: DecodingRunResult | null;
    /** bmp stages: the payload decoded by the agreed BMP rule — the target. */
    targetPixels: PixelMatrix | null;
    /** Mismatch count between lastRun pixels and targetPixels, when both exist. */
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
    /** Why 提交判定 is blocked, as a student-readable reason; null = allowed. */
    blocker: string | null;
  }>;
  judge: Readonly<{
    outcome: DecodingJudgeResult;
    /** Next stage to offer, or null when the line is complete. */
    nextStageIndex: number | null;
  }> | null;
}>;

/** User intent only. The controller owns action mapping and teaching guards. */
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
  /** Swap the reconciled (server) draft back for the pre-conflict local copy. */
  restoreConflictLocal(): void;
  /** Drop the recoverable local copy — the student accepts the server's draft. */
  discardConflictLocal(): void;
  /** Refetch after a failed post-conflict sync — the only way out of sync-error. */
  retrySyncConflict(): void;
};

export type DecodingWorkspaceProps = {
  model: DecodingLabViewModel;
  actions: DecodingLabActions;
  staffControls?: LabStaffControlsProps;
};
