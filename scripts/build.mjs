// Builds the static site into _site/ by scanning each category folder
// (drop/, tour/, collabs/, samples/, employee/, books/) sitting at the
// root of the repo. Run automatically by .github/workflows/deploy.yml on
// every push - you never need to run this yourself, just add photos and
// push.
//
// Usage (only if you want to preview locally): node scripts/build.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "_site");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ORDERED_SUBFOLDERS = ["capsule", "stock", "fan"];

function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

// Some old folder names carry a mangled checkmark left over from an
// encoding mixup (shows up as garbled "Γ£ô"-style characters). Swap that
// exact leftover sequence back into a real checkmark wherever a title is
// displayed.
const MOJIBAKE_CHECKMARK = "#U0393#U00a3#U00f4";
function cleanTitle(str) {
  return String(str).split(MOJIBAKE_CHECKMARK).join("✓");
}

function relFromRoot(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

// Recursively find every image inside a folder (handles nested subfolders).
function findImages(dir) {
  let found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found = found.concat(findImages(full));
    } else if (isImageFile(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

// Images directly inside a folder (not recursing into subfolders).
function findImagesShallow(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function readInfo(folderPath) {
  const infoPath = path.join(folderPath, "info.json");
  if (!fs.existsSync(infoPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(infoPath, "utf8"));
  } catch (err) {
    console.warn(`Could not parse info.json in ${folderPath}:`, err.message);
    return {};
  }
}

function findPreviewImage(folderPath) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const candidate = path.join(folderPath, `preview${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findBannerImage(folderPath) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const candidate = path.join(folderPath, `banner${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Optional per-photo captions: an "items.json" file in a collection folder
// mapping a photo's filename to { "name": "...", "info": "..." }. Both
// fields are optional. Used to show a name/info panel next to the photo
// when it's opened in the lightbox.
function readItems(folderPath) {
  const itemsPath = path.join(folderPath, "items.json");
  if (!fs.existsSync(itemsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  } catch (err) {
    console.warn(`Could not parse items.json in ${folderPath}:`, err.message);
    return {};
  }
}

function itemAttrs(imgPath, items) {
  const item = items[path.basename(imgPath)];
  if (!item) return "";
  let attrs = "";
  if (item.name) attrs += ` data-name="${escapeHtml(item.name)}"`;
  if (item.info) attrs += ` data-info="${escapeHtml(item.info)}"`;
  return attrs;
}

// Gathers this collection's images in display order. If capsule/, stock/,
// or fan/ subfolders exist, images are pulled in that order (capsule
// pictures first, then stock/found images, then fan pictures). Otherwise
// falls back to a flat recursive scan of the whole folder (this keeps all
// existing collection folders working exactly as before).
function collectOrderedImages(folderPath) {
  const hasOrderedSubfolders = ORDERED_SUBFOLDERS.some((name) =>
    fs.existsSync(path.join(folderPath, name))
  );

  if (!hasOrderedSubfolders) {
    return findImages(folderPath);
  }

  let images = [];
  for (const name of ORDERED_SUBFOLDERS) {
    images = images.concat(findImages(path.join(folderPath, name)));
  }
  // Also include any loose images sitting directly in the collection
  // folder itself (not inside capsule/stock/fan), added last.
  images = images.concat(findImagesShallow(folderPath));
  return images;
}

// Category folders live directly at the repo root: <categoryKey>/<collectionFolder>/
function buildCollectionSection(categoryKey, folderName) {
  const folderPath = path.join(ROOT, categoryKey, folderName);
  const info = readInfo(folderPath);
  const title = cleanTitle(info.title || folderName);
  const shortTitle = cleanTitle(info.shortTitle || title);
  const sectionId = `${categoryKey}-${slugify(folderName)}`;
  const items = readItems(folderPath);

  const preview = findPreviewImage(folderPath);
  const banner = findBannerImage(folderPath);

  const orderedImages = collectOrderedImages(folderPath).filter(
    (p) => p !== preview && p !== banner
  );
  const coverImage = preview || orderedImages[0] || null;
  const gridImages = orderedImages.filter((p) => p !== coverImage);

  const dateLine = info.date
    ? `<p class="collection-meta">${
        info.link
          ? `<a href="${escapeHtml(info.link)}" target="_blank" rel="noopener">${escapeHtml(info.date)}</a>`
          : escapeHtml(info.date)
      }</p>`
    : "";

  const coverHtml = coverImage
    ? `<button class="thumb collection-cover"${itemAttrs(coverImage, items)}><img src="${relFromRoot(coverImage)}" alt="${escapeHtml(title)}" loading="lazy" /></button>`
    : "";

  const gridHtml = gridImages
    .map(
      (imgPath) =>
        `<button class="thumb"${itemAttrs(imgPath, items)}><img src="${relFromRoot(imgPath)}" alt="${escapeHtml(title)} photo" loading="lazy" /></button>`
    )
    .join("\n        ");

  const bannerStyle = banner
    ? ` style="--banner-image: url('${relFromRoot(banner)}');"`
    : "";

  return {
    id: sectionId,
    navLabel: shortTitle,
    html: `
    <section class="collection${banner ? " has-banner" : ""}" id="${sectionId}" data-title="${escapeHtml(title)}"${bannerStyle}>
      <h2>${escapeHtml(title)}</h2>
      ${dateLine}
      ${coverHtml}
      <div class="gallery">
        ${gridHtml}
      </div>
    </section>`,
  };
}

function buildCategoryBlock(category) {
  const categoryDir = path.join(ROOT, category.key);
  let sections = [];

  if (fs.existsSync(categoryDir)) {
    const folders = fs
      .readdirSync(categoryDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a)); // newest-looking names first

    sections = folders.map((folderName) =>
      buildCollectionSection(category.key, folderName)
    );
  }

  const sectionsHtml = sections.length
    ? sections.map((s) => s.html).join("\n")
    : `<p class="empty-state">No collections added to this category yet. See README.md for how to add one.</p>`;

  const blockHtml = `
  <div class="category-block" data-category="${category.key}">
    <h1 class="category-heading">${escapeHtml(category.title)}</h1>
    ${sectionsHtml}
  </div>`;

  return { sections, blockHtml };
}

function buildNavHtml(categories, currentKey) {
  const items = [
    `<a href="index.html">Home Page</a>`,
    ...categories.map((c) => {
      const cls = c.key === currentKey ? ' class="nav-current"' : "";
      return `<a href="${c.key}.html"${cls} data-nav-key="${c.key}">${escapeHtml(c.title)}</a>`;
    }),
  ];
  return `<nav class="site-nav">${items.join("\n    ")}</nav>`;
}

function buildCategoryPage(category, categories) {
  const currentIndex = categories.findIndex((c) => c.key === category.key);
  const nextCategory = categories[currentIndex + 1] || null;

  const { blockHtml } = buildCategoryBlock(category);
  const navHtml = buildNavHtml(categories, category.key);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(category.title)} &middot; G59 Merch Archive</title>
  <link rel="stylesheet" href="assets/css/style.css" />
</head>
<body data-category="${category.key}" data-next-category="${nextCategory ? nextCategory.key : ""}">
  ${navHtml}
  <div class="search-bar">
    <input type="text" id="search-input" placeholder="search items (e.g. box logo, hoodie...)" autocomplete="off" />
  </div>

  <div class="page-body">
    <main class="content" id="content">${blockHtml}
      <div id="scroll-sentinel"></div>
    </main>
  </div>

  <div id="lightbox" class="lightbox">
    <button id="lightbox-close" class="lightbox-close" aria-label="Close">&times;</button>
    <div class="lightbox-content">
      <div class="lightbox-image-wrap">
        <img id="lightbox-img" src="" alt="Full size merch photo" />
      </div>
      <div id="lightbox-info" class="lightbox-info">
        <h2 id="lightbox-name"></h2>
        <p id="lightbox-desc"></p>
      </div>
    </div>
  </div>

  <script src="assets/js/site.js"></script>
</body>
</html>
`;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyDir(path.join(ROOT, "assets"), path.join(OUT, "assets"));

  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(OUT, "index.html"));

  if (fs.existsSync(path.join(ROOT, "CNAME"))) {
    fs.copyFileSync(path.join(ROOT, "CNAME"), path.join(OUT, "CNAME"));
  }

  const categories = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "categories.json"), "utf8")
  );

  for (const category of categories) {
    // Copy this category's whole folder (with all its photos) into _site/
    const categorySrc = path.join(ROOT, category.key);
    if (fs.existsSync(categorySrc)) {
      copyDir(categorySrc, path.join(OUT, category.key));
    }

    const html = buildCategoryPage(category, categories);
    fs.writeFileSync(path.join(OUT, `${category.key}.html`), html);
    console.log(`Built ${category.key}.html`);
  }

  console.log(`\nDone. Output in ${OUT}`);
}

main();
