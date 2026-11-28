import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { RushGame } from "./RushGame";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps the 30-second clock in sync with the simulated steps and pauses it", async () => {
  vi.useFakeTimers();
  render(() => <RushGame />);
  fireEvent.click(screen.getByRole("button", { name: "开门！我来接单" }));
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.getByText(/29\.0s/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "暂停营业" }));
  await vi.advanceTimersByTimeAsync(5000);
  expect(screen.getByText(/29\.0s/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "继续营业" })).toBeInTheDocument();
});
