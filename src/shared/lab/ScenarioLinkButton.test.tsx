import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScenarioLinkButton } from "./ScenarioLinkButton.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ScenarioLinkButton", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: {
        origin: "http://test.com",
        pathname: "/classes/1/labs/test",
        href: "http://test.com/classes/1/labs/test?stage=9&w=1&foo=1",
      },
      writable: true,
      configurable: true,
    });
  });

  it("copies link with origin + pathname + new params only", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(() => <ScenarioLinkButton search={{ stage: 2, w: 16, h: 8 }} />);

    await user.click(screen.getByRole("button", { name: /复制实验链接/ }));

    expect(writeText).toHaveBeenCalledOnce();
    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.origin).toBe("http://test.com");
    expect(url.pathname).toBe("/classes/1/labs/test");
    expect(url.searchParams.get("stage")).toBe("2");
    expect(url.searchParams.get("w")).toBe("16");
    expect(url.searchParams.get("h")).toBe("8");
    expect(url.searchParams.get("foo")).toBeNull();

    expect(screen.getByText("已复制")).toBeInTheDocument();
  });

  it("shows fallback input with focus when clipboard unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(() => <ScenarioLinkButton search={{ stage: 2, toners: "0,1" }} />);

    await user.click(screen.getByRole("button", { name: /复制实验链接/ }));

    expect(screen.getByText("复制下面的链接")).toBeInTheDocument();
    const input = screen.getByLabelText("实验链接") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toContain("stage=2");
    expect(input.value).toContain("toners=0%2C1");
    expect(input.readOnly).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("cleans up timeout on unmount", () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { unmount } = render(() => <ScenarioLinkButton search={{ stage: 1 }} />);

    screen.getByRole("button").click();
    vi.runOnlyPendingTimers();

    unmount();

    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
