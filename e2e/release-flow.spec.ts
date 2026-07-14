import { writeFile } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Start E2E through scripts/e2e.ts.`);
  }
  return value;
}

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  message?: string;
  ok?: boolean;
};

type User = {
  email: string;
  id: string;
  name: string;
  systemRole: "admin" | "user";
  username: string;
};

type Team = {
  id: string;
  membershipRole?: "admin" | "member" | "owner";
  name: string;
  ownerUserId: string;
  slug: string;
};

type Site = {
  domain: string;
  id: string;
  name: string;
  publicEnabled: boolean | number;
  publicSlug: string | null;
  teamId: string;
};

type Member = {
  role: "admin" | "member" | "owner";
  siteIds: string[];
  teamId: string;
  userId: string;
  username: string;
};

type ApiKey = {
  id: string;
  name: string;
  scopes: string[];
  siteIds: string[];
  status: "active" | "expired" | "revoked";
  teamId: string;
};

type CreatedApiKey = { key: ApiKey; secret: string };

type TeamInvite = {
  id: string;
  payload: { siteIds?: string[]; teamRole?: "admin" | "member" };
  status: "active" | "revoked" | "used" | "expired";
};

type CreatedTeamInvite = { invite: TeamInvite; url: string };

type SeedManifest = {
  apiKeys: Partial<Record<"analyticsRead" | "revoked", CreatedApiKey>>;
  invites: Partial<Record<"active" | "revoked", CreatedTeamInvite>>;
  runId: string;
  sites: Partial<Record<"siteA" | "siteB" | "siteC", Site>>;
  teams: Partial<Record<"teamA" | "teamB", Team>>;
  users: Partial<
    Record<
      "admin" | "memberA" | "outsider" | "ownerA" | "ownerB" | "restrictedA",
      User
    >
  >;
};

const adminPassword = requiredEnvironmentValue(
  "INSIGHTFLARE_E2E_ADMIN_PASSWORD",
);
const manifestPath = requiredEnvironmentValue("INSIGHTFLARE_E2E_MANIFEST");
const runId = requiredEnvironmentValue("INSIGHTFLARE_E2E_RUN_ID");
const testSiteURL = requiredEnvironmentValue("INSIGHTFLARE_E2E_TEST_SITE_URL");
const ownerAPassword = "e2e-owner-a-password";
const ownerBPassword = "e2e-owner-b-password";
const memberAPassword = "e2e-member-a-password";
const restrictedAPassword = "e2e-restricted-a-password";
const outsiderPassword = "e2e-outsider-password";

const seed: SeedManifest = {
  apiKeys: {},
  invites: {},
  runId,
  users: {
    admin: {
      id: "",
      username: "admin",
      email: "",
      name: "",
      systemRole: "admin",
    },
  },
  teams: {},
  sites: {},
};

async function saveManifest() {
  await writeFile(manifestPath, `${JSON.stringify(seed, null, 2)}\n`);
}

async function signIn(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  const securityConfig = page.waitForResponse(
    (response) =>
      response.url().includes("/api/public/login-security") &&
      response.request().method() === "GET",
  );
  await page.goto("/zh/login", { waitUntil: "domcontentloaded" });
  expect((await securityConfig).status()).toBe(200);
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/public/session") &&
      response.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/(?:api\/public\/session|zh\/app)\/?$/);
}

async function apiRequest<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  cache?: RequestCache,
) {
  return page.evaluate(
    async ({ body, cache, method, path }) => {
      const response = await fetch(path, {
        cache,
        method,
        credentials: "include",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        payload: (await response.json()) as ApiEnvelope<T>,
        status: response.status,
      };
    },
    { body, cache, method, path },
  );
}

async function createSiteThroughUi(
  page: Page,
  input: {
    domain: string;
    name: string;
    publicSlug: string;
    teamSlug: string;
    waitForHydration?: boolean;
  },
) {
  const sitesLoaded = input.waitForHydration
    ? page.waitForResponse(
        (response) =>
          response.url().includes("/api/private/admin/sites") &&
          response.request().method() === "GET",
      )
    : null;
  await page.goto(`/zh/app/${input.teamSlug}/manage/sites`, {
    waitUntil: "domcontentloaded",
  });
  if (sitesLoaded) expect((await sitesLoaded).status()).toBe(200);
  await expect(page.locator("#admin-site-name")).toBeVisible();
  await page.locator("#admin-site-name").fill(input.name);
  await page.locator("#admin-site-domain").fill(input.domain);
  await page.locator("#admin-site-public-slug").fill(input.publicSlug);
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/private/admin/sites") &&
      response.request().method() === "POST",
  );
  await page
    .locator("#admin-site-name")
    .locator("xpath=ancestor::form")
    .locator('button[type="submit"]')
    .click();
  const createResponse = await created;
  expect(createResponse.status()).toBe(200);
  const payload = (await createResponse.json()) as ApiEnvelope<Site>;
  expect(payload).toMatchObject({
    data: { domain: input.domain, name: input.name },
    ok: true,
  });
  const routeSlug = input.domain
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  await expect(page).toHaveURL(
    new RegExp(`/zh/app/${input.teamSlug}/${routeSlug}/settings$`),
  );
}

test.describe.serial("release E2E flow", () => {
  test("1. bootstrap administrator can authenticate with a real session", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, "admin", adminPassword);

    const session = await apiRequest<{
      user?: User;
    }>(page, "GET", "/api/private/session");
    expect(session.status).toBe(200);
    expect(session.payload.ok).toBe(true);
    expect(session.payload.data?.user).toMatchObject({
      systemRole: "admin",
      username: "admin",
    });
    seed.users.admin = session.payload.data?.user;
    await saveManifest();
  });

  test("2. administrator creates the isolated account and team topology", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, "admin", adminPassword);
    await page.goto("/zh/app/manage/users", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#admin-user-username")).toBeVisible();

    const accounts = [
      {
        key: "ownerA" as const,
        name: "E2E Owner A",
        password: ownerAPassword,
        teamKey: "teamA" as const,
        teamName: "E2E Team A",
        teamSlug: "e2e-team-a",
        username: "owner-a",
      },
      {
        key: "memberA" as const,
        name: "E2E Member A",
        password: memberAPassword,
        teamKey: undefined,
        teamName: "E2E Member A Workspace",
        teamSlug: "e2e-member-a",
        username: "member-a",
      },
      {
        key: "restrictedA" as const,
        name: "E2E Restricted A",
        password: restrictedAPassword,
        teamKey: undefined,
        teamName: "E2E Restricted A Workspace",
        teamSlug: "e2e-restricted-a",
        username: "restricted-a",
      },
      {
        key: "ownerB" as const,
        name: "E2E Owner B",
        password: ownerBPassword,
        teamKey: "teamB" as const,
        teamName: "E2E Team B",
        teamSlug: "e2e-team-b",
        username: "owner-b",
      },
      {
        key: "outsider" as const,
        name: "E2E Outsider",
        password: outsiderPassword,
        teamKey: undefined,
        teamName: "E2E Outsider Workspace",
        teamSlug: "e2e-outsider",
        username: "outsider",
      },
    ];

    for (const account of accounts) {
      const created = await apiRequest<User & { team: Team }>(
        page,
        "POST",
        "/api/private/admin/users",
        {
          email: `${account.username}@example.test`,
          name: account.name,
          password: account.password,
          systemRole: "user",
          teamName: account.teamName,
          teamSlug: account.teamSlug,
          username: account.username,
        },
      );
      expect(created.status).toBe(200);
      expect(created.payload.ok).toBe(true);
      expect(created.payload.data).toMatchObject({
        systemRole: "user",
        username: account.username,
      });
      expect(created.payload.data?.team).toMatchObject({
        name: account.teamName,
        slug: account.teamSlug,
      });
      seed.users[account.key] = created.payload.data;
      if (account.teamKey)
        seed.teams[account.teamKey] = created.payload.data?.team;
    }

    expect(seed.teams.teamA?.ownerUserId).toBe(seed.users.ownerA?.id);
    expect(seed.teams.teamB?.ownerUserId).toBe(seed.users.ownerB?.id);
    await saveManifest();
  });

  test("3. team owners create sites and persist site settings through the UI", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const teamA = seed.teams.teamA;
    const teamB = seed.teams.teamB;
    expect(teamA).toBeDefined();
    expect(teamB).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    await createSiteThroughUi(page, {
      teamSlug: teamA?.slug || "",
      name: "E2E Site A",
      domain: "e2e-site-a.example.test",
      publicSlug: "e2e-site-a",
      waitForHydration: true,
    });

    const settingsForm = page
      .locator("#site-settings-name")
      .locator("xpath=ancestor::form");
    await page.locator("#site-settings-name").fill("E2E Analytics Site A");
    await page
      .locator("#site-settings-domain")
      .fill("analytics-a.example.test");
    await settingsForm.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(
      new RegExp(`/zh/app/${teamA?.slug}/analytics-a-example-test/settings$`),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#site-settings-name")).toHaveValue(
      "E2E Analytics Site A",
    );
    await expect(page.locator("#site-settings-domain")).toHaveValue(
      "analytics-a.example.test",
    );

    await createSiteThroughUi(page, {
      teamSlug: teamA?.slug || "",
      name: "E2E Site B",
      domain: "e2e-site-b.example.test",
      publicSlug: "e2e-site-b",
      waitForHydration: true,
    });

    const teamASites = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(teamASites.status).toBe(200);
    const persistedSiteA = teamASites.payload.data?.find(
      (site) => site.domain === "analytics-a.example.test",
    );
    expect(persistedSiteA).toMatchObject({
      domain: "analytics-a.example.test",
      name: "E2E Analytics Site A",
      teamId: teamA?.id,
    });
    seed.sites.siteA = persistedSiteA;
    seed.sites.siteB = teamASites.payload.data?.find(
      (site) => site.domain === "e2e-site-b.example.test",
    );
    await saveManifest();

    await signIn(page, "owner-b", ownerBPassword);
    await createSiteThroughUi(page, {
      teamSlug: teamB?.slug || "",
      name: "E2E Site C",
      domain: "e2e-site-c.example.test",
      publicSlug: "e2e-site-c",
      waitForHydration: true,
    });
    const teamBSites = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamB?.id || "")}`,
    );
    expect(teamBSites.status).toBe(200);
    seed.sites.siteC = teamBSites.payload.data?.find(
      (site) => site.domain === "e2e-site-c.example.test",
    );
    expect(seed.sites.siteC).toMatchObject({ teamId: teamB?.id });
    await saveManifest();
  });

  test("4. Team A owner assigns full and site-scoped member access", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const teamA = seed.teams.teamA;
    const siteA = seed.sites.siteA;
    const memberA = seed.users.memberA;
    const restrictedA = seed.users.restrictedA;
    expect(teamA).toBeDefined();
    expect(siteA).toBeDefined();
    expect(memberA).toBeDefined();
    expect(restrictedA).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    const fullAccess = await apiRequest<Member>(
      page,
      "POST",
      "/api/private/admin/members",
      {
        identifier: memberA?.username || "",
        role: "member",
        siteIds: [],
        teamId: teamA?.id || "",
      },
    );
    expect(fullAccess.status).toBe(200);
    expect(fullAccess.payload.data).toMatchObject({
      role: "member",
      siteIds: [],
      userId: memberA?.id,
    });

    const scopedAccess = await apiRequest<Member>(
      page,
      "POST",
      "/api/private/admin/members",
      {
        identifier: restrictedA?.username || "",
        role: "member",
        siteIds: [siteA?.id || ""],
        teamId: teamA?.id || "",
      },
    );
    expect(scopedAccess.status).toBe(200);
    expect(scopedAccess.payload.data).toMatchObject({
      role: "member",
      siteIds: [siteA?.id],
      userId: restrictedA?.id,
    });

    const members = await apiRequest<Member[]>(
      page,
      "GET",
      `/api/private/admin/members?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(members.status).toBe(200);
    expect(members.payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: memberA?.id, siteIds: [] }),
        expect.objectContaining({
          userId: restrictedA?.id,
          siteIds: [siteA?.id],
        }),
      ]),
    );
    await saveManifest();
  });

  test("5. member site access is enforced and cross-team reads are denied", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const teamA = seed.teams.teamA;
    const siteA = seed.sites.siteA;
    const siteB = seed.sites.siteB;
    const teamB = seed.teams.teamB;
    expect(teamA).toBeDefined();
    expect(siteA).toBeDefined();
    expect(siteB).toBeDefined();
    expect(teamB).toBeDefined();

    await signIn(page, "member-a", memberAPassword);
    const fullMemberSites = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(fullMemberSites.status).toBe(200);
    expect(fullMemberSites.payload.data?.map((site) => site.id).sort()).toEqual(
      [siteA?.id, siteB?.id].sort(),
    );

    await signIn(page, "restricted-a", restrictedAPassword);
    const restrictedSites = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(restrictedSites.status).toBe(200);
    expect(restrictedSites.payload.data?.map((site) => site.id)).toEqual([
      siteA?.id,
    ]);
    const deniedSiteConfig = await apiRequest<unknown>(
      page,
      "GET",
      `/api/private/admin/site-config?siteId=${encodeURIComponent(siteB?.id || "")}`,
    );
    expect(deniedSiteConfig.status).toBe(403);

    await signIn(page, "outsider", outsiderPassword);
    const outsiderTeamRead = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(outsiderTeamRead.status).toBe(403);
    const outsiderOtherTeamRead = await apiRequest<Site[]>(
      page,
      "GET",
      `/api/private/admin/sites?teamId=${encodeURIComponent(teamB?.id || "")}`,
    );
    expect(outsiderOtherTeamRead.status).toBe(403);
  });

  test("6. team owner creates scoped API keys and members cannot manage them", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const teamA = seed.teams.teamA;
    const siteA = seed.sites.siteA;
    expect(teamA).toBeDefined();
    expect(siteA).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    const analyticsRead = await apiRequest<CreatedApiKey>(
      page,
      "POST",
      "/api/private/admin/api-keys",
      {
        expiresInDays: 30,
        name: "E2E Analytics Site A Read",
        scopes: ["analytics:read"],
        siteIds: [siteA?.id || ""],
        teamId: teamA?.id || "",
      },
    );
    expect(analyticsRead.status).toBe(200);
    expect(analyticsRead.payload.data).toMatchObject({
      key: {
        name: "E2E Analytics Site A Read",
        scopes: ["analytics:read"],
        siteIds: [siteA?.id],
        status: "active",
        teamId: teamA?.id,
      },
    });
    expect(analyticsRead.payload.data?.secret).toMatch(/^ifk_live_/);
    seed.apiKeys.analyticsRead = analyticsRead.payload.data;

    const revocable = await apiRequest<CreatedApiKey>(
      page,
      "POST",
      "/api/private/admin/api-keys",
      {
        expiresInDays: 30,
        name: "E2E Revoked Key",
        scopes: ["site:read"],
        siteIds: [siteA?.id || ""],
        teamId: teamA?.id || "",
      },
    );
    expect(revocable.status).toBe(200);
    const revoked = await apiRequest<ApiKey>(
      page,
      "PATCH",
      "/api/private/admin/api-keys",
      {
        intent: "revoke",
        keyId: revocable.payload.data?.key.id || "",
        teamId: teamA?.id || "",
      },
    );
    expect(revoked.status).toBe(200);
    expect(revoked.payload.data).toMatchObject({
      id: revocable.payload.data?.key.id,
      status: "revoked",
    });
    seed.apiKeys.revoked = revocable.payload.data;

    const listed = await apiRequest<ApiKey[]>(
      page,
      "GET",
      `/api/private/admin/api-keys?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(listed.status).toBe(200);
    expect(listed.payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: analyticsRead.payload.data?.key.id }),
        expect.objectContaining({
          id: revocable.payload.data?.key.id,
          status: "revoked",
        }),
      ]),
    );
    expect(JSON.stringify(listed.payload.data)).not.toContain(
      analyticsRead.payload.data?.secret || "",
    );
    await saveManifest();

    await signIn(page, "member-a", memberAPassword);
    const denied = await apiRequest<ApiKey[]>(
      page,
      "GET",
      `/api/private/admin/api-keys?teamId=${encodeURIComponent(teamA?.id || "")}`,
    );
    expect(denied.status).toBe(403);
  });

  test("7. team invites preserve site scope, support registration, and can be revoked", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const teamA = seed.teams.teamA;
    const siteA = seed.sites.siteA;
    expect(teamA).toBeDefined();
    expect(siteA).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    const active = await apiRequest<CreatedTeamInvite>(
      page,
      "POST",
      "/api/private/admin/team-invites",
      {
        email: "invitee-a@example.test",
        expiresInHours: 24,
        role: "member",
        siteIds: [siteA?.id || ""],
        teamId: teamA?.id || "",
      },
    );
    expect(active.status).toBe(200);
    expect(active.payload.data).toMatchObject({
      invite: {
        payload: { siteIds: [siteA?.id], teamRole: "member" },
        status: "active",
      },
    });
    seed.invites.active = active.payload.data;
    const token = new URL(
      active.payload.data?.url || "http://invalid/",
    ).hash.replace(/^#token=/, "");
    expect(token).not.toBe("");

    await page.context().clearCookies();
    const inspected = await apiRequest<{ allowsRegistration: boolean }>(
      page,
      "POST",
      "/api/public/account-links/inspect",
      { token },
    );
    expect(inspected.status).toBe(200);
    expect(inspected.payload.data).toMatchObject({ allowsRegistration: true });
    const accepted = await apiRequest<{ user: User }>(
      page,
      "POST",
      "/api/public/account-links/complete",
      {
        email: "invitee-a@example.test",
        name: "E2E Invitee A",
        password: "e2e-invitee-a-password",
        token,
        username: "invitee-a",
      },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.payload.data?.user).toMatchObject({
      username: "invitee-a",
    });
    const reused = await apiRequest<unknown>(
      page,
      "POST",
      "/api/public/account-links/complete",
      { token },
    );
    expect(reused.status).toBe(400);

    await signIn(page, "owner-a", ownerAPassword);
    const revocable = await apiRequest<CreatedTeamInvite>(
      page,
      "POST",
      "/api/private/admin/team-invites",
      {
        email: "revoked-invite@example.test",
        expiresInHours: 24,
        role: "member",
        siteIds: [],
        teamId: teamA?.id || "",
      },
    );
    expect(revocable.status).toBe(200);
    const revoked = await apiRequest<TeamInvite>(
      page,
      "PATCH",
      "/api/private/admin/team-invites",
      {
        intent: "revoke",
        inviteId: revocable.payload.data?.invite.id || "",
        teamId: teamA?.id || "",
      },
    );
    expect(revoked.status).toBe(200);
    expect(revoked.payload.data).toMatchObject({ status: "revoked" });
    seed.invites.revoked = revocable.payload.data;
    await saveManifest();

    await page.context().clearCookies();
    const revokedToken = new URL(
      revocable.payload.data?.url || "http://invalid/",
    ).hash.replace(/^#token=/, "");
    const revokedInspection = await apiRequest<unknown>(
      page,
      "POST",
      "/api/public/account-links/inspect",
      { token: revokedToken },
    );
    expect(revokedInspection.status).toBe(400);
  });

  test("8. public sharing only resolves while the owner enables its slug", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const siteA = seed.sites.siteA;
    expect(siteA).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    const enabled = await apiRequest<Site>(
      page,
      "PATCH",
      "/api/private/admin/sites",
      {
        publicEnabled: true,
        publicSlug: "e2e-analytics-a",
        siteId: siteA?.id || "",
      },
    );
    expect(enabled.status).toBe(200);
    expect(enabled.payload.data).toMatchObject({
      id: siteA?.id,
      publicEnabled: true,
      publicSlug: "e2e-analytics-a",
    });
    seed.sites.siteA = enabled.payload.data;
    await saveManifest();

    await page.context().clearCookies();
    const publicSite = await apiRequest<{ id: string; name: string }>(
      page,
      "GET",
      "/api/public/share/e2e-analytics-a/site",
      undefined,
      "no-store",
    );
    expect(publicSite.status).toBe(200);
    expect(publicSite.payload.data).toMatchObject({ id: siteA?.id });

    await signIn(page, "owner-a", ownerAPassword);
    const disabled = await apiRequest<Site>(
      page,
      "PATCH",
      "/api/private/admin/sites",
      { publicEnabled: false, siteId: siteA?.id || "" },
    );
    expect(disabled.status).toBe(200);
    expect(disabled.payload.data).toMatchObject({
      id: siteA?.id,
      publicEnabled: false,
      publicSlug: "",
    });
    await page.context().clearCookies();
    const unavailable = await apiRequest<unknown>(
      page,
      "GET",
      "/api/public/share/e2e-analytics-a/site",
      undefined,
      "no-store",
    );
    expect(unavailable.status).toBe(404);
  });

  test("9. real browser tracking reaches the DO and persists pageviews and events", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const siteA = seed.sites.siteA;
    expect(siteA).toBeDefined();

    await signIn(page, "owner-a", ownerAPassword);
    const trackingConfig = await apiRequest<Record<string, unknown>>(
      page,
      "POST",
      "/api/private/admin/site-config",
      {
        config: { domainWhitelist: ["127.0.0.1"] },
        siteId: siteA?.id || "",
      },
    );
    expect(trackingConfig.status).toBe(200);

    const collectPayloads: Array<{ kind?: string; pathname?: string }> = [];
    page.on("request", (request) => {
      if (!request.url().endsWith("/collect") || request.method() !== "POST")
        return;
      try {
        collectPayloads.push(
          JSON.parse(request.postData() || "{}") as {
            kind?: string;
            pathname?: string;
          },
        );
      } catch {
        // The request itself remains the authoritative browser-side evidence.
      }
    });
    await page.context().clearCookies();
    await page.goto(
      `${testSiteURL}/?siteId=${encodeURIComponent(siteA?.id || "")}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("#signup")).toBeVisible();
    await page.locator("#signup").click();
    await page.locator("#spa-route").click();
    await expect
      .poll(
        () =>
          collectPayloads.filter((entry) => entry.kind === "pageview").length,
      )
      .toBeGreaterThanOrEqual(2);
    expect(collectPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "custom_event", pathname: "/" }),
        expect.objectContaining({
          kind: "pageview",
          pathname: "/spa/checkout",
        }),
      ]),
    );

    await signIn(page, "admin", adminPassword);
    const flushed = await apiRequest<{ flushed: boolean; siteId: string }>(
      page,
      "POST",
      "/api/private/admin/e2e/flush",
      { siteId: siteA?.id || "" },
    );
    expect(flushed.status).toBe(200);
    expect(flushed.payload.data).toEqual({ flushed: true, siteId: siteA?.id });
    const performance = await apiRequest<unknown>(
      page,
      "GET",
      "/api/private/admin/system-performance?minutes=15",
    );
    expect(performance.status).toBe(200);
    const systemPerformance = performance.payload as unknown as {
      summary?: { customEvents?: number; visits?: number };
    };
    expect(systemPerformance.summary?.visits).toBeGreaterThanOrEqual(1);
    expect(systemPerformance.summary?.customEvents).toBeGreaterThanOrEqual(1);
  });
});
