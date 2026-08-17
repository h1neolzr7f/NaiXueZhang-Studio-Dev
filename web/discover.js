(function () {
  const selected = new Set();
  let items = [];

  function escapeText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function workId(item) {
    return String(item.work_id || item.id || "");
  }
  function thumb(item) {
    const image = (item.images && item.images[0]) || {};
    return image.thumbnail_url || image.url || item.cover_url || (workId(item) ? "/api/nai/aitag/cover/" + encodeURIComponent(workId(item)) : "");
  }
  function setAitagStatus(text) {
    const status = document.querySelector("[data-aitag-status]");
    if (status) status.textContent = text;
  }
  function showSite(site) {
    const next = site === "aitag" ? "aitag" : "pixiv";
    document.querySelectorAll("[data-site]").forEach((button) => {
      const on = button.getAttribute("data-site") === next;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-site-panel]").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-site-panel") !== next;
    });
    const url = new URL(window.location.href);
    url.searchParams.set("site", next);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
  function syncAitagActions() {
    const empty = selected.size === 0;
    document.querySelectorAll("[data-aitag-import], [data-aitag-fav], [data-aitag-clear]").forEach((button) => {
      button.disabled = empty;
    });
    document.querySelector("[data-aitag-all]")?.toggleAttribute("disabled", !items.length);
  }
  function renderAitag() {
    const host = document.querySelector("[data-aitag-grid]");
    const picked = document.querySelector("[data-aitag-picked]");
    if (picked) picked.textContent = selected.size ? ("已选 " + selected.size + " 张，下一步点导入") : "还没选作品，先点卡片";
    syncAitagActions();
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<p class="ex-empty" data-aitag-placeholder>这里会列出搜索结果。点卡片选中，再点下面的导入。</p>';
      return;
    }
    host.innerHTML = items.map((item) => {
      const id = workId(item);
      const on = selected.has(id) ? " is-on" : "";
      const src = thumb(item);
      return `<article class="ex-card${on}" data-id="${escapeText(id)}" title="点击选中或取消">
        ${src ? `<img src="${escapeText(src)}" alt="" />` : `<div class="ex-ph"></div>`}
        <span class="ex-check">✓</span>
        <div class="ex-meta">
          <strong>${escapeText(item.title || id)}</strong>
          <small>${escapeText(item.creator || item.author || "AITag")}</small>
        </div>
      </article>`;
    }).join("");
  }
  async function refreshStates() {
    const pixivChip = document.querySelector("[data-pixiv-state]");
    const aitagChip = document.querySelector("[data-aitag-state]");
    if (!window.ApiClient) return;
    try {
      const data = await window.ApiClient.get("/api/crawler/status");
      const running = Boolean(data && data.status && data.status.pixiv && data.status.pixiv.running);
      if (pixivChip) {
        pixivChip.textContent = running ? "正在采集" : "还没开始";
        pixivChip.classList.toggle("is-on", running);
      }
    } catch (_) {
      if (pixivChip) pixivChip.textContent = "状态未知";
    }
    try {
      const data = await window.ApiClient.get("/api/nai/aitag/status");
      const ok = Boolean(data && data.ok && data.enabled !== false);
      if (aitagChip) {
        aitagChip.textContent = ok ? "可以搜索" : "现在搜不到";
        aitagChip.classList.toggle("is-on", ok);
      }
    } catch (_) {
      if (aitagChip) aitagChip.textContent = "状态未知";
    }
  }
  async function searchAitag(query, sort) {
    const q = String(query || "").trim();
    if (!q) {
      items = [];
      selected.clear();
      setAitagStatus("先输入关键词再搜。空着点搜索不会访问站点。");
      renderAitag();
      return;
    }
    setAitagStatus("正在搜索…");
    const data = await window.ApiClient.get(
      "/api/nai/aitag/search?q=" + encodeURIComponent(q)
        + "&sort=" + encodeURIComponent(sort || "new")
        + "&page_size=24&nai_only=true&safe_only=true"
    );
    items = (data && (data.items || data.works)) || [];
    selected.clear();
    setAitagStatus(items.length
      ? ("找到 " + (data.filtered_count != null ? data.filtered_count : items.length) + " 张。点卡片选中，再点导入。")
      : ((data && data.message) || "没有结果。换个词试试。"));
    renderAitag();
  }
  async function importSelected() {
    const ids = Array.from(selected);
    if (!ids.length) {
      setAitagStatus("先点卡片选中作品，再导入。");
      return;
    }
    let ok = 0;
    for (const id of ids) {
      try {
        await window.ApiClient.post("/api/nai/aitag/import", { work_id: id, image_index: 0, slot_index: 0 });
        ok += 1;
      } catch (_) { /* keep going */ }
    }
    setAitagStatus(ok
      ? ("已导入 " + ok + " 项。打开「标签资产」就能用。")
      : "这次没有导入成功。可以换几张再试。");
  }
  async function favoriteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) {
      setAitagStatus("先点卡片选中作品，再收藏。");
      return;
    }
    let ok = 0;
    for (const id of ids) {
      try {
        await window.ApiClient.post("/api/nai/aitag/favorites/" + encodeURIComponent(id) + "/toggle", {});
        ok += 1;
      } catch (_) { /* keep going */ }
    }
    setAitagStatus(ok ? ("已记下 " + ok + " 项位置，没有下载原图。") : "收藏失败。");
  }
  function guardPixivStart() {
    const watch = document.getElementById("pixivStartWatch");
    const once = document.getElementById("pixivRunOnce");
    const enabled = document.getElementById("pixivEnabled");
    function confirmStart(event, message) {
      if (enabled && !enabled.checked) enabled.checked = true;
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    watch?.addEventListener("click", (event) => {
      confirmStart(event, "开始持续采集 Pixiv？\n\n会按上面的标签在后台拉图。只有 NovelAI 作品会进图库。可随时点停止。");
    }, true);
    once?.addEventListener("click", (event) => {
      confirmStart(event, "只跑一轮 Pixiv 采集？\n\n跑完会停。只有 NovelAI 作品会进图库。");
    }, true);
  }
  function start() {
    if (!window.ApiClient) return;
    const query = new URLSearchParams(window.location.search || "");
    showSite(query.get("site") === "aitag" ? "aitag" : "pixiv");
    document.querySelectorAll("[data-site]").forEach((button) => {
      button.addEventListener("click", () => showSite(button.getAttribute("data-site")));
    });
    const form = document.querySelector("[data-aitag-search]");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        void searchAitag(String(data.get("q") || ""), String(data.get("sort") || "new"));
      });
    }
    const grid = document.querySelector("[data-aitag-grid]");
    if (grid) {
      grid.addEventListener("click", (event) => {
        const card = event.target.closest("[data-id]");
        if (!card) return;
        const id = card.getAttribute("data-id");
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        renderAitag();
      });
    }
    document.querySelector("[data-aitag-clear]")?.addEventListener("click", () => {
      selected.clear();
      renderAitag();
    });
    document.querySelector("[data-aitag-all]")?.addEventListener("click", () => {
      items.forEach((item) => selected.add(workId(item)));
      renderAitag();
    });
    document.querySelector("[data-aitag-import]")?.addEventListener("click", () => { void importSelected(); });
    document.querySelector("[data-aitag-fav]")?.addEventListener("click", () => { void favoriteSelected(); });
    guardPixivStart();
    renderAitag();
    void refreshStates();
    setInterval(refreshStates, 5000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
