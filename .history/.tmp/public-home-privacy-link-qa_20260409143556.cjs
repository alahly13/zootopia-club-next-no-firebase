const puppeteer = require("puppeteer-core");

const BASE_URL = "http://127.0.0.1:3025/about";
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const scenarios = [
  {
    name: "EN",
    locale: "en",
    trustLabelSnippet: "Trust & Privacy",
    privacyLabelSnippet: "Privacy Policy",
  },
  {
    name: "AR",
    locale: "ar",
    trustLabelSnippet: "الثقة والخصوصية",
    privacyLabelSnippet: "سياسة الخصوصية",
  },
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
];

function textIncludes(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.setCookie({
        name: "zc_locale",
        value: scenario.locale,
        url: "http://127.0.0.1:3025",
      });

      await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 45000 });

      const metrics = await page.evaluate((expected) => {
        const allTextElements = Array.from(document.querySelectorAll("p,span,h1,h2,h3,div"));
        const trustLabelNode = allTextElements.find((node) =>
          String(node.textContent || "").includes(expected.trustLabelSnippet),
        );

        let trustRow = null;
        if (trustLabelNode) {
          trustRow = trustLabelNode.closest("div");
        }

        const privacyLinks = Array.from(document.querySelectorAll('a[href="/privacy"]'));
        const visiblePrivacyLinks = privacyLinks.filter((link) => {
          const rect = link.getBoundingClientRect();
          const style = window.getComputedStyle(link);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        });

        const trustRowPrivacyLink = trustRow
          ? Array.from(trustRow.querySelectorAll('a[href="/privacy"]')).find((link) => {
              const rect = link.getBoundingClientRect();
              const style = window.getComputedStyle(link);
              return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            })
          : null;

        const trustRowRect = trustRow ? trustRow.getBoundingClientRect() : null;
        const trustRowText = trustRow ? String(trustRow.textContent || "") : "";
        const trustRowLinkText = trustRowPrivacyLink ? String(trustRowPrivacyLink.textContent || "") : "";
        const trustRowLinkFontSize = trustRowPrivacyLink
          ? Number.parseFloat(window.getComputedStyle(trustRowPrivacyLink).fontSize || "0")
          : 0;

        return {
          documentDir: document.documentElement.getAttribute("dir"),
          trustLabelFound: Boolean(trustLabelNode),
          trustRowFound: Boolean(trustRow),
          trustRowVisible: Boolean(trustRowRect && trustRowRect.width > 0 && trustRowRect.height > 0),
          trustRowText,
          trustRowHasPrivacyLink: Boolean(trustRowPrivacyLink),
          trustRowLinkText,
          trustRowLinkFontSize,
          visiblePrivacyLinksCount: visiblePrivacyLinks.length,
        };
      }, scenario);

      const pass =
        metrics.trustLabelFound &&
        metrics.trustRowFound &&
        metrics.trustRowVisible &&
        metrics.trustRowHasPrivacyLink &&
        textIncludes(metrics.trustRowLinkText, scenario.privacyLabelSnippet) &&
        metrics.trustRowLinkFontSize >= 14 &&
        metrics.visiblePrivacyLinksCount >= 1;

      results.push({
        scenario: scenario.name,
        locale: scenario.locale,
        viewport: viewport.name,
        pass,
        ...metrics,
      });

      await page.close();
    }
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((row) => !row.pass);
  if (failed.length > 0) {
    console.error("PUBLIC_HOME_PRIVACY_QA_FAILED");
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
})();
