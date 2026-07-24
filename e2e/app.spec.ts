import { expect, test } from "@playwright/test";

test("serves Hono health checks through the unified Worker", async ({
  request,
}) => {
  const response = await request.get("/healthz");
  expect(response.ok()).toBe(true);
});

test("localizes the root route and selects the demo team", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh\/app\/xeoos-team\/?$/);
});

test("renders and hydrates the widgets construction page", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/zh/app/xeoos-team/widgets");
  await expect(page.getByText("正在施工中")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute(
    "data-overlayscrollbars-initialize",
  );
  expect(errors).toEqual([]);
});

test("public links are present in the server-rendered HTML", async ({
  request,
}) => {
  const response = await request.get("/zh/app/xeoos-team/public-links");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("公开链接");
  expect(html).toContain("SaaS");
  expect(html).toContain("已启用");
});

test("keeps the full version updates dashboard in the server-rendered HTML", async ({
  request,
}) => {
  const response = await request.get("/zh/app/manage/version-updates");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("当前版本");
  expect(html).toContain("最新版本");
  expect(html).toContain("当前提交");
  expect(html).toContain("发布数");
  expect(html).toContain("更新说明");
  expect(html).toContain("查看详细变更");
});

test("keeps client navigation on the server function endpoint", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/zh/app/xeoos-team/widgets");
  const transition = page.locator("[data-page-transition]").first();
  await expect(transition).toHaveAttribute(
    "data-page-transition-ready",
    "true",
  );
  await expect(transition).toHaveAttribute("data-transition", "idle");
  await page
    .locator('a[href="/zh/app/xeoos-team/public-links"]')
    .first()
    .click({ noWaitAfter: true });
  await expect(transition).toHaveAttribute("data-transition", "exit");
  await expect(page).toHaveURL(/\/zh\/app\/xeoos-team\/public-links\/?$/);
  await expect(page.getByText("公开链接").first()).toBeVisible();
  await expect(transition).toHaveAttribute("data-transition", "idle");
  expect(errors).toEqual([]);
});

test("keeps flat and 3D map renderers isolated", async ({ page }) => {
  await page.goto("/zh/app/xeoos-team/acme-corp-com");
  await expect(page.locator('[data-geo-map-mode="flat"]')).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/zh/app/manage/request-observation");
  await expect(page.locator('[data-geo-map-mode="3d"]')).toBeVisible({
    timeout: 15_000,
  });
});

test("loads pages analytics through the client data layer", async ({
  page,
}) => {
  await page.goto("/zh/app/xeoos-team/acme-corp-com/pages");
  await expect(
    page.getByRole("heading", { name: "页面分析" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看详情: /", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("loads the original JetBrains Mono web font", async ({ page }) => {
  await page.goto("/zh/app/xeoos-team/widgets");
  await expect(
    page.locator('link[rel="preload"][as="font"][type="font/woff2"]'),
  ).toHaveCount(1);
  await expect(page.locator("body")).toHaveCSS(
    "font-family",
    /JetBrains Mono Variable/,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fonts.check('400 16px "JetBrains Mono Variable"'),
      ),
    )
    .toBe(true);
});

test("server-renders analytics pages without the migration loading placeholder", async ({
  request,
}) => {
  const response = await request.get("/zh/app/xeoos-team/acme-corp-com");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Corporate Website");
  expect(html).not.toContain('aria-busy="true" aria-label="Loading"');
});
