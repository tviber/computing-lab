import { render, screen } from "@solidjs/testing-library";
import { createSignal, flush, Show } from "solid-js";
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
  const animations: (EventTarget & {
    playState: AnimationPlayState;
    cancel: ReturnType<typeof vi.fn>;
  })[] = [];
  const animate = vi.fn(() => {
    const animation = Object.assign(new EventTarget(), {
      playState: "running" as AnimationPlayState,
      cancel: vi.fn(() => {
        animation.playState = "idle";
        animation.dispatchEvent(new Event("cancel"));
      }),
    });
    animations.push(animation);
    return animation;
  });
  const [value, setValue] = createSignal<number | undefined>(0);
  const [visible, setVisible] = createSignal(true);
  function Harness() {
    const ref = useChangeAnimation<HTMLButtonElement>(
      () => value(),
      [{ opacity: 0.6 }, { opacity: 1 }],
    );
    return (
      <Show when={visible()}>
        <button
          ref={(node) => {
            if (available) Object.defineProperty(node, "animate", { value: animate });
            ref(node);
          }}
        >
          Result {value()}
        </button>
      </Show>
    );
  }
  const mounted = render(() => <Harness />);
  flush();
  return { ...mounted, preference, animations, animate, setValue, setVisible };
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

  it.each(["finish", "cancel"])("releases listeners as soon as feedback emits %s", (event) => {
    const { animations, preference, setValue, unmount } = harness();
    const addPreference = vi.spyOn(preference, "addEventListener");
    const removePreference = vi.spyOn(preference, "removeEventListener");
    const addDocument = vi.spyOn(document, "addEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    setValue(1);
    flush();
    const animation = animations[0];
    animation.playState = event === "finish" ? "finished" : "idle";
    animation.dispatchEvent(new Event(event));
    expect(removePreference).toHaveBeenCalledWith("change", addPreference.mock.calls[0][1]);
    expect(removeDocument).toHaveBeenCalledWith(
      "visibilitychange",
      addDocument.mock.calls.find(([type]) => type === "visibilitychange")![1],
    );
    preference.dispatchEvent(new Event("change"));
    unmount();
    expect(animation.cancel).not.toHaveBeenCalled();
    expect(removePreference).toHaveBeenCalledTimes(1);
  });

  it("ignores detached nodes and starts a fresh baseline when a node is remounted", () => {
    const { animate, setValue, setVisible } = harness();
    const first = screen.getByRole("button");
    setVisible(false);
    flush();
    expect(first.isConnected).toBe(false);
    setValue(1);
    flush();
    expect(animate).not.toHaveBeenCalled();
    setVisible(true);
    flush();
    expect(screen.getByRole("button")).not.toBe(first);
    expect(animate).not.toHaveBeenCalled();
    setValue(2);
    flush();
    expect(animate).toHaveBeenCalledOnce();
  });

  it("resets the baseline for unavailable values", () => {
    const { animate, animations, setValue } = harness();
    setValue(1);
    flush();
    setValue(undefined);
    flush();
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    setValue(0);
    flush();
    expect(animate).toHaveBeenCalledOnce();
    setValue(1);
    flush();
    expect(animate).toHaveBeenCalledTimes(2);
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
