import { createSignal, For } from "solid-js";
import { labMetadata, type LabId } from "../../shared/lab/labMetadata";
import { SegmentedPicker } from "../../shared/ui/SegmentedPicker";
import { useChangeAnimation } from "../../shared/ui/useChangeAnimation";
import { AtlasPlate } from "./AtlasPlate";

const FEATURED_LABS: readonly LabId[] = [
  "calculator",
  "image-sampling",
  "lunch-shift",
  "logistic-regression",
];

/** A manually selected deck; every specimen stays mounted in its own spatial slot. */
export function FeaturedLabDeck(props: { labs?: readonly [LabId, ...LabId[]] }) {
  const labs = () => props.labs ?? FEATURED_LABS;
  const [selection, setSelected] = createSignal<LabId>(labs()[0]);
  const selected = () => (labs().includes(selection()) ? selection() : labs()[0]);
  const selectedIndex = () => labs().indexOf(selected());
  const descriptionRef = useChangeAnimation<HTMLParagraphElement>(
    () => selected(),
    [
      { opacity: 0.6, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
  );

  return (
    <div class="featured-lab-deck">
      <div aria-label="实验示意" class="featured-lab-stage">
        <For each={labs()}>
          {(id, index) => {
            const role = () => {
              const slot = (index() - selectedIndex() + labs().length) % labs().length;
              if (slot === 0) return "active";
              if (slot === 1) return "next";
              if (slot === labs().length - 1) return "prev";
              return "back";
            };
            return (
              <div
                aria-hidden={selected() !== id ? "true" : undefined}
                class="featured-lab-card"
                data-role={role()}
              >
                <AtlasPlate featured labId={id} />
              </div>
            );
          }}
        </For>
      </div>
      <SegmentedPicker
        class="home-specimen-tabs featured-lab-tabs"
        itemClass="home-specimen-tab"
        label="切换实验示意"
        onChange={setSelected}
        options={labs().map((id) => ({
          value: id,
          label: (
            <>
              <span aria-hidden="true" class="topic-dot" />
              {labMetadata[id].title}
            </>
          ),
          data: { "data-category": labMetadata[id].category },
        }))}
        value={selected()}
      />
      <p aria-live="polite" class="featured-lab-description" ref={descriptionRef}>
        {labMetadata[selected()].description}
      </p>
    </div>
  );
}
