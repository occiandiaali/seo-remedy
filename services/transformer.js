import * as cheerio from "cheerio";
import path from "path";

export function remediatePage(url, html) {
  const $ = cheerio.load(html);
  const issues = [];
  const fixes = [];
  const parsedUrl = new URL(url);
  let pageTitle =
    $("title").text() || path.basename(parsedUrl.pathname) || "Home";

  // 1. Check & Fix Title
  if (!$("title").length || !$("title").text().trim()) {
    issues.push({
      type: "SEO",
      severity: "high",
      message: "Missing <title> tag.",
    });
    if (!$("title").length) {
      $("head").append(`<title>${pageTitle} | Optimized Site</title>`);
    } else {
      $("title").text(`${pageTitle} | Optimized Site`);
    }
    fixes.push({
      component: "Title",
      detail: "Generated fallback title from URL context.",
    });
  }

  // 2. Check & Fix Meta Description
  if (!$('meta[name="description"]').length) {
    issues.push({
      type: "SEO",
      severity: "high",
      message: "Missing meta description.",
    });
    $("head").append(
      `<meta name="description" content="Discover ${pageTitle}. Read more about our content and updates here.">`,
    );
    fixes.push({
      component: "Meta Description",
      detail: "Injected automated structural description.",
    });
  }

  // 3. Accessibility: Landmark Roles
  const landmarks = {
    header: "banner",
    nav: "navigation",
    main: "main",
    footer: "contentinfo",
  };

  Object.entries(landmarks).forEach(([tag, role]) => {
    $(tag).each((_, el) => {
      if (!$(el).attr("role")) {
        issues.push({
          type: "A11y",
          severity: "low",
          message: `<${tag}> missing implicit role="${role}".`,
        });
        $(el).attr("role", role);
        fixes.push({
          component: tag,
          detail: `Added role="${role}" accessibility landmark.`,
        });
      }
    });
  });

  // 4. Accessibility: Image Alts
  $("img").each((i, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined) {
      issues.push({
        type: "A11y",
        severity: "medium",
        message: "Image missing alt attribute.",
      });
      $(el).attr("alt", `Descriptive asset image ${i + 1}`);
      fixes.push({
        component: "Image",
        detail: `Injected placeholder alt attribute to image index ${i + 1}.`,
      });
    }
  });

  // 5. SEO: Heading Hierarchy Check (Non-destructive warning)
  let hasH1 = $("h1").length > 0;
  if (!hasH1) {
    issues.push({
      type: "SEO",
      severity: "medium",
      message: "No H1 heading found on the page.",
    });
    // Safe auto-remediation: wrap page title if no h1 exists, or leave warning
  }

  return {
    optimizedHtml: $.html(),
    issues,
    fixes,
  };
}
