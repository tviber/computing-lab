import { render, screen } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChangeAnimation } from "./useChangeAnimation";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function harness(motion = true, available = true) {
  const preference = new EventTarget();
  Object.assign(preference, { matches: motion });
  vi.stubGlobal("matchMedia", () => preference);
  const animations: { cancel: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn(() => {
    const animation = { cancel: vi.fn() };
    animations.push(animation);
    return animation;
  });
  const [value, setValue] = createSignal(0);
  function Harness() {
    const ref = useChangeAnimation<HTMLButtonElement>(
      () => value(),
      [{ opacity: 0.6 }, { opacity: 1 }],
    );
    return (
      <button
        ref={(node) => {
          if (available) Object.defineProperty(node, "animate", { value: animate });
          ref(node);
        }}
      >
        Result {value()}
      </button>
    );
  }
  const mounted = render(() => <Harness />);
  flush();
  return { ...mounted, preference, animations, animate, setValue };
}

describe("change feedback", () => {
  it("skips initial rendering, updates immediately and keeps focus during repeated edits", () => {
    const { animate, animations, setValue, unmount } = harness();
    const button = screen.getByRole("button");
    button.focus();
    expect(animate).not.toHaveBeenCalled();
    setValue(1);
    flush();
    expect(button).toHaveTextContent("Result 1");
    expect(button).toHaveFocus();
    expect(animate).toHaveBeenCalledTimes(1);
    setValue(2);
    flush();
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button")).toBe(button);
    unmount();
    expect(animations[1].cancel).toHaveBeenCalledOnce();
  });

  it("cancels running feedback when reduced motion is enabled", () => {
    const { animate, animations, preference, setValue } = harness();
    setValue(1);
    flush();
    Object.assign(preference, { matches: false });
    preference.dispatchEvent(new Event("change"));
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    setValue(2);
    flush();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toHaveTextContent("Result 2");
  });

  it("stops feedback in hidden tabs and skips background updates", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const { animate, animations, setValue } = harness();
    setValue(1);
    flush();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    setValue(2);
    flush();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toHaveTextContent("Result 2");
  });

  it.each([
    [false, true],
    [true, false],
  ])("keeps results usable without motion (%s, %s)", (motion, available) => {
    const { animate, setValue } = harness(motion, available);
    setValue(1);
    flush();
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("Result 1");
  });
});
