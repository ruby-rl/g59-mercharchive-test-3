// Powers every category page: click-to-zoom lightbox with a name/info
// panel, top-nav scroll-highlighting, search filtering, and infinite
// scroll from one category straight into the next. Nothing here runs on
// the home page.

let sectionObserver = null;
let currentVisibleId = null;
let isLoadingNext = false;

document.addEventListener("DOMContentLoaded", () => {
  initLightbox();
  initNavHighlighting();
  initSearch();
  initInfiniteScroll();
});

function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const infoBox = document.getElementById("lightbox-info");
  const nameEl = document.getElementById("lightbox-name");
  const descEl = document.getElementById("lightbox-desc");
  const closeBtn = document.getElementById("lightbox-close");
  if (!lightbox || !lightboxImg) return;

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightboxImg.src = "";
  }

  // Delegated on document so it keeps working for thumbnails added later
  // by infinite scroll, without needing to re-attach anything.
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".thumb");
    if (button) {
      const img = button.querySelector("img");
      if (img) {
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;

        const name = button.dataset.name || "";
        const info = button.dataset.info || "";
        if (nameEl) nameEl.textContent = name;
        if (descEl) descEl.textContent = info;
        if (infoBox) infoBox.classList.toggle("has-content", Boolean(name || info));

        lightbox.classList.add("open");
      }
      return;
    }
    if (event.target === closeBtn) {
      closeLightbox();
      return;
    }
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("open")) {
      closeLightbox();
    }
  });
}

function initNavHighlighting() {
  if (!("IntersectionObserver" in window)) return;

  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      setActiveSection(visible[0].target.id);
    },
    { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
  );

  observeAllSections();
}

function observeAllSections() {
  if (!sectionObserver) return;
  document.querySelectorAll(".collection[id]").forEach((section) => {
    sectionObserver.observe(section);
  });
}

function setActiveSection(id) {
  if (id === currentVisibleId) return;
  currentVisibleId = id;

  const section = document.getElementById(id);
  const category = section ? section.closest(".category-block")?.dataset.category : null;
  if (category) {
    document.querySelectorAll(".site-nav a[data-nav-key]").forEach((a) => {
      a.classList.toggle("nav-current", a.dataset.navKey === category);
    });
  }
}

function initSearch() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.addEventListener("input", () => {
    applyFilter(input.value.trim().toLowerCase());
  });
}

function applyFilter(query) {
  document.querySelectorAll(".category-block").forEach((block) => {
    let anyVisible = false;
    const emptyMsg = block.querySelector(".empty-state");

    block.querySelectorAll(".collection[id]").forEach((section) => {
      const title = (section.dataset.title || "").toLowerCase();
      const match = query === "" || title.includes(query);
      section.classList.toggle("filtered-out", !match);

      if (match) anyVisible = true;
    });

    const hideBlock = query !== "" && !anyVisible && !emptyMsg;
    const heading = block.querySelector(".category-heading");
    if (heading) heading.classList.toggle("filtered-out", hideBlock);
    block.classList.toggle("filtered-out", hideBlock);
  });
}

function initInfiniteScroll() {
  const sentinel = document.getElementById("scroll-sentinel");
  if (!sentinel || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) loadNextCategory(observer);
      });
    },
    { rootMargin: "400px 0px 0px 0px" }
  );

  observer.observe(sentinel);
}

async function loadNextCategory(observer) {
  if (isLoadingNext) return;

  const body = document.body;
  const nextKey = body.dataset.nextCategory;
  if (!nextKey) {
    observer.disconnect();
    return;
  }

  isLoadingNext = true;
  const sentinel = document.getElementById("scroll-sentinel");
  const loadingEl = document.createElement("div");
  loadingEl.className = "loading-more";
  loadingEl.textContent = "loading more...";
  sentinel.before(loadingEl);

  try {
    const res = await fetch(`${nextKey}.html`);
    if (!res.ok) throw new Error(`Failed to load ${nextKey}.html`);
    const html = await res.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");

    const newBlock = parsed.querySelector(".content .category-block");
    const content = document.getElementById("content");
    if (newBlock && content) {
      content.insertBefore(document.importNode(newBlock, true), sentinel);
    }

    const parsedBody = parsed.querySelector("body");
    body.dataset.nextCategory = parsedBody ? parsedBody.dataset.nextCategory || "" : "";

    observeAllSections();

    const input = document.getElementById("search-input");
    if (input && input.value.trim() !== "") {
      applyFilter(input.value.trim().toLowerCase());
    }

    if (!body.dataset.nextCategory) observer.disconnect();
  } catch (err) {
    console.error("Infinite scroll load failed:", err);
    observer.disconnect();
  } finally {
    loadingEl.remove();
    isLoadingNext = false;
  }
}
