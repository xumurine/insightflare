import { expect, test } from "@playwright/test";

const adminPassword = process.env.INSIGHTFLARE_E2E_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error(
    "INSIGHTFLARE_E2E_ADMIN_PASSWORD is required. Start E2E through scripts/e2e.ts.",
  );
}

test("automatically registers and logs in the bootstrap administrator", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/zh/login", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(adminPassword);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/api\/public\/session$/);
  await page.goto("/zh/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/zh\/app\/admin-team\/?$/);

  const session = await page.evaluate(async () => {
    const response = await fetch("/api/private/session", {
      credentials: "include",
    });
    return {
      payload: (await response.json()) as {
        data?: {
          teams?: Array<{ slug?: string }>;
          user?: { systemRole?: string; username?: string };
        };
        ok?: boolean;
      },
      status: response.status,
    };
  });

  expect(session.status).toBe(200);
  expect(session.payload.ok).toBe(true);
  expect(session.payload.data?.user).toMatchObject({
    systemRole: "admin",
    username: "admin",
  });
  expect(session.payload.data?.teams).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "admin-team" })]),
  );
  expect(errors.join("\n")).not.toMatch(/hydration|activeTeam/i);
});
