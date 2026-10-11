// Run with a local Vite server. API fixtures never access a real account or database.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to an existing browser toolchain.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const baseURL = process.env.UX_BASE_URL || "http://localhost:5175";
const output = path.resolve(__dirname, "../artifacts/ux-polish");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const { categories, defaultIds } = await import("../src/data.js");
  const allSites = categories.flatMap((category) => category.sites);
  const site = (id) => allSites.find((entry) => entry.id === id);
  const defaults = { pinned: [], hidden: [], custom: [], history: {}, personalized: true, largeText: false, showSearch: true, engine: "baidu", version: 1 };
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  async function fixture(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options.context });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    let prefs = { ...defaults, ...options.prefs };
    const controls = { historyError: false, catalogError: false, delay: 0, ...options.controls };
    const requests = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      requests.push({ endpoint, method: request.method() });
      if (controls.delay && ["/api/catalog", "/api/auth/me"].includes(endpoint)) {
        await new Promise((resolve) => setTimeout(resolve, controls.delay));
      }
      let status = 200;
      let body = {};
      if (endpoint === "/api/catalog") {
        status = controls.catalogError ? 503 : 200;
        body = controls.catalogError ? { error: "目录暂不可用" } : { categories: options.categories || categories };
      } else if (endpoint === "/api/auth/me") body = { user: options.user ? { id: 1, name: "体验测试", email: "ux@example.invalid" } : null };
      else if (endpoint === "/api/preferences") {
        if (request.method() === "PUT") prefs = { ...prefs, ...request.postDataJSON(), version: prefs.version + 1 };
        body = prefs;
      } else if (endpoint === "/api/recommendations") body = {
        common: [site("zhihu"), site("zhihu"), site("deepseek")],
        sites: [{ ...site("kimi"), reason: "近期常用" }], method: "fixture",
      };
      else if (endpoint === "/api/history" && controls.historyError) {
        status = 503;
        body = { error: "清空失败：请稍后重试。" + "很长的错误说明".repeat(12) + "https://example.invalid/" + "x".repeat(100) };
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.locator(".category-row").first().waitFor();
    return { page, context, controls, requests };
  }
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const toastShown = (page) => page.locator('.toast[data-phase="show"]').waitFor();
  try {
    const guest = await fixture({ controls: { delay: 1400 } });
    assert.equal(await guest.page.locator(".category-row").count(), 8, "seed catalog must be immediately available");
    assert.equal(await guest.page.locator(".new-dot, .skeleton").count(), 0);
    await guest.page.keyboard.press("Tab");
    assert.equal(await guest.page.evaluate(() => document.activeElement.className), "skip-link");
    await guest.page.keyboard.press("Enter");
    assert.equal(await guest.page.evaluate(() => document.activeElement.id), "main-content");
    await guest.page.keyboard.press("Tab");
    assert.equal(await guest.page.evaluate(() => document.activeElement.textContent.trim()), "管理");
    assert.equal(await guest.page.locator(".skip-link").evaluate((node) => node.getBoundingClientRect().bottom <= 0), true, "skip link must hide again after focus leaves");
    await guest.page.waitForLoadState("networkidle");
    assert.deepEqual(await guest.page.locator(".search-suggestions a").allTextContents(), ["铁路12306", "中国天气网", "快递100", "百度翻译"]);
    assert.equal(await guest.page.locator(".ai-discovery").count(), 0);
    assert.equal(await guest.page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /fonts\.(googleapis|gstatic)/.test(entry.name))), false);
    await guest.page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
    await guest.page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
    guest.controls.catalogError = true;
    await guest.page.reload({ waitUntil: "networkidle" });
    assert.equal(await guest.page.locator(".category-row").count(), 8);
    assert.match(await guest.page.locator(".service-notice").innerText(), /本机精选目录/);
    guest.controls.catalogError = false;
    guest.controls.delay = 0;
    await guest.page.getByRole("button", { name: "重试", exact: true }).click();
    await guest.page.locator(".service-notice").waitFor({ state: "detached" });
    await guest.page.locator(".common-link").first().hover();
    await guest.page.waitForTimeout(180);
    assert.equal(await guest.page.locator(".common-link .site-mark").first().evaluate((node) => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, -2)");
    await guest.page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await guest.page.locator(".common-link .site-mark").first().evaluate((node) => getComputedStyle(node).transform), "none");
    await guest.page.evaluate(() => {
      const original = Element.prototype.scrollIntoView;
      window.scrollBehaviors = [];
      Element.prototype.scrollIntoView = function (options) { window.scrollBehaviors.push(options.behavior); return original.call(this, options); };
    });
    await guest.page.getByRole("textbox", { name: "搜索网站或关键词" }).fill("完全没有此网站");
    await guest.page.getByRole("button", { name: "搜索一下" }).click();
    await guest.page.getByText("还没有找到这个网站", { exact: true }).waitFor();
    await guest.page.waitForFunction(() => document.querySelector("main [role=status]").textContent.includes("找到 0"));
    await guest.page.getByRole("button", { name: "我的常用", exact: true }).click();
    assert.deepEqual(await guest.page.evaluate(() => window.scrollBehaviors), ["auto", "auto"]);
    await guest.page.getByRole("button", { name: "首页设置", exact: true }).click();
    await guest.page.locator("dialog").click({ position: { x: 3, y: 3 } });
    assert.equal(await guest.page.getByRole("dialog", { name: "让首页更顺手" }).count(), 1, "clicking dialog padding must not dismiss it");
    await guest.page.getByRole("button", { name: "清空点击记录", exact: true }).click();
    await toastShown(guest.page);
    assert.equal(await guest.page.locator("dialog .toast .lucide-check").count(), 1);
    assert.equal(await guest.page.locator("dialog .toast").evaluate((node) => getComputedStyle(node).transitionDuration), "0s");
    await guest.page.locator(".toast-close").focus();
    await guest.page.waitForTimeout(2900);
    assert.equal(await guest.page.locator(".toast").count(), 1, "focused notification must pause expiry");
    await guest.page.getByRole("button", { name: "关闭提示" }).click();
    assert.equal(await guest.page.locator(".toast").count(), 0);
    assert.equal(await guest.page.evaluate(() => document.activeElement.textContent.trim()), "清空点击记录");
    await guest.page.getByRole("button", { name: "关闭", exact: true }).click();

    const logged = await fixture({ user: true, prefs: { pinned: ["taobao"], hidden: ["deepseek"] } });
    await logged.page.waitForLoadState("networkidle");
    assert.deepEqual(await logged.page.locator(".search-suggestions a").allTextContents(), ["淘宝", "知乎", "铁路12306", "中国天气网"]);
    assert.equal(await logged.page.locator(".personal-discovery").count(), 1);
    assert.equal(await logged.page.getByText("试试 AI 新工具", { exact: true }).count(), 0);
    await logged.page.getByRole("button", { name: "首页设置", exact: true }).click();
    logged.controls.historyError = true;
    await logged.page.getByRole("button", { name: "清空点击记录", exact: true }).click();
    await toastShown(logged.page);
    assert.equal(await logged.page.locator("dialog .toast").getAttribute("data-kind"), "error");
    assert.equal(await logged.page.locator("dialog .toast .lucide-check").count(), 0);
    await logged.page.waitForFunction(() => document.querySelector("dialog [role=alert]").textContent.startsWith("清空失败"));
    await logged.page.mouse.move(0, 0);
    await logged.page.waitForTimeout(3100);
    assert.equal(await logged.page.locator(".toast").count(), 1, "error must remain until dismissal");
    await logged.page.getByRole("button", { name: "关闭", exact: true }).click();
    await toastShown(logged.page);
    assert.equal(await logged.page.locator("dialog .toast").count(), 0);
    assert.equal(await logged.page.locator(".toast[data-kind=error]").count(), 1, "closing dialog preserves unread error");
    await logged.page.getByRole("button", { name: "关闭提示" }).click();
    await logged.page.getByRole("button", { name: "首页设置", exact: true }).click();
    logged.controls.historyError = false;
    const clear = logged.page.getByRole("button", { name: "清空点击记录", exact: true });
    await clear.click();
    await toastShown(logged.page);
    await logged.page.waitForTimeout(1500);
    await clear.click();
    await toastShown(logged.page);
    await logged.page.mouse.move(0, 0);
    await logged.page.waitForTimeout(1400);
    assert.equal(await logged.page.locator(".toast").count(), 1, "an earlier timer cannot hide repeated identical notification");
    await logged.page.locator(".toast").hover();
    await logged.page.waitForTimeout(2000);
    assert.equal(await logged.page.locator(".toast").count(), 1);
    await logged.page.mouse.move(0, 0);
    await logged.page.locator(".toast").waitFor({ state: "detached", timeout: 3500 });
    await clear.click();
    await toastShown(logged.page);
    await logged.page.getByRole("button", { name: "恢复移除的常用网站", exact: true }).click();
    await toastShown(logged.page);
    assert.match(await logged.page.locator(".toast-message").innerText(), /已恢复/);
    await logged.page.getByRole("switch", { name: "自动整理常用" }).click();
    await logged.page.getByRole("button", { name: "完成设置", exact: true }).click();
    assert.deepEqual(await logged.page.locator(".search-suggestions a").allTextContents(), ["淘宝", "铁路12306", "中国天气网", "快递100"]);
    assert.equal(await logged.page.locator(".personal-discovery").count(), 0);

    const mobile = await fixture({ user: true, context: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }, prefs: { pinned: defaultIds } });
    await mobile.page.waitForLoadState("networkidle");
    for (const width of [320, 375, 390, 480, 768, 1280, 1440]) {
      await mobile.page.setViewportSize({ width, height: 800 });
      assert.equal(await overflow(mobile.page), false, `overflow at ${width}`);
    }
    await mobile.page.setViewportSize({ width: 320, height: 640 });
    await mobile.page.getByRole("button", { name: "管理", exact: true }).click();
    const tinyControls = await mobile.page.locator(".edit-controls button, .settings-button, .top-nav button:visible, .search-box button").evaluateAll((nodes) => nodes.filter((node) => { const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map((node) => node.outerHTML));
    assert.deepEqual(tinyControls, [], "touch controls must be at least 44 by 44");
    assert.equal(await overflow(mobile.page), false, "editing cannot overflow narrow grid");
    await mobile.page.getByRole("button", { name: "完成", exact: true }).click();
    await mobile.page.locator(".common-link").first().hover();
    assert.equal(await mobile.page.locator(".common-link .site-mark").first().evaluate((node) => getComputedStyle(node).transform), "none", "coarse pointer must not lift cards");
    await mobile.page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
    await mobile.page.getByRole("button", { name: "AI 工具", exact: true }).first().click();
    await mobile.page.getByRole("button", { name: "置顶豆包", exact: true }).click();
    await toastShown(mobile.page);
    assert.equal(await mobile.page.locator(".toast[data-kind=info] .lucide-info").count(), 1);
    assert.equal(await overflow(mobile.page), false);
    await mobile.page.getByRole("button", { name: "关闭提示" }).click();
    await mobile.page.getByRole("button", { name: "首页设置", exact: true }).click();
    mobile.controls.historyError = true;
    await mobile.page.getByRole("button", { name: "清空点击记录", exact: true }).click();
    await toastShown(mobile.page);
    assert.equal(await overflow(mobile.page), false, "long error must wrap");
    assert.equal(await mobile.page.locator("dialog").evaluate((node) => node.scrollWidth > node.clientWidth), false);
    await mobile.page.screenshot({ path: `${output}/mobile-error.png`, fullPage: true });
    await mobile.page.setViewportSize({ width: 480, height: 320 });
    await mobile.page.getByRole("button", { name: "完成设置", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await mobile.page.locator(".toast").evaluate((node) => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true, "sticky feedback must remain visible in a short dialog");
    await mobile.page.getByRole("button", { name: "完成设置", exact: true }).click();
    await mobile.page.getByRole("button", { name: "关闭提示" }).click();
    await mobile.page.getByRole("button", { name: "首页设置", exact: true }).click();
    await mobile.page.mouse.click(1, 1);
    assert.equal(await mobile.page.locator("dialog[open]").count(), 0, "backdrop clicks still dismiss a dialog");
    await mobile.page.getByRole("button", { name: "添加网站", exact: true }).click();
    await mobile.page.getByRole("button", { name: "添加到常用", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await mobile.page.locator("dialog").evaluate((node) => getComputedStyle(node).overflowY), "auto");
    await mobile.page.keyboard.press("Escape");
    assert.equal(await mobile.page.locator("dialog[open]").count(), 0);
    assert.deepEqual(errors, [], "unexpected browser runtime errors");
    console.log("PASS: seed fallback/retry, keyboard skip, quick links/privacy, notification kinds/replacement/expiry/pause/dialog migration, reduced motion, 320–1440px layout, touch targets and short dialogs. Chromium screenshots in artifacts/ux-polish.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
