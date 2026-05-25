/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import { decodeUrlDisplayValue } from "@/lib/dashboard/url-display";

describe("Dashboard URL Display Decoder", () => {
  it("should return the original string if it contains no percentage sequences", () => {
    expect(decodeUrlDisplayValue("/app/dashboard")).toBe("/app/dashboard");
    expect(decodeUrlDisplayValue("hello-world")).toBe("hello-world");
  });

  it("should decode standard valid percentage sequences correctly", () => {
    // "%E4%B8%AD%E6%96%87" is "中文"
    expect(decodeUrlDisplayValue("/path/%E4%B8%AD%E6%96%87")).toBe(
      "/path/中文",
    );
    expect(decodeUrlDisplayValue("%E2%9C%94")).toBe("✔");
  });

  it("should fall back gracefully to the original string for malformed percentage sequences", () => {
    const malformed = "/docs/%E0%A%AB";
    expect(decodeUrlDisplayValue(malformed)).toBe(malformed);

    const incomplete = "/search?q=%E4";
    expect(decodeUrlDisplayValue(incomplete)).toBe(incomplete);
  });

  it("should handle nullish, empty, or whitespace inputs without crashing", () => {
    expect(decodeUrlDisplayValue("")).toBe("");
    expect(decodeUrlDisplayValue("   ")).toBe("   ");
    expect(decodeUrlDisplayValue(null as any)).toBe("");
    expect(decodeUrlDisplayValue(undefined as any)).toBe("");
  });
});
