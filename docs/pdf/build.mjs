// Builds docs/dossier-technique.pdf from docs/dossier-technique.md:
//   1. Markdown -> HTML (markdown-it), headings numbered, table of contents generated;
//   2. HTML laid out in A4 pages by Paged.js inside Chrome (puppeteer), then printed to PDF.
// Run by docs/build-pdf.ps1, which first renders the diagrams of docs/images/diagrams.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "..");
const source = join(docs, "dossier-technique.md");
const output = join(docs, "dossier-technique.pdf");

// GitHub-like ids: lower case, accents kept, punctuation removed, spaces to hyphens
const slugify = (text) =>
  text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");

const md = new MarkdownIt({ html: true }).use(anchor, { slugify });
let html = md.render(readFileSync(source, "utf8"));

// Numbered headings (1., 1.1) and table of contents entries. Each part starts on a new page,
// except these short ones, which follow the previous part
const noPageBreak = new Set([
  "workflow-git-et-gestion-de-projet",
  "limites-et-améliorations",
  "vidéo-de-démonstration",
  "pour-aller-plus-loin",
]);
const toc = [];
let h2 = 0;
let h3 = 0;
html = html.replace(/<h([23]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/g, (_, level, id, title) => {
  if (level === "2") {
    h2 += 1;
    h3 = 0;
  } else {
    h3 += 1;
  }
  const num = level === "2" ? `${h2}.` : `${h2}.${h3}`;
  toc.push({ level, id, num, title: title.replace(/<[^>]+>/g, "") });
  const keep = level === "2" && noPageBreak.has(id) ? ' class="no-break"' : "";
  return `<h${level} id="${id}"${keep}><span class="num">${num}</span>${title}</h${level}>`;
});

const tocHtml = `<nav class="toc"><h2 id="sommaire">Sommaire</h2><ol>${toc
  .map(
    (e) =>
      `<li class="level-${e.level}"><a href="#${e.id}"><span class="title">${e.num} ${e.title}</span><span class="dots"></span></a></li>`,
  )
  .join("")}</ol></nav>`;
html = html.replace(/<p>\[\[TOC\]\]<\/p>/, tocHtml);

// A paragraph holding only an image becomes a figure; its alt text is the caption.
// The optional title sets the width ("w60") and the kind ("diagram"): ![caption](src "w60 diagram")
html = html.replace(
  /<p><img src="([^"]+)" alt="([^"]*)"(?: title="([^"]*)")?><\/p>/g,
  (_, src, alt, title = "") => {
    const classes = title.split(/\s+/).filter(Boolean);
    const width = classes.filter((c) => /^w\d+$/.test(c)).join(" ");
    const kind = classes.includes("diagram") ? ' class="diagram"' : "";
    return `<figure class="${width}"><img src="${src}" alt="${alt}"${kind}><figcaption>${alt}</figcaption></figure>`;
  },
);

// Short tables (12 rows at most) are never split across two pages
html = html.replace(/<table>([\s\S]*?)<\/table>/g, (table, inner) =>
  (inner.match(/<tr>/g) ?? []).length <= 13 ? `<table class="keep">${inner}</table>` : table,
);

// markdown-it percent-encodes link targets (#d%C3%A9mo): back to the raw id, which Paged.js and
// the PDF use to resolve internal links
html = html.replace(/href="#([^"]+)"/g, (_, id) => `href="#${decodeURIComponent(id)}"`);

// External links open in a new tab when the PDF is read in a browser
html = html.replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank"');

const polyfill = pathToFileURL(join(here, "node_modules", "pagedjs", "dist", "paged.polyfill.js")).href;
const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>deckgen : dossier technique</title>
<meta name="author" content="Marc Awad">
<base href="${pathToFileURL(docs).href}/">
<style>${readFileSync(join(here, "style.css"), "utf8")}</style>
<script>window.PagedConfig = { auto: true, after: () => { window.pagedDone = true; } };</script>
<script src="${polyfill}"></script>
</head>
<body>${html}</body>
</html>`;

const buildDir = join(here, "node_modules", ".build");
mkdirSync(buildDir, { recursive: true });
const htmlFile = join(buildDir, "dossier-technique.html");
writeFileSync(htmlFile, page);

const browser = await puppeteer.launch({ args: ["--allow-file-access-from-files"] });
try {
  const tab = await browser.newPage();
  tab.on("pageerror", (error) => console.error("page error:", error.message));
  tab.on("requestfailed", (request) => console.error("not loaded:", request.url()));
  await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await tab.waitForFunction("window.pagedDone === true", { timeout: 180000 });
  const pages = await tab.evaluate(() => document.querySelectorAll(".pagedjs_page").length);
  await tab.pdf({
    path: output,
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    outline: true,
    tagged: true,
  });
  console.log(`${output}: ${pages} pages, ${toc.length} headings in the table of contents`);
} finally {
  await browser.close();
}
