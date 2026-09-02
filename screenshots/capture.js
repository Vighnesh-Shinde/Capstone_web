/**
 * Capture a full-page screenshot of every screen in the platform.
 *
 * Drives the real app in a real browser rather than rendering components in
 * isolation, so what lands in screenshots/ is what a teammate would actually
 * see — including the sidebar, the footer disclaimer, and real seeded data.
 *
 * Uses the system Chrome via playwright-core, so no browser download is needed.
 *
 * To run it:
 *
 *   1. Start Postgres, the ML service, the backend and the Vite dev server.
 *   2. Seed a counselor account matching COUNSELOR below, with a voiceprint
 *      enrolled and a few processed sessions — the report and participant
 *      screens are empty otherwise.
 *   3. npm install playwright-core
 *   4. node screenshots/capture.js
 *
 * The ML service should be in MOCK mode (USE_REAL_MODELS=false). The real
 * pipeline needs genuine video and takes minutes per session, which makes a
 * full capture impractical; the mock returns the same response shape instantly.
 * Everything in the resulting images is therefore layout-real and data-fake —
 * see README.md in this directory.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = "http://localhost:5173";
// Defaults to the directory this script lives in, so `node capture.js` from
// anywhere refreshes the committed set in place.
const OUT = process.argv[2] || __dirname;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const COUNSELOR = { id: "meera.joshi@demo.invalid", pw: "DemoPass1234" };
const ADMIN = { id: "Vighnesh-59", pw: "Vvs@2004" };

/** Ids captured during the run so detail pages can be reached by URL. */
const ids = {};

async function login(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#identifier", who.id);
  await page.fill("#password", who.pw);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 }),
    page.click('form.auth-card button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
}

async function shoot(page, name, url, prep) {
  if (url) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
  }
  if (prep) await prep(page);

  // Settle async data and any CSS transitions before capturing, otherwise
  // half the screenshots show a "Loading…" line.
  await page.waitForTimeout(900);

  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const { size } = fs.statSync(file);
  console.log(`  ${name}.png  (${Math.round(size / 1024)} KB)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-sharp, so the images survive being pasted into slides
  });
  const page = await context.newPage();

  // ---------------------------------------------------------------- public
  console.log("\nPublic pages");
  await shoot(page, "01-login", "/login");
  await shoot(page, "02-request-access-account", "/request-access");
  await shoot(page, "03-request-access-professional", null, async (p) => {
    await p.fill("#fullName", "Rohan Desai");
    await p.fill("#email", "rohan.desai@example.org");
    await p.fill("#password", "ExamplePass123");
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
  });
  await shoot(page, "04-request-access-contact", null, async (p) => {
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
  });
  await shoot(page, "05-request-access-documents", null, async (p) => {
    await p.selectOption("#countryCode", "IN");
    await p.waitForTimeout(300);
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
    await p.click('button:has-text("Add a document")');
    await p.waitForTimeout(300);
  });
  await shoot(page, "06-forgot-password", "/forgot-password");
  await shoot(page, "07-help-guide", "/help");
  await shoot(page, "08-crisis-resources", "/crisis-resources");
  await shoot(page, "09-privacy-policy", "/privacy");
  await shoot(page, "10-terms-of-service", "/terms");

  // ------------------------------------------------------------- counselor
  console.log("\nCounselor");
  await login(page, COUNSELOR);
  await shoot(page, "11-counselor-dashboard", "/");
  await shoot(page, "12-sessions-list", "/sessions");

  // Prefer a session that had someone else in the room, so the report's
  // speaker-attribution panel has a companion row to show. The list endpoint
  // omits companions by design, so each candidate is fetched individually.
  ids.session = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const list = await (await fetch("http://localhost:8080/api/sessions?size=20", auth)).json();
    const completed = list.content.filter((s) => s.status === "COMPLETED");
    for (const s of completed) {
      const detail = await (await fetch(`http://localhost:8080/api/sessions/${s.id}`, auth)).json();
      if (detail.companions?.length) return s.id;
    }
    return completed[0].id;
  });

  await shoot(page, "13-session-report", `/sessions/${ids.session}/report`);
  await shoot(page, "14-session-detail", `/sessions/${ids.session}`);
  await shoot(page, "15-participants", "/participants");

  ids.participant = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:8080/api/participants", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.content;
    // Prefer somebody with more than one visit, so the trend chart has a line.
    return (list.find((p) => p.sessionCount > 1) || list[0]).id;
  });
  await shoot(page, "16-participant-detail", `/participants/${ids.participant}`);

  await shoot(page, "17-new-session-details", "/sessions/new");
  await shoot(page, "18-new-session-consent", null, async (p) => {
    await p.fill("#participantRef", "P-1077");
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
  });
  await shoot(page, "19-new-session-room", null, async (p) => {
    for (const id of ["consentRecording", "consentAiAnalysis", "consentStorage"]) {
      await p.check(`#${id}`);
    }
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
    await p.click('button:has-text("Someone else is present")');
    await p.waitForTimeout(400);
  });
  await shoot(page, "20-new-session-upload", null, async (p) => {
    await p.click('button:has-text("Just me and the participant")');
    await p.waitForTimeout(300);
    await p.click('form button[type="submit"]');
    await p.waitForTimeout(400);
  });

  await shoot(page, "21-voice-enrollment", "/voice-enrollment");
  await shoot(page, "22-counselor-profile", "/profile");

  // ----------------------------------------------------------------- admin
  console.log("\nAdmin");
  await login(page, ADMIN);
  await shoot(page, "23-admin-overview", "/admin");
  await shoot(page, "24-admin-applications", "/admin/applications");

  ids.application = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(
      "http://localhost:8080/api/admin/counselor-applications?status=PENDING&size=5",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    return data.content?.[0]?.id ?? null;
  });
  if (ids.application) {
    await shoot(page, "25-admin-application-detail", `/admin/applications/${ids.application}`);
  }

  await shoot(page, "26-admin-users", "/admin/users");
  await shoot(page, "27-admin-models", "/admin/models");
  await shoot(page, "28-admin-dataset", "/admin/dataset");
  await shoot(page, "29-admin-privacy", "/admin/privacy");
  await shoot(page, "30-admin-profile", "/profile");

  // ------------------------------------------------------------ responsive
  console.log("\nMobile");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await login(mpage, COUNSELOR);
  await shoot(mpage, "31-mobile-dashboard", "/");
  await shoot(mpage, "32-mobile-sessions", "/sessions");
  await shoot(mpage, "33-mobile-report", `/sessions/${ids.session}/report`);
  await shoot(mpage, "34-mobile-voice-enrollment", "/voice-enrollment");

  await browser.close();
  console.log(`\nDone — ${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length} screenshots in ${OUT}/`);
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
