const puppeteer = require("puppeteer-core");

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const base = "http://127.0.0.1:3025/login";
  const viewports = [
    { name: "mobile", width: 360, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1366, height: 768 },
  ];

  const scenarios = [
    { label: "ltr", locale: "en", expectedDir: "ltr", expectedSide: "left" },
    { label: "rtl", locale: "ar", expectedDir: "rtl", expectedSide: "right" },
  ];

  const rows = [];

  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.setCookie({
        name: "zc_locale",
        value: scenario.locale,
        url: "http://127.0.0.1:3025",
      });

      await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('img[src*="light-faculty-badge"]', {
        timeout: 10000,
      });

      const metrics = await page.evaluate(() => {
        const badge = document.querySelector('img[src*="light-faculty-badge"]');
        const utilityContainer = document.querySelector("div.absolute.end-3.top-3");
        const dir = document.documentElement.getAttribute("dir");

        if (!badge || !utilityContainer) {
          return { dir, error: "badge_or_container_missing" };
        }

        const utilityButtons = Array.from(utilityContainer.querySelectorAll("button"));
        if (utilityButtons.length === 0) {
          return { dir, error: "utility_buttons_missing" };
        }

        const utilityRects = utilityButtons.map((button) =>
          button.getBoundingClientRect(),
        );

        const utilityRect = {
          left: Math.min(...utilityRects.map((rect) => rect.left)),
          right: Math.max(...utilityRects.map((rect) => rect.right)),
          top: Math.min(...utilityRects.map((rect) => rect.top)),
          bottom: Math.max(...utilityRects.map((rect) => rect.bottom)),
        };

        const badgeRect = badge.getBoundingClientRect();
        const overlap = !(
          badgeRect.right <= utilityRect.left ||
          badgeRect.left >= utilityRect.right ||
          badgeRect.bottom <= utilityRect.top ||
          badgeRect.top >= utilityRect.bottom
        );

        return {
          dir,
          overlap,
          innerWidth: window.innerWidth,
          badge: {
            left: badgeRect.left,
            right: badgeRect.right,
          },
        };
      });

      const side = metrics.badge
        ? (metrics.badge.left + metrics.badge.right) / 2 < metrics.innerWidth / 2
          ? "left"
          : "right"
        : "unknown";

      rows.push({
        scenario: scenario.label,
        viewport: viewport.name,
        dir: metrics.dir ?? null,
        side,
        overlap: metrics.overlap ?? null,
        error: metrics.error ?? null,
      });

      await page.close();
    }
  }

  await browser.close();

  console.log(JSON.stringify(rows, null, 2));

  const failed = rows.filter(
    (row) =>
      row.error ||
      row.overlap ||
      row.dir !== (row.scenario === "ltr" ? "ltr" : "rtl") ||
      row.side !== (row.scenario === "ltr" ? "left" : "right"),
  );

  if (failed.length > 0) {
    console.error("LOGIN_BADGE_QA_FAILED");
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
