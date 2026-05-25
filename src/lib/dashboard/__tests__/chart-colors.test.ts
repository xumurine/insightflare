import { describe, expect, it } from "vitest";

import { buildComplementaryOklchPalette } from "@/lib/dashboard/chart-colors";

describe("dashboard chart color palette", () => {
  it("returns an empty palette for non-positive counts", () => {
    expect(buildComplementaryOklchPalette(0)).toEqual([]);
    expect(buildComplementaryOklchPalette(-3)).toEqual([]);
  });

  it("builds the requested number of hex colors from the default OKLCh base", () => {
    const palette = buildComplementaryOklchPalette(5);

    expect(palette).toHaveLength(5);
    expect(palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
    expect(new Set(palette).size).toBeGreaterThan(1);
  });

  it("accepts shorthand hex, full hex, and OKLCh percentage colors", () => {
    expect(buildComplementaryOklchPalette(1, "#abc")[0]).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
    expect(buildComplementaryOklchPalette(3, "#123456")).toHaveLength(3);
    expect(
      buildComplementaryOklchPalette(3, "oklch(85% 13% 165)"),
    ).toHaveLength(3);
  });

  it("throws for unsupported color formats", () => {
    expect(() => buildComplementaryOklchPalette(2, "rgb(1, 2, 3)")).toThrow(
      /Unsupported color format/,
    );
  });
});
