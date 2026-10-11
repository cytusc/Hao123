// Run against Vite; all API responses are isolated fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const baseURL = process.env.UX_BASE_URL || "http://localhost:5175";

(async () => {
  const { categories } = await import("../src/data.js");
  const defaults = { pinned: [], hidden: [], custom: [], history: {}, personalized: true, largeText: false, showSearch: true, engine: "baidu", version: 1 };
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const errors = [];
  async function fixture({ guest = false, empty = false, pinned = [], catalogError = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript((pinned) => localStorage.setItem("hao123-prefs-v1", JSON.stringify({ pinned, hidden: [], custom: [] })), pinned);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const control = { failPrefs: false, requests: [] };
    await page.route("**/api/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      control.requests.push([endpoint, route.request().method()]);
      let body = {}, status = 200;
      if (endpoint === "/api/catalog") {
        body = { categories: empty ? [] : categories };
        if (catalogError) { status = 503; body = { error: "目录失败" }; }
      }
      if (endpoint === "/api/auth/me") body = { user: guest ? null : { id: 1, name: "测试" } };
      if (endpoint === "/api/preferences") {
        await gate;
        body = { ...defaults, pinned: ["taobao", "zhihu"] };
        if (control.failPrefs) { status = 503; body = { error: "配置暂不可用" }; }
      }
      if (endpoint === "/api/recommendations") body = { common: [], sites: [] };
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    const authResponse = page.waitForResponse("**/api/auth/me");
    await page.goto(baseURL);
    await authResponse;
    return { page, release, control };
  }
  const geometry = (page, selector) => page.locator(selector).evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { height: r.height, columns: getComputedStyle(node).gridTemplateColumns };
  });
  try {
    const logged = await fixture();
    await logged.page.locator('.common-grid[aria-busy="true"]').waitFor();
    assert.equal(await logged.page.locator(".category-sites a").count(), 80, "seed content stays visible");
    assert.equal(await logged.page.locator(".login-button").isDisabled(), true);
    const sizes = new Map();
    for (const width of [1440, 1050, 800, 560, 320]) {
      await logged.page.setViewportSize({ width, height: 1000 });
      sizes.set(width, await geometry(logged.page, ".common-grid"));
      assert.equal(await logged.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.equal(await logged.page.locator(".skeleton").first().evaluate((n) => getComputedStyle(n).animationDuration), "0.9s");
    await logged.page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await logged.page.locator(".skeleton").first().evaluate((n) => getComputedStyle(n).animationName), "none");
    logged.release();
    await logged.page.locator('.common-grid[aria-busy]').waitFor({ state: "detached" });
    for (const [width, before] of sizes) {
      await logged.page.setViewportSize({ width, height: 1000 });
      assert.deepEqual(await geometry(logged.page, ".common-grid"), before, `common layout at ${width}`);
    }
    assert.equal(await logged.page.locator(".skeleton").count(), 0);
    assert.equal(await logged.page.getByRole("textbox", { name: "搜索网站或关键词" }).isEnabled(), true);
    assert.equal(logged.control.requests.some(([, method]) => method === "PUT"), false, "hydration must not save guest preferences");

    const empty = await fixture({ empty: true });
    await empty.page.locator('.category-list[aria-busy="true"]').waitFor();
    for (const width of [1440, 1050, 800, 560, 320]) {
      await empty.page.setViewportSize({ width, height: 1000 });
      await logged.page.setViewportSize({ width, height: 1000 });
      assert.deepEqual(await geometry(empty.page, ".category-list"), await geometry(logged.page, ".category-list"), `directory layout at ${width}`);
    }
    empty.control.failPrefs = true;
    empty.release();
    await empty.page.getByText(/配置加载失败/).waitFor();
    assert.equal(await empty.page.locator(".skeleton").count(), 0, "errors suppress both skeletons");
    empty.control.failPrefs = false;
    await empty.page.getByRole("button", { name: "重试", exact: true }).click();
    await empty.page.locator(".service-notice").waitFor({ state: "detached" });
    assert.equal(await empty.page.locator('.common-grid[aria-busy]').count(), 0);

    for (const options of [{ guest: true }, { pinned: ["taobao"] }, { catalogError: true }]) {
      const current = await fixture(options);
      assert.equal(await current.page.locator(".skeleton").count(), 0);
      current.release();
      await current.page.waitForLoadState("networkidle");
    }
    assert.deepEqual(errors, []);
    console.log("PASS: preference loading/retry, seed preservation, empty directory, error exclusion, reduced motion, no hydration writes, and matching layout at 320–1440px.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
