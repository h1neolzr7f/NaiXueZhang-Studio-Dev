(function () {
  const selected = new Set();
  let items = [];
  let aitagView = "search";
  let aitagPage = 1;
  let aitagHasMore = false;
  let aitagLastQuery = null;
  let detailWorkId = "";

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
    const more = document.querySelector("[data-aitag-more]");
    if (more) more.hidden = !aitagHasMore;
  }
  function renderAitag() {
    const host = document.querySelector("[data-aitag-grid]");
    const picked = document.querySelector("[data-aitag-picked]");
    if (picked) picked.textContent = selected.size ? ("已选 " + selected.size + " 张，下一步点导入") : "还没选作品，先点卡片";
    syncAitagActions();
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<p class="ex-empty" data-aitag-placeholder>'
        + (aitagView === "favorites" ? "还没有收藏。先在搜索结果里点「收藏」。" : "这里会列出搜索结果。点卡片选中，再点下面的导入。")
        + "</p>";
      return;
    }
    host.innerHTML = items.map((item) => {
      const id = workId(item);
      const on = selected.has(id) ? " is-on" : "";
      const src = thumb(item);
      return `<article class="ex-card${on}" data-id="${escapeText(id)}" title="点击选中或取消">
        ${src ? `<img src="${escapeText(src)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}
        <span class="ex-check">✓</span>
        <span class="ex-hover"><button type="button" data-detail-open="${escapeText(id)}" title="查看详情">详</button></span>
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
  function setLiveChip(selector, text, on) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-on", Boolean(on));
  }
  let pixivLiveEventAt = 0;
  function renderPixivLive(payload) {
    const box = document.querySelector("[data-pixiv-live]");
    if (!box) return;
    {
      const report = payload.report || {};
      const process = payload.process || {};
      const running = Boolean(process.running);
      setLiveChip("[data-pixiv-live-process]", running ? "进程运行中" : "进程未运行", running);
      setLiveChip("[data-pixiv-live-round]", "本轮 " + (report.status || "—"), report.status === "running");
      const quarantined = Number(report.works_quarantined || 0);
      setLiveChip("[data-pixiv-live-quar]", "隔离 " + quarantined, quarantined > 0);
      setLiveChip("[data-pixiv-live-updated]", "更新 " + String(report.updated_at || "—").replace("T", " ").slice(5, 19));
      const counts = document.querySelector("[data-pixiv-live-counts]");
      if (counts) {
        const cells = [
          ["候选作品", report.works_seen],
          ["接受作品", report.works_accepted],
          ["部分接受", report.works_partial],
          ["接受页", report.accepted_pages],
          ["拒绝页", report.rejected_pages],
          ["失败页", report.failed_pages],
        ];
        counts.innerHTML = cells
          .map((cell) => `<div><small>${cell[0]}</small><b>${Number(cell[1] || 0)}</b></div>`)
          .join("");
      }
      const note = document.querySelector("[data-pixiv-live-note]");
      if (note) {
        const reasons = Object.entries(report.rejection_reasons || {})
          .map(([reason, count]) => reason + " × " + count)
          .slice(0, 3)
          .join(" · ");
        const history = Array.isArray(report.history) && report.history.length
          ? report.history[report.history.length - 1]
          : null;
        const bits = [];
        if (report.last_error) bits.push("最近错误类型 " + report.last_error);
        if (reasons) bits.push("拒绝原因 " + reasons);
        if (history) {
          bits.push("上一轮 " + String(history.status || "-") + " · 接受 " + Number(history.works_accepted || 0) + " · 失败 " + Number(history.works_failed || 0));
        }
        note.textContent = bits.length ? bits.join("；") : (running ? "正在按任务采集，计数会自己涨。" : "进度留在本页，不用去别处看。");
      }
    }
  }
  // pixiv-intake-control.js polls the same report every 5s on this page and
  // fans it out via "pixiv-intake-report"; only fetch directly when that
  // feed is absent, so the page never double-polls the crawler report.
  async function refreshPixivLive() {
    if (!window.ApiClient) return;
    if (Date.now() - pixivLiveEventAt < 8000) return;
    try {
      const payload = await window.ApiClient.get("/api/crawler/pixiv/report");
      renderPixivLive(payload || {});
    } catch (_) {
      setLiveChip("[data-pixiv-live-process]", "状态暂时读不到");
    }
  }
  function aitagFilters() {
    const panel = document.querySelector("[data-aitag-advanced]");
    const read = (name) => {
      const field = panel && panel.querySelector(`[name="${name}"]`);
      return field ? String(field.value || "").trim() : "";
    };
    return {
      creator: read("creator"),
      model: read("model"),
      tags: read("tags"),
      min_images: read("min_images") || "0",
      max_images: read("max_images") || "0",
      time_range: read("time_range") || "all",
    };
  }
  function aitagSearchUrl(query, sort, page) {
    const filters = aitagFilters();
    let url = "/api/nai/aitag/search?q=" + encodeURIComponent(query)
      + "&sort=" + encodeURIComponent(sort || "new")
      + "&page=" + page
      + "&page_size=24&nai_only=true&safe_only=true";
    if (filters.creator) url += "&creator=" + encodeURIComponent(filters.creator);
    if (filters.model) url += "&model=" + encodeURIComponent(filters.model);
    if (filters.tags) url += "&tags=" + encodeURIComponent(filters.tags);
    if (Number(filters.min_images) > 0) url += "&min_images=" + Number(filters.min_images);
    if (Number(filters.max_images) > 0) url += "&max_images=" + Number(filters.max_images);
    if (filters.time_range && filters.time_range !== "all") url += "&time_range=" + encodeURIComponent(filters.time_range);
    return url;
  }
  async function searchAitag(query, sort, page, append) {
    const q = String(query || "").trim();
    if (!q) {
      items = [];
      aitagHasMore = false;
      aitagLastQuery = null;
      selected.clear();
      setAitagStatus("先输入关键词再搜。空着点搜索不会访问站点。");
      renderAitag();
      return;
    }
    aitagLastQuery = { q, sort: sort || "new" };
    setAitagStatus(page > 1 ? "正在加载下一页…" : "正在搜索…");
    let data = null;
    try {
      data = await window.ApiClient.get(aitagSearchUrl(q, sort, page));
    } catch (error) {
      setAitagStatus("搜索失败：" + (error.message || error) + "。网络恢复后再试。");
      return;
    }
    const batch = (data && (data.items || data.works)) || [];
    items = append ? items.concat(batch) : batch;
    aitagPage = page;
    aitagHasMore = Boolean(data && data.has_more);
    if (!append) selected.clear();
    setAitagStatus(items.length
      ? ("已显示 " + items.length + " 张" + (aitagHasMore ? "，还能加载更多" : "，本词就这些") + "。点卡片选中，再点导入。")
      : ((data && data.message) || "没有结果。换个词试试。"));
    renderAitag();
  }
  async function loadAitagFavorites(page, append) {
    setAitagStatus(page > 1 ? "正在加载下一页…" : "正在读收藏…");
    let data = null;
    try {
      data = await window.ApiClient.get("/api/nai/aitag/favorites/works?page=" + page + "&page_size=24");
    } catch (error) {
      setAitagStatus("收藏读取失败：" + (error.message || error));
      return;
    }
    const batch = (data && (data.items || data.works)) || [];
    items = append ? items.concat(batch) : batch;
    aitagPage = page;
    aitagHasMore = Boolean(data && data.has_more);
    if (!append) selected.clear();
    setAitagStatus(items.length
      ? ("收藏共 " + (data.total != null ? data.total : items.length) + " 项。收藏只记位置，没有下载原图。")
      : "还没有收藏。先去搜索结果里点「收藏」。");
    renderAitag();
  }
  function switchAitagView(view) {
    aitagView = view === "favorites" ? "favorites" : "search";
    document.querySelectorAll("[data-aitag-view]").forEach((button) => {
      const on = button.getAttribute("data-aitag-view") === aitagView;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    const form = document.querySelector("[data-aitag-search]");
    const advanced = document.querySelector("[data-aitag-advanced]");
    if (form) form.hidden = aitagView !== "search";
    if (advanced) advanced.hidden = aitagView !== "search";
    items = [];
    aitagHasMore = false;
    aitagPage = 1;
    selected.clear();
    if (aitagView === "favorites") {
      void loadAitagFavorites(1, false);
    } else {
      setAitagStatus("输入关键词后点搜索。空着点搜索不会访问站点。");
      renderAitag();
    }
  }
  function favoriteSnapshot(item) {
    const image = (item.images && item.images[0]) || {};
    return {
      title: item.title || "",
      creator: item.creator || item.author || "",
      cover_url: image.remote_url || image.thumbnail_url || image.url || "",
      ai_type: item.AI_type || item.ai_type || "",
      create_date: item.create_date || "",
      image_count: item.image_count || 0,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : [],
    };
  }
  async function toggleFavorite(id) {
    const item = items.find((row) => workId(row) === id) || {};
    const result = await window.ApiClient.post(
      "/api/nai/aitag/favorites/" + encodeURIComponent(id) + "/toggle",
      favoriteSnapshot(item)
    );
    return Boolean(result && result.favorited);
  }
  async function importOne(id, extra) {
    const body = Object.assign({ work_id: id, image_index: 0, slot_index: 0 }, extra || {});
    return window.ApiClient.post("/api/nai/aitag/import", body);
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
        await importOne(id);
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
        await toggleFavorite(id);
        ok += 1;
      } catch (_) { /* keep going */ }
    }
    setAitagStatus(ok ? ("已记下 " + ok + " 项位置，没有下载原图。") : "收藏失败。");
    if (aitagView === "favorites") void loadAitagFavorites(1, false);
  }
  function closeDetail() {
    const modal = document.querySelector("[data-aitag-detail]");
    if (modal) modal.hidden = true;
    detailWorkId = "";
  }
  function renderDetail(payload) {
    const modal = document.querySelector("[data-aitag-detail]");
    const body = document.querySelector("[data-detail-body]");
    const title = document.querySelector("[data-detail-title]");
    if (!modal || !body) return;
    const work = (payload && payload.work) || {};
    const images = (payload && payload.images) || [];
    const candidates = (payload && payload.character_candidates) || [];
    const tags = Array.isArray(work.tags) ? work.tags : [];
    if (title) title.textContent = work.title || detailWorkId;
    const external = String((payload && payload.external_url) || work.external_url || "");
    body.innerHTML = `
      <div class="ex-detail-grid">
        ${images.slice(0, 6).map((image) => {
          const src = image.thumbnail_url || image.url || "";
          return src ? `<img src="${escapeText(src)}" alt="" loading="lazy" />` : "";
        }).join("")}
      </div>
      <p><b>作者</b> ${escapeText(work.creator || work.user_id || "—")} · <b>发布</b> ${escapeText(String(work.create_date || "—").slice(0, 10))} · <b>图数</b> ${Number(work.image_count || images.length || 0)}</p>
      ${tags.length ? `<div class="ex-tags">${tags.slice(0, 16).map((tag) => `<span class="ex-tag">${escapeText(tag)}</span>`).join("")}</div>` : ""}
      ${candidates.length ? `<div class="ex-step"><b>识别到 ${candidates.length} 个角色槽</b><small>导入角色会把它的咒语带进标签资产</small><div class="ex-actions">${candidates.slice(0, 6).map((cand) => `<button class="ex-btn" type="button" data-import-candidate="${escapeText(cand.candidate_id)}" data-image-index="${Number(cand.image_index || 0)}" data-slot-index="${Number(cand.slot_index || 0)}">导入 ${escapeText(cand.label || cand.candidate_id)}</button>`).join("")}</div></div>` : ""}
      <div class="ex-actions">
        <button class="ex-btn primary" type="button" data-detail-import>导入此作品</button>
        <button class="ex-btn" type="button" data-detail-fav>收藏 / 取消收藏</button>
        ${external ? `<a class="ex-btn" href="${escapeText(external)}" target="_blank" rel="noreferrer noopener">查看原站页面</a>` : ""}
      </div>
      <p class="ex-empty" data-detail-msg></p>
    `;
    body.querySelectorAll(".ex-detail-grid img").forEach((img) => {
      img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });
    });
    const msg = body.querySelector("[data-detail-msg]");
    body.querySelector("[data-detail-import]")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await importOne(detailWorkId);
        if (msg) msg.textContent = "已导入。打开「标签资产」就能用。";
      } catch (error) {
        if (msg) msg.textContent = "导入失败：" + (error.message || error);
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    body.querySelector("[data-detail-fav]")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        const on = await toggleFavorite(detailWorkId);
        if (msg) msg.textContent = on ? "已收藏（只记位置，不下载）。" : "已取消收藏。";
        if (aitagView === "favorites" && !on) void loadAitagFavorites(1, false);
      } catch (error) {
        if (msg) msg.textContent = "收藏失败：" + (error.message || error);
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    body.querySelectorAll("[data-import-candidate]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await importOne(detailWorkId, {
            candidate_id: button.getAttribute("data-import-candidate") || "",
            image_index: Number(button.getAttribute("data-image-index") || 0),
            slot_index: Number(button.getAttribute("data-slot-index") || 0),
          });
          if (msg) msg.textContent = "角色已导入标签资产。";
        } catch (error) {
          if (msg) msg.textContent = "导入角色失败：" + (error.message || error);
        } finally {
          button.disabled = false;
        }
      });
    });
  }
  async function openDetail(id) {
    const modal = document.querySelector("[data-aitag-detail]");
    const body = document.querySelector("[data-detail-body]");
    const title = document.querySelector("[data-detail-title]");
    if (!modal || !body) return;
    detailWorkId = id;
    if (title) title.textContent = "读取中…";
    body.innerHTML = '<p class="ex-empty">正在读取作品详情…</p>';
    modal.hidden = false;
    try {
      const payload = await window.ApiClient.get("/api/nai/aitag/work/" + encodeURIComponent(id));
      if (detailWorkId !== id) return;
      renderDetail(payload);
    } catch (error) {
      body.innerHTML = '<p class="ex-empty">详情读取失败：' + escapeText(error.message || error) + "</p>";
    }
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
      if (query.get("q")) form.q.value = query.get("q");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        void searchAitag(String(data.get("q") || ""), String(data.get("sort") || "new"), 1, false);
      });
    }
    document.querySelectorAll("[data-aitag-view]").forEach((button) => {
      button.addEventListener("click", () => switchAitagView(button.getAttribute("data-aitag-view")));
    });
    document.querySelector("[data-aitag-more]")?.addEventListener("click", () => {
      if (aitagView === "favorites") void loadAitagFavorites(aitagPage + 1, true);
      else if (aitagLastQuery) void searchAitag(aitagLastQuery.q, aitagLastQuery.sort, aitagPage + 1, true);
    });
    const grid = document.querySelector("[data-aitag-grid]");
    if (grid) {
      grid.addEventListener("click", (event) => {
        const detailButton = event.target.closest("[data-detail-open]");
        if (detailButton) {
          event.stopPropagation();
          void openDetail(detailButton.getAttribute("data-detail-open"));
          return;
        }
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
    document.querySelector("[data-detail-close]")?.addEventListener("click", closeDetail);
    document.querySelector("[data-aitag-detail]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeDetail();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDetail();
    });
    guardPixivStart();
    window.addEventListener("pixiv-intake-report", (event) => {
      pixivLiveEventAt = Date.now();
      renderPixivLive((event && event.detail) || {});
    });
    renderAitag();
    void refreshStates();
    void refreshPixivLive();
    setInterval(() => {
      if (document.hidden) return;
      void refreshStates();
      void refreshPixivLive();
    }, 5000);
    if (query.get("site") === "aitag" && query.get("q") && form) {
      void searchAitag(query.get("q"), "new", 1, false);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
