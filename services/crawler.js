import * as cheerio from "cheerio";
import URL from "url";

export async function crawlSite(startUrl, maxPages = 20) {
  const visited = new Set();
  const queue = [startUrl];
  const pages = {}; // URL -> Raw HTML
  const baseUrlObj = new URL.URL(startUrl);

  while (queue.length > 0 && visited.size < maxPages) {
    const currentUrl = queue.shift();
    if (visited.has(currentUrl)) continue;

    try {
      visited.add(currentUrl);

      // Using Native Node.js fetch
      const response = await fetch(currentUrl, {
        headers: { "User-Agent": "SEORemediatorBot/1.0" },
      });

      if (!response.ok) {
        console.error(`Failed to fetch (${response.status}): ${currentUrl}`);
        continue;
      }

      // Check content-type header natively
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("text/html")) continue;

      // Extract text content
      const html = await response.text();
      pages[currentUrl] = html;

      // Extract internal links using Cheerio
      const $ = cheerio.load(html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        try {
          const absoluteUrl = new URL.URL(href, currentUrl);
          // Keep traversal bound to the host domain
          if (
            absoluteUrl.hostname === baseUrlObj.hostname &&
            !visited.has(absoluteUrl.href)
          ) {
            queue.push(absoluteUrl.href);
          }
        } catch (e) {
          // Ignore invalid, mailto, or anchor-only hash links
        }
      });
    } catch (error) {
      console.error(`Error crawling path ${currentUrl}:`, error.message);
    }
  }

  return pages;
}
