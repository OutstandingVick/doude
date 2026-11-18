import { chromium } from "playwright";

const BASE_URL = process.env.DOUDE_URL ?? "http://localhost:3000";
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

const results = [];
let anyFail = false;

function record(viewport, name, pass, detail) {
  const label = `[${viewport.width}×${viewport.height}] ${name}`;
  results.push({ label, pass, detail });
  if (!pass) anyFail = true;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  —  ${detail}`);
}

function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(1) : String(n);
}

async function runViewport(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Wait for the dashboard (not skeleton/full-screen loader) and the map to mount.
  await page.waitForSelector("[data-card] .leaflet-container", { timeout: 30000 });

  // Let tiles load and the map fitBounds/invalidateSize settle.
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const round1 = (n) => Math.round(n * 10) / 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;

    const container = document.querySelector("[data-container]");
    const containerRect = container ? container.getBoundingClientRect() : null;

    const out = {
      vw,
      vh,
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      container: containerRect
        ? { top: round1(containerRect.top), left: round1(containerRect.left), right: round1(containerRect.right), bottom: round1(containerRect.bottom) }
        : null,
      cards: [],
      topbarActions: [],
      map: null,
      timelineTitles: [],
    };

    for (const el of document.querySelectorAll("[data-card]")) {
      const r = el.getBoundingClientRect();
      out.cards.push({
        left: round1(r.left),
        right: round1(r.right),
        bottom: round1(r.bottom),
        w: round1(r.width),
        h: round1(r.height),
        hasMap: !!el.querySelector(".leaflet-container"),
      });
    }

    for (const el of document.querySelectorAll("[data-topbar-action]")) {
      const r = el.getBoundingClientRect();
      out.topbarActions.push({
        left: round1(r.left),
        right: round1(r.right),
        top: round1(r.top),
        bottom: round1(r.bottom),
      });
    }

    const mapCard = [...document.querySelectorAll("[data-card]")].find((c) => c.querySelector(".leaflet-container"));
    if (mapCard) {
      const mr = mapCard.getBoundingClientRect();
      const toolbar = mapCard.querySelector("[data-map-toolbar]");
      const zoomLeak = mapCard.querySelector("[data-zoom-leak]");
      const tb = toolbar ? toolbar.getBoundingClientRect() : null;
      const zb = zoomLeak ? zoomLeak.getBoundingClientRect() : null;

      const paths = [...mapCard.querySelectorAll("path.leaflet-interactive")];
      let best = null;
      let bestArea = -1;
      for (const p of paths) {
        const s = (p.getAttribute("stroke") || "").toLowerCase();
        if (s === "#ffffff" || s === "#fff" || s === "rgb(255,255,255)" || s === "rgb(255, 255, 255)") {
          const pr = p.getBoundingClientRect();
          const area = pr.width * pr.height;
          if (area > bestArea) {
            bestArea = area;
            best = { w: round1(pr.width), h: round1(pr.height) };
          }
        }
      }
      out.map = {
        card: { left: round1(mr.left), right: round1(mr.right), top: round1(mr.top), bottom: round1(mr.bottom), w: round1(mr.width), h: round1(mr.height) },
        toolbar: tb ? { left: round1(tb.left), right: round1(tb.right), top: round1(tb.top), bottom: round1(tb.bottom) } : null,
        zoomLeak: zb ? { left: round1(zb.left), right: round1(zb.right), top: round1(zb.top), bottom: round1(zb.bottom) } : null,
        route: best ? { w: best.w, h: best.h } : null,
      };
    }

    for (const el of document.querySelectorAll("[data-timeline-title]")) {
      const text = (el.textContent || "").trim();
      if (text === "Leak detected" || text === "Form A due (24 h)") {
        out.timelineTitles.push({
          text,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    }

    return out;
  });

  // 1. no horizontal overflow
  const hOverflow = m.scrollWidth <= vp.width + 1;
  record(vp, "no horizontal overflow", hOverflow, `scrollWidth=${m.scrollWidth} innerWidth=${vp.width}`);

  // no vertical page scroll
  const vOverflow = m.scrollHeight <= vp.height + 1;
  record(vp, "no vertical page scroll", vOverflow, `scrollHeight=${m.scrollHeight} innerHeight=${vp.height}`);

  // 2. container fits viewport
  if (m.container) {
    const fits = m.container.top >= 0 && m.container.left >= 0 && m.container.right <= vp.width + 1 && m.container.bottom <= vp.height + 1;
    record(vp, "container fits viewport", fits, `top=${m.container.top} left=${m.container.left} right=${m.container.right} bottom=${m.container.bottom} (vw=${vp.width} vh=${vp.height})`);
  } else {
    record(vp, "container fits viewport", false, "no [data-container] found");
  }

  // 3. each card inside container - 16px (right & bottom)
  if (m.container && m.cards.length) {
    m.cards.forEach((c, i) => {
      const rightOk = c.right <= m.container.right - 16 + 1;
      const bottomOk = c.bottom <= m.container.bottom - 16 + 1;
      record(vp, `card #${i + 1} inside container`, rightOk && bottomOk, `right=${c.right} (limit ${fmt(m.container.right - 16)}), bottom=${c.bottom} (limit ${fmt(m.container.bottom - 16)})`);
    });
  } else if (!m.cards.length) {
    record(vp, "cards present", false, "no [data-card] elements found");
  }

  // 4. topbar actions fully inside viewport
  if (m.topbarActions.length) {
    m.topbarActions.forEach((a, i) => {
      const ok = a.left >= 0 && a.right <= vp.width + 1 && a.top >= 0 && a.bottom <= vp.height + 1;
      record(vp, `topbar action #${i + 1} in viewport`, ok, `left=${a.left} right=${a.right} top=${a.top} bottom=${a.bottom}`);
    });
  } else {
    record(vp, "topbar actions in viewport", false, "no [data-topbar-action] elements found");
  }

  // 5. map toolbar + zoom-leak fully inside map card
  if (m.map) {
    const tbOk = m.map.toolbar ? m.map.toolbar.left >= m.map.card.left && m.map.toolbar.right <= m.map.card.right + 1 && m.map.toolbar.top >= m.map.card.top && m.map.toolbar.bottom <= m.map.card.bottom + 1 : false;
    record(vp, "map toolbar inside map card", tbOk, m.map.toolbar ? `tb[l=${m.map.toolbar.left} r=${m.map.toolbar.right} t=${m.map.toolbar.top} b=${m.map.toolbar.bottom}] card[l=${m.map.card.left} r=${m.map.card.right} t=${m.map.card.top} b=${m.map.card.bottom}]` : "no [data-map-toolbar]");
    const zbOk = m.map.zoomLeak ? m.map.zoomLeak.left >= m.map.card.left && m.map.zoomLeak.right <= m.map.card.right + 1 && m.map.zoomLeak.top >= m.map.card.top && m.map.zoomLeak.bottom <= m.map.card.bottom + 1 : false;
    record(vp, "zoom-to-leak inside map card", zbOk, m.map.zoomLeak ? `zb[l=${m.map.zoomLeak.left} r=${m.map.zoomLeak.right} t=${m.map.zoomLeak.top} b=${m.map.zoomLeak.bottom}]` : "no [data-zoom-leak]");
  } else {
    record(vp, "map toolbar inside map card", false, "no map card found");
    record(vp, "zoom-to-leak inside map card", false, "no map card found");
  }

  // 6. timeline titles not truncated
  if (m.timelineTitles.length) {
    m.timelineTitles.forEach((t) => {
      const ok = t.scrollWidth <= t.clientWidth + 1;
      record(vp, `title not truncated ("${t.text}")`, ok, `scrollWidth=${t.scrollWidth} clientWidth=${t.clientWidth}`);
    });
  } else {
    record(vp, "timeline titles not truncated", false, "timeline title elements not found");
  }

  // 7. route polyline bbox >= 40% of map card width or height
  if (m.map) {
    if (m.map.route) {
      const wOk = m.map.route.w >= m.map.card.w * 0.4;
      const hOk = m.map.route.h >= m.map.card.h * 0.4;
      record(vp, "route fitted (>=40% of map)", wOk || hOk, `route=${m.map.route.w}×${m.map.route.h} map=${m.map.card.w}×${m.map.card.h}`);
    } else {
      record(vp, "route fitted (>=40% of map)", false, "route polyline path not found");
    }
  } else {
    record(vp, "route fitted (>=40% of map)", false, "no map card found");
  }

  await page.close();
}

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    await runViewport(browser, vp);
  }
} finally {
  await browser.close();
}

const failCount = results.filter((r) => !r.pass).length;
const passCount = results.length - failCount;
console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(anyFail ? 1 : 0);