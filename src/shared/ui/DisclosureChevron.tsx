import { Icon } from "./Icon";

export type DisclosureChevronProps = {
  open: boolean;
  size?: number;
  /** Any CSS color; defaults to the surrounding text color. */
  color?: string;
  class?: string;
};

/**
 * The shared fold direction for the whole site: a right-pointing chevron while
 * closed, rotating down once the content is open. Use the props to vary size
 * and color per disclosure without changing the direction contract.
 */
export function DisclosureChevron(props: DisclosureChevronProps) {
  return (
    <span
      aria-hidden="true"
      class={`disclosure-chevron${props.class ? ` ${props.class}` : ""}`}
      data-open={props.open ? "true" : "false"}
      style={props.color ? { color: props.color } : undefined}
    >
      <Icon name="chevron-right" size={props.size ?? 14} />
    </span>
  );
}
