import { writeFile } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Start E2E through scripts/e2e.ts.`);
  }
  return value;
}

const adminPassword = requiredEnvironmentValue(
  "INSIGHTFLARE_E2E_ADMIN_PASSWORD",
);
const manifestPath = requiredEnvironmentValue("INSIGHTFLARE_E2E_MANIFEST");
const runId = requiredEnvironmentValue("INSIGHTFLARE_E2E_RUN_ID");

async function signIn(page: Page) {
  await page.goto("/zh/login", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill(adminPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(?:api\/public\/session|zh\/app)\/?$/);
}

test("a new administrator can create a team, site, and persistent site settings", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const teamName = "E2E Foundation Team";
  const teamSlug = "e2e-foundation-team";
  const initialSiteName = "E2E Foundation Site";
  const initialDomain = "foundation.example.test";
  const configuredSiteName = "E2E Configured Site";
  const configuredDomain = "configured.example.test";
  const configuredSiteSlug = "configured-example-test";

  await signIn(page);
  await page.goto("/zh/app/manage/teams", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/zh\/app\/manage\/teams\/?$/);

  const bootstrapSession = await page.evaluate(async () => {
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
  expect(bootstrapSession.status).toBe(200);
  expect(bootstrapSession.payload.ok).toBe(true);
  expect(bootstrapSession.payload.data?.user).toMatchObject({
    systemRole: "admin",
    username: "admin",
  });
  expect(bootstrapSession.payload.data?.teams).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "admin-team" })]),
  );

  await expect(
    page.getByRole("row", { name: /Administrator's team/ }),
  ).toBeVisible();
  await page.locator("#admin-team-name").fill(teamName);
  await page.locator("#admin-team-slug").fill(teamSlug);
  const createTeamResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/private/admin/teams") &&
      response.request().method() === "POST",
  );
  await page
    .locator("#admin-team-name")
    .locator("xpath=ancestor::form")
    .locator('button[type="submit"]')
    .click();
  expect((await createTeamResponse).status()).toBe(200);
  await expect(page.getByText(teamName)).toBeVisible();

  await page.goto(`/zh/app/${teamSlug}/manage/sites`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("#admin-site-name")).toBeVisible();
  await expect(page.getByRole("row", { name: "暂无站点数据。" })).toBeVisible();
  await page.locator("#admin-site-name").fill(initialSiteName);
  await page.locator("#admin-site-domain").fill(initialDomain);
  await page.locator("#admin-site-public-slug").fill("e2e-foundation-public");
  await expect(page.locator("#admin-site-name")).toHaveValue(initialSiteName);
  const createSiteResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/private/admin/sites") &&
      response.request().method() === "POST",
    { timeout: 10_000 },
  );
  await page
    .locator("#admin-site-name")
    .locator("xpath=ancestor::form")
    .locator('button[type="submit"]')
    .click();
  expect((await createSiteResponse).status()).toBe(200);
  await expect(page).toHaveURL(
    new RegExp(`/zh/app/${teamSlug}/foundation-example-test/settings$`),
  );

  const siteSettingsForm = page
    .locator("#site-settings-name")
    .locator("xpath=ancestor::form");
  await page.locator("#site-settings-name").fill(configuredSiteName);
  await page.locator("#site-settings-domain").fill(configuredDomain);
  await siteSettingsForm.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(
    new RegExp(`/zh/app/${teamSlug}/${configuredSiteSlug}/settings$`),
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-settings-name")).toHaveValue(
    configuredSiteName,
  );
  await expect(page.locator("#site-settings-domain")).toHaveValue(
    configuredDomain,
  );

  const created = await page.evaluate(
    async ({ teamSlug }) => {
      const sessionResponse = await fetch("/api/private/session", {
        credentials: "include",
      });
      const session = (await sessionResponse.json()) as {
        data?: { teams?: Array<{ id: string; slug: string }> };
        ok?: boolean;
      };
      const team = session.data?.teams?.find(
        (entry) => entry.slug === teamSlug,
      );
      if (!team) {
        return {
          payload: null,
          sessionStatus: sessionResponse.status,
          team: null,
        };
      }

      const sitesResponse = await fetch(
        `/api/private/admin/sites?teamId=${encodeURIComponent(team.id)}`,
        { credentials: "include" },
      );
      return {
        payload: (await sitesResponse.json()) as {
          data?: Array<{
            domain: string;
            id: string;
            name: string;
            teamId: string;
          }>;
          ok?: boolean;
        },
        sessionStatus: sessionResponse.status,
        team,
      };
    },
    { teamSlug },
  );

  expect(created.sessionStatus).toBe(200);
  expect(created.payload?.ok).toBe(true);
  const site = created.payload?.data?.find(
    (entry) => entry.domain === configuredDomain,
  );
  expect(site).toMatchObject({
    name: configuredSiteName,
    teamId: created.team?.id,
  });

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        runId,
        users: { admin: { username: "admin" } },
        teams: { foundation: created.team },
        sites: { foundation: site },
      },
      null,
      2,
    )}\n`,
  );
});
