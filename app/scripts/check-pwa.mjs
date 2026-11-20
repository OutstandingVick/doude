// PWA audit: manifest, service worker, offline read of last-viewed spill,
// offline banner, and queued evidence upload sent on reconnect.
//   TARGET_URL=http://localhost:3000 LOGIN_EMAIL=... LOGIN_PASSWORD=... node scripts/check-pwa.mjs
import { chromium } from "playwright";

const BASE = process.env.TARGET_URL ?? "http://localhost:3000";
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASSWORD;
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); ok &&= !!cond; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: !!process.env.IGNORE_HTTPS_ERRORS });
const page = await ctx.newPage();
try {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (page.url().includes("/login")) {
    await page.locator("input[type=email]").fill(EMAIL);
    await page.locator("input[type=password]").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  }
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href");
    return href ? (await fetch(href)).json() : null;
  });
  check(manifest?.name === "Feasibility3D" && manifest.icons?.length >= 2 && manifest.theme_color,
    `manifest: name=${manifest?.name}, icons=${manifest?.icons?.length}, theme=${manifest?.theme_color}`);
  const themeMeta = await page.getAttribute('meta[name="theme-color"]', "content");
  check(!!themeMeta, `<meta name=theme-color> = ${themeMeta}`);

  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready, null, { timeout: 15000 });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check(controlled, "service worker controls the page");

  const spills = await page.evaluate(async () => (await fetch("/api/spills")).json());
  const spillId = spills[0]?.id;
  check(!!spillId, `have a spill to view: ${spillId}`);
  await page.goto(`${BASE}/spills/${spillId}`, { waitUntil: "load" });
  await page.getByText(spillId).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);

  // ---- offline ----
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  check(await page.getByText(/You're offline/).isVisible(), "offline banner shown");
  check(await page.getByText(spillId).first().isVisible(), `last-viewed spill ${spillId} readable offline`);
  await page.goto(`${BASE}/spills`, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2000);
  check(await page.getByText(spillId).first().isVisible().catch(() => false), "spills list readable offline");

  await page.goto(`${BASE}/spills/${spillId}?tab=evidence`, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('input[type="file"]').setInputFiles({
    name: "offline-evidence.csv", mimeType: "text/csv", buffer: Buffer.from("t,ppm\n0,12\n"),
  });
  await page.waitForTimeout(800);
  check(await page.getByText(/saved offline/).isVisible(), "offline upload queued");
  check(await page.getByText(/1 evidence upload will send/).isVisible(), "banner shows 1 queued upload");

  // ---- back online ----
  await ctx.setOffline(false);
  await page.waitForTimeout(3000);
  const detail = await page.evaluate(async (id) => (await fetch(`/api/spills/${id}`, { cache: "no-store" })).json(), spillId);
  const sent = (detail.evidence ?? []).some((e) => e.filename === "offline-evidence.csv");
  check(sent, "queued upload sent on reconnect");
  check(await page.getByText("offline-evidence.csv").first().isVisible(), "uploaded file appears in the list");
  check(!(await page.getByText(/You're offline/).isVisible()), "offline banner hidden when online");
} catch (e) {
  check(false, String(e).split("\n")[0]);
}
await browser.close();
console.log(ok ? "PWA OK" : "PWA FAILED");
process.exit(ok ? 0 : 1);
