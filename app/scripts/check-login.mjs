// Log in through the same-origin /api proxy in a real browser engine.
//   BROWSER=webkit TARGET_URL=http://localhost:3000 \
//   LOGIN_EMAIL=... LOGIN_PASSWORD=... node scripts/check-login.mjs
import { chromium, firefox, webkit } from "playwright";

const BASE = process.env.TARGET_URL ?? "http://localhost:3000";
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASSWORD;
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? "webkit"];
if (!EMAIL || !PASSWORD) {
  console.error("Set LOGIN_EMAIL and LOGIN_PASSWORD");
  process.exit(2);
}

const browser = await engine.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: !!process.env.IGNORE_HTTPS_ERRORS })).newPage();
const apiHosts = new Set();
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/") || /:\d+$/.test(u.host)) apiHosts.add(u.origin);
});
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); ok &&= cond; };
try {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check(true, "unauthenticated visit redirects to /login");
  await page.locator("input[type=email]").fill(EMAIL);
  await page.locator("input[type=password]").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  check(true, `signed in, now at ${new URL(page.url()).pathname}`);
  const cookie = (await page.context().cookies()).find((c) => c.name === "feasibility3d_session");
  check(!!cookie, `session cookie set on ${cookie?.domain} (sameSite=${cookie?.sameSite}, secure=${cookie?.secure}, httpOnly=${cookie?.httpOnly})`);
  const me = await page.evaluate(async () => (await fetch("/api/me")).status);
  check(me === 200, `GET /api/me with cookie → ${me}`);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  check(!page.url().includes("/login"), "session survives reload");
  const origins = [...apiHosts];
  check(origins.every((o) => o === new URL(BASE).origin), `all API calls same-origin: ${origins.join(", ")}`);
} catch (e) {
  check(false, String(e).split("\n")[0]);
}
await browser.close();
console.log(ok ? "LOGIN OK" : "LOGIN FAILED");
process.exit(ok ? 0 : 1);
