/**
 * Browser-based scrapers (Playwright + stealth). Runs in a real Chromium so
 * we slip past Cloudflare/HUMAN/DataDome challenges that block raw HTTP.
 *
 * NOT importable from Vercel functions — Playwright is too heavy. Run as a
 * standalone Node script (locally or in GitHub Actions) that writes to the DB.
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore - stealth plugin works with playwright-extra at runtime
import stealth from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import type { RawListing, ScrapeContext, Source } from "../types";

chromiumExtra.use(stealth());

export interface BrowserScraper {
  source: Source;
  scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]>;
}

export async function runBrowserScrapers(
  scrapers: BrowserScraper[],
  ctx: ScrapeContext
): Promise<Record<Source, { raw: RawListing[]; error?: string }>> {
  const browser: Browser = await chromiumExtra.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context: BrowserContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  const out = {} as Record<Source, { raw: RawListing[]; error?: string }>;

  for (const scraper of scrapers) {
    const page = await context.newPage();
    try {
      console.log(`[${scraper.source}] starting...`);
      const start = Date.now();
      const raw = await scraper.scrape(ctx, page);
      out[scraper.source] = { raw };
      console.log(
        `[${scraper.source}] done. ${raw.length} listings in ${Date.now() - start}ms`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${scraper.source}] error:`, msg);
      out[scraper.source] = { raw: [], error: msg };
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();
  return out;
}

/** Helper to extract JSON from `<script id="__NEXT_DATA__">`. */
export async function nextData<T = any>(page: Page): Promise<T | null> {
  try {
    const text = await page
      .locator('script#__NEXT_DATA__')
      .first()
      .textContent({ timeout: 2000 });
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
