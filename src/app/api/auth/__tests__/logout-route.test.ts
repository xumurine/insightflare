import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/logout/route";

describe("auth logout route", () => {
  it("clears the session cookie and returns the login destination", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { next: "/login" },
    });
    expect(response.headers.get("set-cookie")).toContain("if_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
