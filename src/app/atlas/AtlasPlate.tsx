import type { ReactNode } from "react";
import {
  LAB_CATEGORY_LABELS,
  labMetadata,
  type LabCategory,
  type LabId,
} from "../../shared/lab/labMetadata";

type Specimen = "circuit" | "bytes" | "receipt" | "curve" | "sampling" | "ink";

const topicSpecimens: Record<LabCategory, Specimen> = {
  "computer-architecture": "circuit",
  "data-encoding": "bytes",
  "information-systems": "receipt",
  "artificial-intelligence": "curve",
};

const specialPlates: Partial<Record<LabId, Specimen>> = {
  "image-sampling": "sampling",
  "color-quantization": "ink",
};

type SpecimenDefinition = {
  spec: string;
  art: ReactNode;
};

const specimenDefinitions: Record<Specimen, SpecimenDefinition> = {
  circuit: {
    spec: "AND · 2-IN → 1-OUT",
    art: (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className="plate-type plate-muted" fontSize="10" textAnchor="end">
          <text x="36" y="38">
            A
          </text>
          <text x="36" y="65">
            B
          </text>
        </g>
        <path d="M51 34h45M51 62h45" stroke="var(--primary)" strokeWidth="1.75" />
        <circle
          cx="47"
          cy="34"
          fill="var(--surface)"
          r="3.5"
          stroke="var(--primary)"
          strokeWidth="1.75"
        />
        <circle
          cx="47"
          cy="62"
          fill="var(--surface)"
          r="3.5"
          stroke="var(--primary)"
          strokeWidth="1.75"
        />
        <path
          d="M96 22h24a26 26 0 0 1 0 52H96Z"
          fill="var(--surface)"
          stroke="var(--primary)"
          strokeWidth="1.85"
        />
        <path d="M146 48h44" stroke="var(--plate-accent)" strokeWidth="2.1" />
        <circle cx="194" cy="48" fill="var(--plate-accent)" r="4" />
        <text className="plate-type plate-accent-text" fontSize="9.5" x="204" y="51.5">
          OUT
        </text>
      </g>
    ),
  },
  bytes: {
    spec: "HEX 42 4D · BMP",
    art: (
      <g strokeLinecap="round" strokeLinejoin="round">
        <rect
          className="plate-accent-fill"
          height="34"
          rx="4"
          stroke="var(--plate-accent)"
          strokeWidth="1.5"
          width="38"
          x="35"
          y="22"
        />
        <rect
          className="plate-accent-fill"
          height="34"
          rx="4"
          stroke="var(--plate-accent)"
          strokeWidth="1.5"
          width="38"
          x="79"
          y="22"
        />
        <rect
          fill="var(--surface)"
          height="34"
          rx="4"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          width="38"
          x="123"
          y="22"
        />
        <rect
          fill="var(--surface)"
          height="34"
          rx="4"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          width="38"
          x="167"
          y="22"
        />
        <g className="plate-type" fontSize="14" fontWeight="700" textAnchor="middle">
          <text className="plate-accent-text" x="54" y="44">
            42
          </text>
          <text className="plate-accent-text" x="98" y="44">
            4D
          </text>
          <text fill="var(--primary)" x="142" y="44">
            36
          </text>
          <text fill="var(--primary)" x="186" y="44">
            00
          </text>
        </g>
        <path d="M38 62v5h76v-5" fill="none" stroke="var(--plate-accent)" strokeWidth="1.4" />
        <path d="M126 62v5h76v-5" fill="none" stroke="var(--border-strong)" strokeWidth="1.4" />
        <g className="plate-type" fontSize="9.5" textAnchor="middle">
          <text className="plate-accent-text" fontWeight="600" x="76" y="80">
            &quot;BM&quot;
          </text>
          <text className="plate-muted" x="164" y="80">
            SIZE
          </text>
        </g>
      </g>
    ),
  },
  receipt: {
    spec: "12 ORDERS · QUEUE",
    art: (
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M40 15h94v64l-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-6 3-6-3-4 3Z"
          fill="var(--surface)"
          stroke="var(--primary)"
          strokeWidth="1.5"
        />
        <rect
          className="plate-accent-fill"
          height="14"
          rx="3"
          stroke="var(--plate-accent)"
          strokeWidth="1.1"
          width="24"
          x="103"
          y="22"
        />
        <text
          className="plate-type plate-accent-text"
          fontSize="8.5"
          fontWeight="700"
          textAnchor="middle"
          x="115"
          y="32"
        >
          P1
        </text>
        <text
          className="plate-type"
          fill="var(--primary)"
          fontSize="9.5"
          fontWeight="600"
          x="50"
          y="32"
        >
          #012
        </text>
        <path
          d="M50 40h74"
          stroke="var(--border-strong)"
          strokeDasharray="3 2.5"
          strokeWidth="1.2"
        />
        <g fill="var(--secondary)" fontSize="9.5">
          <text x="50" y="54">
            米饭 × 1
          </text>
          <text x="50" y="68">
            面条 × 2
          </text>
        </g>
        <path
          d="M142 47h14m-4-4 4 4-4 4"
          fill="none"
          stroke="var(--plate-accent)"
          strokeWidth="1.6"
        />
        <rect
          className="plate-accent-fill"
          height="14"
          rx="3"
          stroke="var(--plate-accent)"
          strokeWidth="1.5"
          width="38"
          x="162"
          y="24"
        />
        <rect
          fill="var(--surface)"
          height="14"
          rx="3"
          stroke="var(--border-strong)"
          strokeWidth="1.4"
          width="38"
          x="162"
          y="42"
        />
        <rect
          fill="var(--surface)"
          height="14"
          rx="3"
          stroke="var(--border-strong)"
          strokeWidth="1.4"
          width="38"
          x="162"
          y="60"
        />
        <g className="plate-type" fontSize="8.5" textAnchor="middle">
          <text className="plate-accent-text" fontWeight="700" x="181" y="34">
            012
          </text>
          <text className="plate-muted" x="181" y="52">
            013
          </text>
          <text className="plate-muted" x="181" y="70">
            014
          </text>
        </g>
      </g>
    ),
  },
  curve: {
    spec: "σ(z) · CLASSIFY",
    art: (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M46 16v60h150" stroke="var(--border-strong)" strokeWidth="1.4" />
        <path
          d="M46 46h150"
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
          strokeWidth="1.2"
        />
        <path
          d="M121 18v58"
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
          strokeWidth="1.2"
        />
        <text className="plate-type plate-muted" fontSize="8.5" textAnchor="end" x="41" y="49">
          0.5
        </text>
        <circle
          cx="64"
          cy="68"
          fill="var(--surface)"
          r="3.2"
          stroke="var(--muted)"
          strokeWidth="1.4"
        />
        <circle
          cx="80"
          cy="64"
          fill="var(--surface)"
          r="3.2"
          stroke="var(--muted)"
          strokeWidth="1.4"
        />
        <circle
          cx="96"
          cy="69"
          fill="var(--surface)"
          r="3.2"
          stroke="var(--muted)"
          strokeWidth="1.4"
        />
        <circle cx="148" cy="24" fill="var(--plate-accent)" r="3.2" />
        <circle cx="166" cy="21" fill="var(--plate-accent)" r="3.2" />
        <circle cx="183" cy="27" fill="var(--plate-accent)" r="3.2" />
        <path d="M50 72C116 72 126 20 192 20" stroke="var(--plate-accent)" strokeWidth="2.4" />
        <circle
          cx="121"
          cy="46"
          fill="var(--surface)"
          r="3.6"
          stroke="var(--plate-accent)"
          strokeWidth="2"
        />
      </g>
    ),
  },
  sampling: {
    spec: "16×16 → 8×8",
    art: (
      <g>
        <rect
          fill="var(--surface)"
          height="62"
          rx="5"
          stroke="var(--border-strong)"
          strokeWidth="1.4"
          width="62"
          x="36"
          y="17"
        />
        <svg height="46" viewBox="0 0 16 16" width="46" x="44" y="25">
          <path
            d="M3 2h1v1h1v1h6V3h1V2h1v2h-1v1h1v1h1v2h1v4h-2v-2h-1v3h-2v-2H6v2H4v-3H3v2H1V8h1V6h1V5h1V4H3z M5 6v2h2V6zm4 0v2h2V6z"
            fill="var(--primary)"
            fillRule="evenodd"
          />
        </svg>
        <path
          d="M108 48h24m-5-5 5 5-5 5"
          fill="none"
          stroke="var(--plate-accent)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <rect
          className="plate-accent-fill"
          height="62"
          rx="5"
          stroke="var(--plate-accent)"
          strokeWidth="1.5"
          width="62"
          x="142"
          y="17"
        />
        <svg height="46" viewBox="0 0 8 8" width="46" x="150" y="25">
          <path
            d="M2 2h4v1h1v1h1v1H6v1H5V5H3v1H2V5H0V4h1V3h1z M2 3v1h1V3zm3 0v1h1V3z"
            fill="var(--plate-accent)"
            fillRule="evenodd"
          />
        </svg>
      </g>
    ),
  },
  ink: {
    spec: "3-INK · QUANTIZE",
    art: (
      <g>
        <rect
          fill="var(--surface)"
          height="50"
          rx="5"
          stroke="var(--border-strong)"
          strokeWidth="1.4"
          width="46"
          x="36"
          y="23"
        />
        <rect fill="var(--primary)" height="12" rx="2" width="14" x="43" y="30" />
        <rect fill="var(--ink-cyan)" height="12" rx="2" width="14" x="61" y="30" />
        <rect fill="var(--ink-magenta)" height="12" rx="2" width="14" x="43" y="46" />
        <rect fill="var(--ink-yellow)" height="12" rx="2" width="14" x="61" y="46" />
        <rect fill="var(--topic-encoding)" height="5" rx="1.5" width="32" x="43" y="62" />
        <path
          d="M92 48h20m-5-5 5 5-5 5"
          fill="none"
          stroke="var(--muted)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <circle
          cx="144"
          cy="48"
          fill="var(--ink-cyan)"
          opacity="0.88"
          r="20"
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
        <circle
          cx="164"
          cy="48"
          fill="var(--ink-magenta)"
          opacity="0.86"
          r="20"
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
        <circle
          cx="184"
          cy="48"
          fill="var(--ink-yellow)"
          opacity="0.86"
          r="20"
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
      </g>
    ),
  },
};

export function AtlasPlate({ labId, featured = false }: { labId: LabId; featured?: boolean }) {
  const { category, title } = labMetadata[labId];
  const specimen = specialPlates[labId] ?? topicSpecimens[category];
  const { spec, art } = specimenDefinitions[specimen];

  return (
    <figure
      aria-hidden={!featured || undefined}
      className={`atlas-plate${featured ? " atlas-plate-featured" : ""}`}
      data-category={category}
    >
      {featured && (
        <figcaption className="atlas-plate-header">
          <span>{title}</span>
          <span>{LAB_CATEGORY_LABELS[category]}</span>
        </figcaption>
      )}
      <svg aria-hidden="true" className="atlas-drawing" viewBox="0 0 240 96">
        {art}
      </svg>
      <span className="atlas-spec">{spec}</span>
    </figure>
  );
}
