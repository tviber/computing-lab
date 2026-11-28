import { describe, expect, it } from "vitest";
import { formatDateTime, formatFullDateTime } from "./formatDateTime";

describe("formatDateTime", () => {
  it("converts a UTC ISO string to local time without string slicing", () => {
    const iso = "2026-01-02T03:04:05.000Z";
    const sameYearNow = new Date("2026-06-01T00:00:00.000Z");
    const expected = new Date(iso);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const expectedLocal = `${pad2(expected.getMonth() + 1)}-${pad2(expected.getDate())} ${pad2(expected.getHours())}:${pad2(expected.getMinutes())}`;
    const expectedFull = `${expected.getFullYear()}-${expectedLocal}:${pad2(expected.getSeconds())}`;

    expect(formatDateTime(iso, sameYearNow)).toBe(expectedLocal);
    expect(formatFullDateTime(iso)).toBe(expectedFull);

    // Explicit Shanghai assertion when TZ=Asia/Shanghai (or UTC+8 local env).
    if (expected.getTimezoneOffset() === -480) {
      expect(formatDateTime(iso, sameYearNow)).toBe("01-02 11:04");
      expect(formatFullDateTime(iso)).toBe("2026-01-02 11:04:05");
    }
  });

  it("includes the year when formatting a timestamp from another year", () => {
    const iso = "2026-01-02T03:04:05.000Z";
    const nextYearNow = new Date("2027-02-01T00:00:00.000Z");
    const expected = new Date(iso);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const expectedWithYear = `${expected.getFullYear()}-${pad2(expected.getMonth() + 1)}-${pad2(expected.getDate())} ${pad2(expected.getHours())}:${pad2(expected.getMinutes())}`;

    expect(formatDateTime(iso, nextYearNow)).toBe(expectedWithYear);
    if (expected.getTimezoneOffset() === -480) {
      expect(formatDateTime(iso, nextYearNow)).toBe("2026-01-02 11:04");
    }
  });

  it("accepts Date instances and handles null, undefined, empty, and invalid inputs", () => {
    const date = new Date(2026, 4, 9, 8, 5, 7);
    const now = new Date(2026, 10, 1);
    expect(formatDateTime(date, now)).toBe("05-09 08:05");
    expect(formatFullDateTime(date)).toBe("2026-05-09 08:05:07");

    for (const invalid of [null, undefined, "", "not-a-date", new Date("invalid")]) {
      expect(formatDateTime(invalid, now)).toBe("—");
      expect(formatFullDateTime(invalid)).toBeUndefined();
    }
  });
});
