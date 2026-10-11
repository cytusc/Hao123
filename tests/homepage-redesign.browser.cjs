// PRD regression checks. All API data is isolated; no real account is accessed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const baseURL = process.env.UX_BASE_URL || "http://localhost:5175";
const output = path.resolve(__dirname, "../artifacts/homepage-redesign");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const { categories } = await import("../src/data.js");
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const errors = [];
  async function fixture({ empty = false, fail = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const controls = { fail, delay: 0, catalogRequests: 0 };
    await page.route("**/api/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      let status = 200, body = {};
      if (endpoint === "/api/catalog") {
        controls.catalogRequests++;
        if (controls.delay) await new Promise((resolve) => setTimeout(resolve, controls.delay));
        status = controls.fail ? 503 : 200;
        body = controls.fail ? { error: "目录暂不可用" } : { categories: empty ? [] : categories };
      } else if (endpoint === "/api/auth/me") body = { user: null };
      else if (endpoint === "/api/recommendations") body = { common: [], sites: [] };
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    return { page, context, controls };
  }
  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  function contrast(first, second) {
    const luminance = (color) => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map((v) => Number(v) / 255);
      const linear = rgb.map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  try {
    const { page } = await fixture();
    assert.equal(await page.locator(".minimal-banner, .quiet-note, .tiny-tag").count(), 0);
    assert.equal(await page.locator(".header .top-nav button").count(), 3);
    const bounds = await page.locator(".header, .search-stage, .common-section, .directory-layout").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    assert.deepEqual(bounds, [...bounds].sort((a, b) => a - b));
    assert.equal(await page.locator(".header").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator(".search-box").evaluate((node) => node.getBoundingClientRect().bottom < innerHeight), true);
    assert.equal(await page.locator(".search-suggestions").evaluate((node) => node.getBoundingClientRect().bottom < innerHeight), true);
    for (const [selector, background] of [
      [".brand-name", ".header"], [".date-line", ".search-stage"],
      [".category-sites a", ".directory"], [".search-box button", ".search-box button"],
      [".site-mark", ".site-mark"], [".search-box input", ".search-box"],
    ]) {
      const colors = await page.evaluate(([selector, background]) => ({
        foreground: getComputedStyle(document.querySelector(selector)).color,
        background: getComputedStyle(document.querySelector(background)).backgroundColor,
      }), [selector, background]);
      assert.ok(contrast(colors.foreground, colors.background) >= 4.5, `${selector} text contrast`);
    }
    assert.equal(await page.locator(".site-mark").first().getAttribute("aria-hidden"), "true");
    const fallbackColors = await page.locator(".common-link .site-mark").evaluateAll((nodes) => [...new Set(nodes.map((node) => getComputedStyle(node).color))]);
    assert.equal(fallbackColors.length, 1, "fallback marks must use one neutral color");
    const input = page.getByRole("searchbox", { name: "搜索网站或关键词" });
    await input.fill(" ");
    await input.press("Enter");
    assert.equal(await page.locator(".search-results").count(), 0, "empty input cannot submit");
    await page.getByRole("button", { name: "必应", exact: true }).click();
    await input.fill("知乎");
    await input.press("Enter");
    await page.locator(".search-results").waitFor();
    assert.match(await page.locator(".web-search").getAttribute("href"), /^https:\/\/www.bing.com\/search/);
    assert.match(await page.locator(".results-summary").innerText(), /找到 1 个网站/);
    const resultsViaEnter = await page.locator(".result-name").allTextContents();
    await page.getByRole("button", { name: "返回分类", exact: true }).click();
    await page.getByRole("button", { name: "搜索一下", exact: true }).click();
    assert.deepEqual(await page.locator(".result-name").allTextContents(), resultsViaEnter);
    await input.fill("不存在的网站xyz");
    await input.press("Enter");
    await page.getByText("还没有找到这个网站", { exact: true }).waitFor();
    await page.getByRole("button", { name: "网址导航", exact: true }).click();
    const ai = page.getByRole("button", { name: "AI 工具", exact: true }).first();
    await ai.focus();
    await page.keyboard.press("Enter");
    assert.equal(await ai.getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".category-row").count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "AI 工具");
    await page.waitForFunction(() => document.querySelector("#main-content > [role=status]").textContent.includes("显示AI 工具"));
    await page.getByRole("button", { name: "网址导航", exact: true }).click();
    await page.getByRole("button", { name: "添加网站", exact: true }).click();
    await page.getByLabel("网站名称").fill("我的资料库");
    await page.getByLabel("网站地址").fill("https://example.invalid/library");
    await page.getByRole("button", { name: "添加到常用", exact: true }).click();
    const custom = page.getByRole("link", { name: "我的资料库", exact: true });
    await custom.waitFor();
    assert.equal(await custom.locator(".site-mark").innerText(), "我");
    assert.equal(await custom.getAttribute("target"), "_blank");
    assert.match(await custom.getAttribute("rel"), /noopener/);
    await page.getByRole("button", { name: "管理", exact: true }).click();
    await page.getByRole("button", { name: "移除我的资料库", exact: true }).click();
    assert.equal(await page.getByRole("link", { name: "我的资料库", exact: true }).count(), 0);
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByRole("button", { name: "必应", exact: true }).getAttribute("aria-pressed"), "true", "engine selection persists after reload");
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
    await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });

    for (const width of [320, 375, 390, 560, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await noOverflow(page), true, `layout overflow at ${width}`);
      const overlaps = await page.locator(".header .brand, .header .top-nav, .header .settings-button, .header .login-button").evaluateAll((nodes) => {
        const rects = nodes.map((node) => node.getBoundingClientRect());
        return rects.flatMap((a, i) => rects.slice(i + 1).filter((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
      });
      assert.equal(overlaps.length, 0, `header overlap at ${width}`);
      await page.evaluate(() => document.documentElement.style.fontSize = "200%");
      assert.equal(await noOverflow(page), true, `200% font overflow at ${width}`);
      if (width === 320) await page.screenshot({ path: `${output}/mobile-font-200.png`, fullPage: true });
      await page.evaluate(() => document.documentElement.style.fontSize = "");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
    const undersized = await page.locator(".top-nav button, .settings-button, .login-button, .engine-tabs button, .search-box button, .common-link, .add-common, .category-tabs button, .category-sites a, .tool-link").evaluateAll((nodes) => nodes.filter((node) => {
      const r = node.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    }).map((node) => node.outerHTML));
    assert.deepEqual(undersized, [], "mobile controls must meet the touch target");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.deepEqual(await page.locator(".app *").evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).animationName !== "none").map((node) => node.className)), []);

    const failure = await fixture({ fail: true });
    assert.equal(await failure.page.locator(".category-row").count(), 8, "failure preserves readable seed data");
    failure.controls.delay = 600;
    const before = failure.controls.catalogRequests;
    await failure.page.getByRole("button", { name: "重试", exact: true }).click();
    const busy = failure.page.getByRole("button", { name: "重试中…", exact: true });
    assert.equal(await busy.isDisabled(), true);
    assert.match(await failure.page.locator(".service-notice").innerText(), /正在重试/);
    await failure.page.getByRole("button", { name: "重试", exact: true }).waitFor();
    assert.equal(failure.controls.catalogRequests, before + 1);
    assert.match(await failure.page.locator(".service-notice").innerText(), /目录服务暂时不可用/);
    await failure.page.screenshot({ path: `${output}/desktop-error.png`, fullPage: true });
    await failure.page.setViewportSize({ width: 390, height: 844 });
    await failure.page.screenshot({ path: `${output}/mobile-error.png`, fullPage: true });
    failure.controls.fail = false;
    await failure.page.getByRole("button", { name: "重试", exact: true }).click();
    await failure.page.locator(".service-notice").waitFor({ state: "detached" });
    const empty = await fixture({ empty: true });
    assert.equal(await empty.page.getByText("当前没有收录网站", { exact: true }).count(), 1);
    assert.equal(await empty.page.getByText("还没有常用网站，可以添加自己的常用入口。", { exact: true }).count(), 1);
    assert.equal(await empty.page.locator(".skeleton, .service-notice").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS: PRD structure, neutral palette/AA contrast, site marks, search keyboard/click parity, engine persistence, category semantics, custom-site management, 320–1440px/200% fonts, touch targets, reduced motion, failure/retry/recovery and true empty state. Screenshots in artifacts/homepage-redesign.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
