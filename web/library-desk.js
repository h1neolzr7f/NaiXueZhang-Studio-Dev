(function () {
  let selected = null;
  let kind = "all";
  function escapeText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function humanBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  function galleryId() {
    const select = document.querySelector("[data-gallery]");
    const query = new URLSearchParams(window.location.search || "");
    return String((select && select.value) || query.get("gallery") || query.get("gallery_id") || "site");
  }
  function thumb(item) {
    const image = (item.images && item.images[0]) || item;
    const direct = item.cover_url || item.thumbnail_url || item.thumb_url || image.thumbnail_url || image.thumb_url || "";
    if (direct) return direct;
    const path = String(item.thumb_path || image.thumb_path || image.local_path || "").replace(/\\/g, "/");
    if (!path) return "";
    if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;
    const gid = item.gallery_id || galleryId();
    const prefix = gid === "codex" ? "/data/gallery/codex/" : gid === "qqgroup" ? "/data/gallery/qqgroup/" : "/data/images/";
    return prefix + path.replace(/^\/+/, "").replace(/^data\/images\//, "");
  }
  function shortDate(value) {
    const text = String(value || "");
    return text.includes("T") ? text.slice(0, 10) : text;
  }
  function itemTags(item) {
    const raw = item.tags || item.tag_string || item.aitag_tags || "";
    if (Array.isArray(raw)) return raw.map((tag) => String(tag || "").trim()).filter(Boolean);
    const text = String(raw).trim();
    if (text.charAt(0) === "[") {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((tag) => String(tag || "").trim()).filter(Boolean);
      } catch (_) { /* use split fallback */ }
    }
    return text.split(/[,，]/).map((tag) => tag.replace(/^[\[\"]+|[\]\"]+$/g, "").trim()).filter(Boolean);
  }
  function renderTags(items) {
    const host = document.querySelector("[data-tags]");
    if (!host) return;
    const tags = [];
    items.forEach((item) => {
      itemTags(item).forEach((tag) => {
        if (tags.indexOf(tag) < 0) tags.push(tag);
      });
    });
    host.innerHTML = tags.slice(0, 12).map((tag) => `<button class="ex-tag" type="button" data-tag="${escapeText(tag)}">${escapeText(tag)}</button>`).join("")
      || '<p class="ex-empty">当前页没有可提取的标签</p>';
  }
  function renderGrid(items) {
    const host = document.querySelector("[data-grid]");
    const status = document.querySelector("[data-status]");
    if (!host) return;
    const visible = kind === "images"
      ? items.filter((item) => thumb(item) || (item.images && item.images.length))
      : items;
    if (!visible.length) {
      if (status) status.textContent = items.length ? "这一页没有图片资产。" : "无搜索结果。换个词，或先去在线发现入库。";
      host.innerHTML = "";
      return;
    }
    if (status) status.textContent = "";
    host.innerHTML = visible.map((item) => {
      const src = thumb(item);
      const on = selected && String(selected.id || selected.work_id) === String(item.id || item.work_id) ? " is-on" : "";
      return `<article class="ex-card${on}" data-id="${escapeText(item.id || item.work_id)}" data-gallery="${escapeText(item.gallery_id || galleryId())}">
        ${src ? `<img src="${escapeText(src)}" alt="" />` : `<div class="ex-ph"></div>`}
        <span class="ex-check">✓</span>
        <div class="ex-meta"><strong>${escapeText(item.title || item.id)}</strong><small>${escapeText(item.author || "")} · ${escapeText(shortDate(item.create_date))}</small></div>
      </article>`;
    }).join("");
  }
  function renderDetail(item) {
    const host = document.querySelector("[data-detail]");
    const picked = document.querySelector("[data-picked]");
    selected = item || null;
    if (picked) picked.textContent = item ? "已选择 1 项" : "未选择资产";
    if (!host) return;
    if (!item) {
      host.innerHTML = `<h3>资产详情</h3><p class="ex-empty">点选一张作品查看来源与谱系。</p>`;
      return;
    }
    const src = thumb(item);
    const gid = item.gallery_id || galleryId();
    const studio = window.WorkBridge
      ? window.WorkBridge.buildUrl("/studio", item.id || item.work_id, 0, gid)
      : ("/studio?from=" + encodeURIComponent(item.id || item.work_id) + "&gallery=" + encodeURIComponent(gid));
    const remix = "/remix?from=" + encodeURIComponent(item.id || item.work_id) + "&gallery=" + encodeURIComponent(gid);
    host.innerHTML = `
      <h3>${escapeText(item.title || item.id)}</h3>
      ${src ? `<img src="${escapeText(src)}" alt="" style="width:100%;border-radius:12px;margin:8px 0" />` : ""}
      <p>来源 ${escapeText(item.source || gid)}</p>
      <p>入库方式 本机检索</p>
      <p>${escapeText((item.prompt || item.comment || "").toString().slice(0, 180))}</p>
      <div class="ex-step"><b>资产谱系</b><div class="ex-flow-mini"><span>发现</span><span>入库</span><span>生成引用</span></div></div>
      <div class="ex-actions">
        <a class="ex-btn primary" data-use-selected href="${escapeText(studio)}">用此图生成</a>
        <a class="ex-btn" href="${escapeText(remix)}">换角色</a>
      </div>
    `;
  }
  function selectedHref(kindName) {
    if (!selected) return kindName === "remix" ? "/remix" : "/studio";
    const gid = selected.gallery_id || galleryId();
    if (kindName === "remix") return "/remix?from=" + encodeURIComponent(selected.id || selected.work_id) + "&gallery=" + encodeURIComponent(gid);
    return window.WorkBridge
      ? window.WorkBridge.buildUrl("/studio", selected.id || selected.work_id, 0, gid)
      : ("/studio?from=" + encodeURIComponent(selected.id || selected.work_id) + "&gallery=" + encodeURIComponent(gid));
  }
  async function loadRibbon(total) {
    const set = (sel, value) => { const el = document.querySelector(sel); if (el) el.textContent = value; };
    set("[data-stat-total]", String(total || 0));
    set("[data-stat-images]", String(total || 0));
    set("[data-stat-collections]", String(document.querySelectorAll("[data-collection]").length));
    try {
      const raw = await window.ApiClient.get("/api/maintenance/storage");
      const storage = (raw && raw.storage) || {};
      set("[data-stat-size]", humanBytes(storage.asset_bytes));
      set("[data-stat-free]", humanBytes(storage.disk_free_bytes));
    } catch (_) { /* keep placeholders */ }
    try {
      const favs = await window.ApiClient.get("/api/online/favorites");
      set("[data-stat-favs]", String(((favs && favs.items) || []).length));
    } catch (_) { /* keep 0 */ }
  }
  async function search() {
    const form = document.querySelector(".ex-page [data-search]");
    const q = String(new FormData(form).get("q") || "");
    const sort = String(new FormData(form).get("sort") || "new");
    const gid = galleryId();
    const data = await window.ApiClient.get("/api/ai_works_search?q=" + encodeURIComponent(q) + "&sort=" + encodeURIComponent(sort) + "&page_size=24&gallery_id=" + encodeURIComponent(gid));
    const items = (data && data.items) || [];
    window.__exLibraryItems = items;
    renderGrid(items);
    renderTags(items);
    void loadRibbon(data.total != null ? data.total : items.length);
  }
  function start() {
    if (!window.ApiClient) return;
    const query = new URLSearchParams(window.location.search || "");
    const form = document.querySelector(".ex-page [data-search]");
    const gallery = document.querySelector("[data-gallery]");
    if (query.get("q")) form.q.value = query.get("q");
    if (gallery && (query.get("gallery") || query.get("gallery_id"))) gallery.value = query.get("gallery") || query.get("gallery_id");
    form.addEventListener("submit", (event) => { event.preventDefault(); void search(); });
    if (gallery) gallery.addEventListener("change", () => { void search(); });
    document.querySelector("[data-grid]").addEventListener("click", (event) => {
      const card = event.target.closest("[data-id]");
      if (!card) return;
      const item = (window.__exLibraryItems || []).find((row) => String(row.id || row.work_id) === card.getAttribute("data-id"));
      renderDetail(item);
      renderGrid(window.__exLibraryItems || []);
    });
    document.querySelector("[data-tags]").addEventListener("click", (event) => {
      const tag = event.target.closest("[data-tag]");
      if (!tag) return;
      form.q.value = tag.getAttribute("data-tag") || "";
      void search();
    });
    document.querySelectorAll("[data-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        kind = button.getAttribute("data-kind") || "all";
        document.querySelectorAll("[data-kind]").forEach((el) => el.classList.toggle("is-on", el === button));
        renderGrid(window.__exLibraryItems || []);
      });
    });
    document.querySelector("[data-use]").addEventListener("click", (event) => {
      event.preventDefault();
      if (!selected) {
        const status = document.querySelector("[data-status]");
        if (status) status.textContent = "先点选一张作品，再生成。";
        return;
      }
      if (window.WorkBridge) window.WorkBridge.save({ workId: selected.id || selected.work_id, galleryId: selected.gallery_id || galleryId(), from: "library" });
      window.location.href = selectedHref("studio");
    });
    document.querySelector("[data-remix]").addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = selectedHref("remix");
    });
    void search();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
