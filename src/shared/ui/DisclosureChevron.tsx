import { Icon } from "./Icon";

export type DisclosureChevronDirection = "up" | "down" | "left" | "right";

export type DisclosureChevronProps = {
  open: boolean;
  /** Where the expanded content sits relative to the trigger. Defaults to below. */
  expandDirection?: DisclosureChevronDirection;
  size?: number;
  /** Any CSS color; defaults to the surrounding text color. */
  color?: string;
  class?: string;
};

/**
 * The shared fold affordance for the whole site: a right-pointing chevron while
 * closed, then pointing toward the revealed content once open. Use the props to
 * vary direction, size, and color per disclosure.
 */
export function DisclosureChevron(props: DisclosureChevronProps) {
  return (
    <span
      aria-hidden="true"
      class={`disclosure-chevron${props.class ? ` ${props.class}` : ""}`}
      data-expand-direction={props.expandDirection ?? "down"}
      data-open={props.open ? "true" : "false"}
      style={props.color ? { color: props.color } : undefined}
    >
      <Icon name="chevron-right" size={props.size ?? 14} />
    </span>
  );
}
