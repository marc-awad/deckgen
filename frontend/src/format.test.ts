import { describe, expect, it } from "vitest";
import { cardCountLabel, formatDate, formatNumber } from "./format";

describe("formatNumber", () => {
  it("separates thousands with a narrow no-break space, as in French", () => {
    expect(formatNumber(20_000)).toBe("20 000");
  });

  it("leaves small numbers unchanged", () => {
    expect(formatNumber(150)).toBe("150");
  });
});

describe("formatDate", () => {
  it("writes the day, the month in letters and the year", () => {
    // Midday UTC: the same day in every time zone of the CI and the developers
    expect(formatDate("2026-10-13T12:00:00.000Z")).toBe("13 octobre 2026");
  });
});

describe("cardCountLabel", () => {
  it("uses the singular for 0, as in French", () => {
    expect(cardCountLabel(0)).toBe("0 carte");
  });

  it("uses the singular for 1", () => {
    expect(cardCountLabel(1)).toBe("1 carte");
  });

  it("uses the plural from 2", () => {
    expect(cardCountLabel(2)).toBe("2 cartes");
  });
});
