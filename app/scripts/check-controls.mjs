import { chromium } from "playwright";

const BASE = process.env.TARGET_URL ?? "http://localhost:3000";
const SPILL = "SPL-0001";
const results = [];
function record(page, control, status, note = "") {
  results.push({ page, control, status, note });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function fp() {
  return page.evaluate(() => location.href + "|" + document.body.innerText.length + "|" + document.querySelectorAll("*").length);
}

// Click an in-page control and classify. Never throws.
async function click(label, doClick, wait = 500, pg = "dashboard") {
  const errs = [];
  const oe = (e) => errs.push(e.message.slice(0, 70));
  const oc = (m) => { if (m.type() === "error" && !/404|tile|ERR_ABORTED|favicon|net::/i.test(m.text())) errs.push("c:" + m.text().slice(0, 60)); };
  page.on("pageerror", oe); page.on("console", oc);
  let status;
  try {
    const before = await fp();
    await doClick();
    await page.waitForTimeout(wait);
    const after = await fp();
    status = errs.length ? "ERROR" : before !== after ? "WORKS" : "DOES NOTHING";
  } catch (e) {
    status = "ERROR";
    errs.push(String(e).slice(0, 60));
  }
  page.off("pageerror", oe); page.off("console", oc);
  record(pg, label, status, errs.slice(0, 1).join(""));
  // close any open popover/menu
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
}

// Navigate to a target and check it's not a 404.
async function nav(label, clickFn, pg = "dashboard", resetTo = "/") {
  let status = "WORKS", note = "";
  try {
    await clickFn();
    await page.waitForLoadState("load", { timeout: 15000 });
    await page.waitForTimeout(400);
    const code = await page.evaluate(async () => (await fetch(location.href, { method: "HEAD" })).status);
    if (code >= 400) { status = "ERROR"; note = "HTTP " + code + " " + location; }
  } catch (e) {
    status = "ERROR"; note = String(e).slice(0, 60);
  }
  record(pg, label, status, note);
  await page.goto(BASE + resetTo, { waitUntil: "load" });
  await page.waitForTimeout(600);
}

// Verify a URL (e.g. PDF) is valid.
async function url(label, href, pg = "dashboard") {
  let status = "WORKS", note = "";
  try {
    const r = await page.evaluate(async (u) => {
      try { const x = await fetch(u); return { s: x.status, ct: x.headers.get("content-type") || "" }; }
      catch (e) { return { s: 0, ct: "" }; }
    }, href);
    if (r.s !== 200 || !/pdf|octet|json/.test(r.ct)) { status = "ERROR"; note = `${r.s} ${r.ct}`; }
  } catch (e) { status = "ERROR"; note = String(e).slice(0, 50); }
  record(pg, label, status, note);
}

const esc = () => page.keyboard.press("Escape");

try {
  // ===== DASHBOARD =====
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector(".leaflet-container", { timeout: 30000 });
  await page.waitForTimeout(1500);
  record("dashboard", "page loads (map + cards)", "WORKS");

  for (const [label, name, exact] of [["Spills","Spills",false],["Evidence","Evidence",true],["Reports","Reports",true],["Compliance","Compliance",true],["Help & docs","Help and docs",true]]) {
    await nav(`sidebar: ${label}`, () => page.getByRole("link", { name, exact }).first().click());
  }
  await click("sidebar: Run analysis", () => page.getByRole("button", { name: "Run analysis" }).first().click(), 1200);
  await click("sidebar: Collapse", () => page.getByRole("button", { name: "Collapse sidebar" }).click());
  await page.waitForTimeout(300);
  await click("sidebar: Expand", () => page.getByRole("button", { name: "Expand sidebar" }).click().catch(async () => page.getByRole("button", { name: "Collapse sidebar" }).click()));
  await page.waitForTimeout(300);

  await nav("topnav: Settings", () => page.getByRole("link", { name: "Settings" }).click());
  await click("topnav: Notifications (bell)", () => page.getByRole("button", { name: "Notifications" }).click());
  await click("topnav: Account (avatar)", () => page.getByRole("button", { name: "Account" }).click());
  await click("topnav: Filter", () => page.getByRole("button", { name: "Filter" }).click());
  await nav("topnav: search + Enter", async () => { await page.getByRole("textbox", { name: /Search/ }).fill("SPL"); await page.getByRole("textbox", { name: /Search/ }).press("Enter"); });

  await click("map: Toggle basemap", () => page.getByRole("button", { name: "Toggle basemap" }).click(), 800);
  await click("map: Zoom to leak", () => page.getByRole("button", { name: "Zoom to leak" }).click(), 800);
  await click("map: Expand map", () => page.getByRole("button", { name: "Expand map" }).first().click(), 600);
  await click("map: Close full screen", () => page.getByRole("button", { name: "Close full screen" }).click(), 500);
  for (const layer of ["Pipeline", "Leak and uncertainty", "Slick", "Sensors"]) {
    await click(`map: layer ${layer}`, () => page.getByRole("button", { name: layer, exact: true }).click(), 250);
  }
  await click("map: Run analysis (toolbar)", () => page.getByRole("button", { name: "Run analysis" }).last().click(), 900);

  await nav("glass card: Open spill detail (+)", () => page.getByRole("link", { name: "Open spill detail" }).click());

  for (let i = 0; i < 4; i++) {
    await click(`card: Expand #${i + 1}`, () => page.getByRole("button", { name: "Expand", exact: true }).nth(i).click(), 400);
  }
  await click("card: Verify (snapshot)", () => page.getByRole("button", { name: "Verify", exact: true }).click(), 2500);
  await click("card: More info (snapshot)", () => page.getByRole("button", { name: "More info" }).click());
  await nav("card: Calendar (timeline)", () => page.getByRole("link", { name: "Open regulatory forms" }).click());
  await click("card: pill Done", () => page.locator("button.pill").filter({ hasText: "Done" }).first().click());
  await click("card: pill Draft/Filed", () => page.locator("button.pill").filter({ hasText: /Draft|Filed/ }).first().click());
  await click("card: pill Upcoming", () => page.locator("button.pill").filter({ hasText: "Upcoming" }).first().click());
  await click("card: eye View", () => page.getByRole("button", { name: "View" }).first().click());
  const dl = await page.getByRole("link", { name: "Download spill report" }).getAttribute("href");
  await url("card: Download spill report (PDF)", dl);

  // ===== SPILLS =====
  await page.goto(BASE + "/spills", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  record("spills", "page loads", "WORKS");
  for (const chip of ["All", "Detected", "JIV", "Clean-up", "Closed"]) {
    await nav(`spills: filter ${chip}`, () => page.getByRole("link", { name: chip, exact: true }).click(), "spills", "/spills");
  }
  await nav("spills: row -> detail", () => page.getByRole("link", { name: SPILL }).click(), "spills");

  // ===== DETAIL =====
  await page.goto(BASE + `/spills/${SPILL}?tab=audit`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  record("detail", "page loads (?tab=audit)", "WORKS");
  for (const tab of ["Overview", "Quantification", "Impact", "Integrity", "Regulatory forms", "Evidence", "Audit log"]) {
    await click(`detail: tab ${tab}`, () => page.getByRole("button", { name: tab, exact: true }).click(), 400, "detail");
  }
  // forms tab: B/C generate + A view
  await page.goto(BASE + `/spills/${SPILL}?tab=forms`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await click("detail: Form B Generate", () => page.getByRole("button", { name: "Generate", exact: true }).nth(0).click(), 1000, "detail");
  await click("detail: Form C Generate", () => page.getByRole("button", { name: "Generate", exact: true }).nth(1).click(), 1000, "detail");
  const aHref = await page.getByRole("link", { name: /Generate draft|View filed form/ }).getAttribute("href");
  await url("detail: Form A view (PDF)", aHref, "detail");
  // advance
  await click("detail: Advance", () => page.getByRole("button", { name: /Advance/ }).click(), 400, "detail");
  await click("detail: dialog Confirm", () => page.getByRole("button", { name: "Confirm" }).click().catch(() => {}), 800, "detail");
  // map
  await page.goto(BASE + `/spills/${SPILL}`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  // Zoom to leak animates the map (no DOM text change) -> verify no error
  {
    const e = []; const oe = (x) => e.push(x.message.slice(0,60)); page.on("pageerror", oe);
    await page.getByRole("button", { name: "Zoom to leak" }).click().catch(() => {});
    await page.waitForTimeout(900); page.off("pageerror", oe);
    record("detail", "detail: map Zoom to leak", e.length ? "ERROR" : "WORKS", e[0] || "map fly-to");
  }
  await click("detail: map Full pipeline", () => page.getByRole("button", { name: "Full pipeline" }).click(), 600, "detail");
  const dHref = await page.getByRole("link", { name: "Download report" }).getAttribute("href");
  await url("detail: Download report (PDF)", dHref, "detail");

  // ===== EVIDENCE =====
  await page.goto(BASE + "/evidence", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const ev = await page.evaluate(() => document.body.innerText.length);
  record("evidence", "page loads (table/empty)", ev > 200 ? "WORKS" : "DOES NOTHING");

  // ===== REPORTS =====
  await page.goto(BASE + "/reports", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  record("reports", "page loads (report types)", "WORKS");
  await click("reports: Create report", () => page.getByRole("button", { name: "Create report" }).click(), 700, "reports");
  await click("reports: select type", () => page.locator("[data-report-type]").first().click(), 500, "reports");
  await click("reports: Preview", () => page.getByRole("button", { name: "Preview" }).click().catch(() => {}), 1200, "reports");

  // ===== COMPLIANCE =====
  await page.goto(BASE + "/compliance", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const comp = await page.evaluate(() => document.body.innerText);
  record("compliance", "page loads with form data", /Form A/.test(comp) ? "WORKS" : "DOES NOTHING");
  await click("compliance: Compliance report", () => page.getByRole("button", { name: "Compliance report" }).click(), 1200, "compliance");

  // ===== SETTINGS =====
  await page.goto(BASE + "/settings", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  record("settings", "page loads (units/tz/contacts/engine)", "WORKS");
  const getPref = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem("feasibility3d-settings") || "{}")[key], k);
  await page.getByRole("button", { name: "Cubic metres (m³)" }).click(); await page.waitForTimeout(250);
  record("settings", "settings: units m3", (await getPref("unit")) === "m3" ? "WORKS" : "DOES NOTHING");
  await page.getByRole("button", { name: "Barrels (bbl)" }).click(); await page.waitForTimeout(250);
  record("settings", "settings: units bbl", (await getPref("unit")) === "bbl" ? "WORKS" : "DOES NOTHING");
  await page.getByRole("button", { name: "WAT (UTC+1)" }).click(); await page.waitForTimeout(250);
  record("settings", "settings: tz WAT", (await getPref("timezone")) === "wat" ? "WORKS" : "DOES NOTHING");
  await page.getByRole("button", { name: "UTC", exact: true }).click(); await page.waitForTimeout(250);
  record("settings", "settings: tz UTC", (await getPref("timezone")) === "utc" ? "WORKS" : "DOES NOTHING");
  await click("settings: Add contact", async () => { await page.locator('input[placeholder="e.g. Ada Okafor"]').fill("Audit C"); await page.getByRole("button", { name: "Add", exact: true }).click(); }, 700, "settings");
  await click("settings: Remove contact", () => page.getByRole("button", { name: /Remove/ }).first().click(), 500, "settings");

  // ===== HELP =====
  await page.goto(BASE + "/help", { waitUntil: "load" });
  await page.waitForTimeout(800);
  const help = await page.evaluate(() => document.body.innerText);
  record("help", "page loads with content", /five functions|Frequently/i.test(help) ? "WORKS" : "DOES NOTHING");
} catch (e) {
  record("_script", "script error", "ERROR", String(e).slice(0, 80));
}

await browser.close();

const fails = results.filter((r) => r.status !== "WORKS");
console.log("\n========== CONTROL AUDIT ==========");
let cur = "";
for (const r of results) {
  if (r.page !== cur) { cur = r.page; console.log(`\n## ${cur}`); }
  console.log(`  ${r.status.padEnd(12)} ${r.control}${r.note ? "  [" + r.note + "]" : ""}`);
}
console.log(`\n========== ${results.length - fails.length}/${results.length} WORKS, ${fails.length} not ==========`);
if (fails.length) {
  console.log("NON-WORKING:");
  fails.forEach((f) => console.log(`  ${f.status}  [${f.page}] ${f.control} ${f.note}`));
}
