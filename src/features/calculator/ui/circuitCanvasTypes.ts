import type { Bit, CircuitGraph } from "../domain/graph";
import type { CalculatorLessonAction, ComponentCatalog, PendingWire } from "../lesson/state";

export type CircuitCanvasProps = {
  graph: CircuitGraph;
  components: ComponentCatalog;
  portValues: Record<string, Bit | null>;
  selectedNodeId: string | null;
  pendingWire: PendingWire;
  dispatch: (action: CalculatorLessonAction) => void;
  /**
   * Read-only presentation for forensics/review: no editing gestures, no
   * keyboard shortcuts, no mutation dispatch. Collapse badges still toggle —
   * locally, without touching the stored graph.
   */
  readOnly?: boolean;
};
