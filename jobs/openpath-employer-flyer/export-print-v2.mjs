import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "exports");
const url = "http://localhost:8765/layouts/02-services-process.html?export=1";
const pdfPath = path.join(outDir, "OpenPath-Employer-Flyer-V2.pdf");
const jpgPath = path.join(outDir, "OpenPath-Employer-Flyer-V2.jpg");

const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(chrome) ? chrome : undefined,
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 1600 },
});
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".page");
await page.addStyleTag({
  content: `
    .screen-only { display: none !important; }
    html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
    .page { margin: 0 !important; box-shadow: none !important; }
    @page { size: letter portrait; margin: 0; }
  `,
});
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
});
await page.waitForTimeout(800);

await page.pdf({
  path: pdfPath,
  width: "8.5in",
  height: "11in",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});

const dpi = 300;
const widthPx = Math.round(8.5 * dpi);
const heightPx = Math.round(11 * dpi);
const scale = widthPx / (8.5 * 96);
await page.setViewportSize({ width: widthPx + 40, height: heightPx + 40 });
await page.evaluate((scale) => {
  document.documentElement.style.zoom = String(scale);
}, scale);
await page.waitForTimeout(500);
const box = await page.$eval(".page", (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
await page.screenshot({
  path: jpgPath,
  type: "jpeg",
  quality: 93,
  clip: {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.min(box.width, widthPx),
    height: Math.min(box.height, heightPx),
  },
});

await browser.close();
console.log("PDF", pdfPath);
console.log("JPG", jpgPath);
