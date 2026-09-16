/**
 * Post-build: inject crawlable semantic HTML into #root for each indexable route.
 * Reads hashed asset URLs from dist/index.html so CRA bundles stay in sync.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  INDEXABLE_ROUTES,
  ROUTE_SEO,
  STATIC_ROUTE_CONTENT,
  SITE_NAME,
  SITE_URL,
  getRelatedWorkflowLinks,
} from "../src/seoConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const BUILT_INDEX = path.join(DIST_DIR, "index.html");
const OG_IMAGE = `${SITE_URL}/social-preview.png`;

const STATIC_SHELL_CSS = `
      .seo-static-shell {
        max-width: 840px;
        margin: 0 auto;
        padding: 24px 28px 48px;
        color: #0F172A;
        line-height: 1.6;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .seo-static-eyebrow {
        margin: 0 0 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #0F766E;
      }
      .seo-static-shell h1 {
        margin: 0 0 12px;
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
      }
      .seo-static-shell h2 {
        margin: 24px 0 8px;
        font-size: 1.125rem;
        font-weight: 600;
        color: #0F172A;
      }
      .seo-static-intro,
      .seo-static-shell p {
        margin: 0 0 12px;
        color: #475569;
        font-size: 15px;
      }
      .seo-static-shell a {
        color: #0F766E;
        text-decoration: none;
        font-weight: 500;
      }
      .seo-static-shell a:hover {
        text-decoration: underline;
      }
      .seo-static-nav {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px solid #E2E8F0;
        font-size: 14px;
        color: #475569;
      }
      .seo-static-nav ul {
        margin: 8px 0 0;
        padding-left: 1.25rem;
      }
      .seo-static-nav li {
        margin-bottom: 6px;
      }
      .seo-static-footer-links {
        margin-top: 20px;
        font-size: 14px;
      }
`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`Expected pattern not found in built index.html: ${pattern}`);
  }
  return html.replace(pattern, replacement);
}

function setTitle(html, title) {
  return replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function setMetaContent(html, attr, key, value) {
  const re = new RegExp(
    `<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/>`,
    "i"
  );
  return replaceTag(
    html,
    re,
    `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`
  );
}

function setCanonical(html, url) {
  return replaceTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(url)}" />`
  );
}

function ensureStaticShellCss(html) {
  if (html.includes(".seo-static-shell")) {
    return html;
  }
  return html.replace("</style>", `${STATIC_SHELL_CSS}\n    </style>`);
}

function removeHomeJsonLd(html) {
  return html.replace(
    /\s*<!-- Structured Data -->[\s\S]*?<\/script>\s*/i,
    "\n"
  );
}

function buildBreadcrumbJsonLd(routePath, label) {
  const canonical = ROUTE_SEO[routePath].canonical;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: ROUTE_SEO[routePath].title,
        description: ROUTE_SEO[routePath].description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: `${SITE_URL}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: label,
            item: canonical,
          },
        ],
      },
    ],
  };
}

function injectRouteJsonLd(html, routePath, label) {
  const jsonLd = buildBreadcrumbJsonLd(routePath, label);
  const script = `\n    <script type="application/ld+json">\n      ${JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c")}\n    </script>\n`;
  return html.replace("</head>", `${script}  </head>`);
}

function buildHomeShell(content) {
  const sections = content.sections
    .map(
      (section) => `
    <section>
      <h2>${escapeHtml(section.h2)}</h2>
      <p>${escapeHtml(section.text)} <a href="${escapeHtml(section.path)}">${escapeHtml(section.linkLabel)}</a>.</p>
    </section>`
    )
    .join("");

  const footerLinks = content.footerLinks
    .map(
      (link) =>
        `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`
    )
    .join(" · ");

  return `
    <article class="seo-static-shell">
      <header>
        <p class="seo-static-eyebrow">${escapeHtml(content.eyebrow)}</p>
        <h1>${escapeHtml(content.h1)}</h1>
        <p class="seo-static-intro">${escapeHtml(content.intro)}</p>
      </header>
      ${sections}
      <div class="seo-static-footer-links">${footerLinks}</div>
    </article>`;
}

function buildRouteShell(routePath, content) {
  const links = getRelatedWorkflowLinks(routePath);
  const listItems = links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a></li>`
    )
    .join("\n        ");

  return `
    <article class="seo-static-shell">
      <header>
        <p class="seo-static-eyebrow">${escapeHtml(content.eyebrow)}</p>
        <h1>${escapeHtml(content.h1)}</h1>
        <p class="seo-static-intro">${escapeHtml(content.intro)}</p>
      </header>
      <nav class="seo-static-nav" aria-label="Related TargetForge workflows">
        <span>Explore workflows:</span>
        <ul>
        ${listItems}
        </ul>
      </nav>
    </article>`;
}

function injectRootContent(html, innerHtml) {
  const trimmed = innerHtml.trim();
  if (!/<div id="root">\s*<\/div>/.test(html)) {
    throw new Error("Expected empty <div id=\"root\"></div> in built index.html");
  }
  return html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">${trimmed}\n    </div>`
  );
}

function applySeoMeta(html, routePath) {
  const seo = ROUTE_SEO[routePath];
  const robots = seo.noindex ? "noindex, nofollow" : "index, follow";

  let out = setTitle(html, seo.title);
  out = setMetaContent(out, "name", "description", seo.description);
  out = setMetaContent(out, "name", "robots", robots);
  out = setCanonical(out, seo.canonical);

  out = setMetaContent(out, "property", "og:url", seo.canonical);
  out = setMetaContent(out, "property", "og:title", seo.title);
  out = setMetaContent(out, "property", "og:description", seo.description);
  out = setMetaContent(out, "property", "og:image:alt", seo.title);

  out = setMetaContent(out, "name", "twitter:url", seo.canonical);
  out = setMetaContent(out, "name", "twitter:title", seo.title);
  out = setMetaContent(out, "name", "twitter:description", seo.description);
  out = setMetaContent(out, "name", "twitter:image:alt", seo.title);

  return out;
}

function routeOutputPath(routePath) {
  if (routePath === "/") {
    return BUILT_INDEX;
  }
  const segment = routePath.replace(/^\//, "");
  return path.join(DIST_DIR, segment, "index.html");
}

function generateRouteHtml(baseHtml, routePath) {
  const content = STATIC_ROUTE_CONTENT[routePath];
  if (!content) {
    throw new Error(`Missing STATIC_ROUTE_CONTENT for ${routePath}`);
  }

  let html = applySeoMeta(baseHtml, routePath);
  html = ensureStaticShellCss(html);

  if (routePath === "/") {
    const shell = buildHomeShell(content);
    html = injectRootContent(html, shell);
  } else {
    html = removeHomeJsonLd(html);
    html = injectRouteJsonLd(html, routePath, content.breadcrumbLabel);
    const shell = buildRouteShell(routePath, content);
    html = injectRootContent(html, shell);
  }

  return html;
}

function main() {
  if (!fs.existsSync(BUILT_INDEX)) {
    console.error("dist/index.html not found. Run react-scripts build first.");
    process.exit(1);
  }

  const baseHtml = fs.readFileSync(BUILT_INDEX, "utf8");

  if (!baseHtml.includes('id="root"')) {
    console.error("Built index.html is missing #root.");
    process.exit(1);
  }

  for (const routePath of INDEXABLE_ROUTES) {
    const html = generateRouteHtml(baseHtml, routePath);
    const outPath = routeOutputPath(routePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  }

  console.log(`Injected crawlable HTML for ${INDEXABLE_ROUTES.length} routes.`);
}

main();
