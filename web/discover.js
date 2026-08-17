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
    const next = ["pixiv", "aitag", "tagcloud"].indexOf(site) >= 0 ? site : "pixiv";
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
    if (next === "tagcloud") void ensureTagcloudCodexes();
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
    const tagcloudChip = document.querySelector("[data-tagcloud-state]");
    try {
      const data = await window.ApiClient.get("/api/nai/tagcloud/status");
      const ok = Boolean(data && data.ok && data.enabled !== false);
      if (tagcloudChip) {
        tagcloudChip.textContent = ok ? ("可以搜索 · " + Number(data.safe_codex_count || 0) + " 部法典") : "现在搜不到";
        tagcloudChip.classList.toggle("is-on", ok);
      }
    } catch (_) {
      if (tagcloudChip) tagcloudChip.textContent = "状态未知";
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
      const watchdog = document.querySelector("[data-pixiv-watchdog]");
      if (watchdog) {
        const completed = String(report.status || "") === "completed" && !running;
        watchdog.disabled = completed;
        if (completed) watchdog.title = "本轮已完成，守护已不必再开。再开采集会重新开始。";
      }
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
        const failures = Object.entries(report.failure_kinds || {})
          .map(([kind, count]) => kind + " × " + count)
          .slice(0, 3)
          .join(" · ");
        if (failures) bits.push("失败类型 " + failures);
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
  async function refreshWatchdog() {
    const chip = document.querySelector("[data-pixiv-watchdog]");
    if (!chip || !window.ApiClient) return;
    try {
      const data = await window.ApiClient.get("/api/crawler/watchdog");
      const on = Boolean(data && data.enabled);
      chip.textContent = "自动守护 " + (on ? "开" : "关");
      chip.classList.toggle("is-on", on);
      chip.dataset.on = on ? "1" : "0";
      chip.title = on
        ? "守护已开：采集崩溃会自动拉起。点击关闭"
        : "守护已关。点击打开：开始采集并看住进程，崩溃自动重启";
    } catch (_) {
      chip.textContent = "自动守护 状态未知";
    }
  }
  async function toggleWatchdog() {
    const chip = document.querySelector("[data-pixiv-watchdog]");
    if (!chip) return;
    const next = chip.dataset.on !== "1";
    if (next && !window.confirm("打开自动守护？\n\n会按当前任务开始采集 Pixiv，并在崩溃时自动重启。只有 NovelAI 作品会进图库。")) {
      return;
    }
    chip.disabled = true;
    try {
      await window.ApiClient.post("/api/crawler/watchdog", { enabled: next });
    } catch (error) {
      const msg = document.getElementById("pixivActionMsg");
      if (msg) msg.textContent = "切换守护失败：" + (error.message || error);
    } finally {
      chip.disabled = false;
      void refreshWatchdog();
      void refreshStates();
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
      + "&page_size=60&nai_only=true&safe_only=true";
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
      const form = document.querySelector("[data-aitag-search]");
      const q = form && form.q ? String(form.q.value || "").trim() : "";
      data = await window.ApiClient.get("/api/nai/aitag/favorites/works?page=" + page + "&page_size=24"
        + (q ? "&q=" + encodeURIComponent(q) : ""));
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
    if (form) form.hidden = false;
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
    if (!window.confirm("将导入 " + ids.length + " 项到标签资产。多角色作品不会默认导第一个槽，请到详情里选。")) return;
    const button = document.querySelector("[data-aitag-import]");
    if (button) button.disabled = true;
    let ok = 0;
    let needSlot = 0;
    const failed = [];
    for (const id of ids) {
      try {
        const payload = await window.ApiClient.get("/api/nai/aitag/work/" + encodeURIComponent(id));
        const candidates = (payload && payload.character_candidates) || [];
        if (candidates.length > 1) {
          needSlot += 1;
          continue;
        }
        const extra = candidates.length === 1 ? {
          candidate_id: candidates[0].candidate_id || "",
          image_index: Number(candidates[0].image_index || 0),
          slot_index: Number(candidates[0].slot_index || 0),
        } : {};
        await importOne(id, extra);
        ok += 1;
      } catch (error) {
        failed.push(id + "：" + (error.message || error));
      }
    }
    const bits = [];
    if (ok) bits.push("已导入 " + ok + " 项。打开「标签资产」就能用。");
    if (needSlot) bits.push(needSlot + " 项有多个角色槽，请点「详」选择后再导入。");
    if (failed.length) bits.push("失败 " + failed.length + " 项：" + failed.slice(0, 3).join("；"));
    setAitagStatus(bits.join(" ") || "这次没有导入成功。可以换几张再试。");
    if (button) button.disabled = false;
  }
  async function favoriteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) {
      setAitagStatus("先点卡片选中作品，再收藏。");
      return;
    }
    const button = document.querySelector("[data-aitag-fav]");
    if (button) button.disabled = true;
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await toggleFavorite(id);
        ok += 1;
      } catch (error) {
        failed.push(id + "：" + (error.message || error));
      }
    }
    setAitagStatus((ok ? ("已记下 " + ok + " 项位置，没有下载原图。") : "收藏失败。")
      + (failed.length ? " 失败 " + failed.length + " 项：" + failed.slice(0, 2).join("；") : ""));
    if (aitagView === "favorites") void loadAitagFavorites(1, false);
    if (button) button.disabled = false;
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
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await importOne(detailWorkId);
        if (msg) msg.textContent = "已导入。打开「标签资产」就能用。";
      } catch (error) {
        if (msg) msg.textContent = "导入失败：" + (error.message || error);
      } finally {
        button.disabled = false;
      }
    });
    body.querySelector("[data-detail-fav]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const on = await toggleFavorite(detailWorkId);
        if (msg) msg.textContent = on ? "已收藏（只记位置，不下载）。" : "已取消收藏。";
        if (aitagView === "favorites" && !on) void loadAitagFavorites(1, false);
      } catch (error) {
        if (msg) msg.textContent = "收藏失败：" + (error.message || error);
      } finally {
        button.disabled = false;
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
  /* ---------------- 法典图鉴（quicktagcloud） ---------------- */
  const tcSelected = new Set();
  let tcItems = [];
  let tcView = "search";
  let tcPage = 1;
  let tcHasMore = false;
  let tcLastQuery = null;
  let tcCodexesLoaded = false;

  function tcKey(item) {
    return String(item.codex_id || "") + ":" + String(item.id || item.entry_id || "");
  }
  function setTcStatus(text) {
    const status = document.querySelector("[data-tagcloud-status]");
    if (status) status.textContent = text;
  }
  function syncTcActions() {
    const empty = tcSelected.size === 0;
    document.querySelectorAll("[data-tagcloud-collect], [data-tagcloud-clear]").forEach((button) => {
      button.disabled = empty;
    });
    document.querySelector("[data-tagcloud-all]")?.toggleAttribute("disabled", !tcItems.length);
    const more = document.querySelector("[data-tagcloud-more]");
    if (more) more.hidden = !tcHasMore || tcView !== "search";
  }
  function renderTagcloud() {
    const host = document.querySelector("[data-tagcloud-grid]");
    const picked = document.querySelector("[data-tagcloud-picked]");
    if (picked) picked.textContent = tcSelected.size ? ("已选 " + tcSelected.size + " 条，下一步点收进提示词库") : "还没选词条，先点卡片";
    syncTcActions();
    if (!host) return;
    if (!tcItems.length) {
      host.innerHTML = '<p class="ex-empty">'
        + (tcView === "collected" ? "提示词库是空的。先在搜索结果里收几条。" : "这里会列出法典词条。点卡片选中，悬停点「看」读完整提示词。")
        + "</p>";
      return;
    }
    host.innerHTML = tcItems.map((item) => {
      const key = tcKey(item);
      const on = tcSelected.has(key) ? " is-on" : "";
      const src = item.thumb || "";
      const place = (item.path || []).join(" / ") || item.codex_title || "";
      return `<article class="ex-card${on}" data-tc-key="${escapeText(key)}" title="点击选中或取消">
        ${src ? `<img src="${escapeText(src)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}
        <span class="ex-check">✓</span>
        <span class="ex-hover"><button type="button" data-tc-open="${escapeText(key)}" title="读完整提示词">看</button></span>
        <div class="ex-meta">
          <strong>${escapeText(item.title || key)}</strong>
          <small>${escapeText(place)}</small>
        </div>
      </article>`;
    }).join("");
    host.querySelectorAll(".ex-card img").forEach((img) => {
      img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });
    });
  }
  async function ensureTagcloudCodexes() {
    if (tcCodexesLoaded || !window.ApiClient) return;
    tcCodexesLoaded = true;
    const select = document.querySelector("[data-tagcloud-codex]");
    try {
      const data = await window.ApiClient.get("/api/nai/tagcloud/codexes");
      const rows = (data && data.items) || [];
      if (select && rows.length) {
        select.innerHTML = '<option value="">全部法典</option>' + rows.map((item) =>
          `<option value="${escapeText(item.id)}">${escapeText(item.title)}（${Number(item.entry_count || 0)}）</option>`
        ).join("");
      }
    } catch (_) {
      tcCodexesLoaded = false;
    }
  }
  async function searchTagcloud(query, codex, page, append) {
    const q = String(query || "").trim();
    const codexId = String(codex || "").trim();
    if (!q && !codexId) {
      tcItems = [];
      tcHasMore = false;
      tcLastQuery = null;
      tcSelected.clear();
      setTcStatus("输入关键词或选一部法典再搜。都空着点搜索不会访问站点。");
      renderTagcloud();
      return;
    }
    tcLastQuery = { q, codex: codexId };
    setTcStatus(page > 1 ? "正在加载下一页…" : "正在搜索…");
    let data = null;
    try {
      data = await window.ApiClient.get(
        "/api/nai/tagcloud/search?q=" + encodeURIComponent(q)
        + "&codex=" + encodeURIComponent(codexId)
        + "&page=" + page + "&page_size=24"
      );
    } catch (error) {
      setTcStatus("搜索失败：" + (error.message || error) + "。网络恢复后再试。");
      return;
    }
    const batch = (data && data.items) || [];
    tcItems = append ? tcItems.concat(batch) : batch;
    tcPage = page;
    tcHasMore = Boolean(data && data.has_more);
    if (!append) tcSelected.clear();
    setTcStatus(tcItems.length
      ? ("共 " + (data.total != null ? data.total : tcItems.length) + " 条 · 已显示 " + tcItems.length + (tcHasMore ? " · 还能加载更多" : ""))
      : "没有结果。换个词或换部法典试试。");
    renderTagcloud();
  }
  async function loadTagcloudCollection() {
    setTcStatus("正在读提示词库…");
    let data = null;
    try {
      data = await window.ApiClient.get("/api/nai/tagcloud/collection");
    } catch (error) {
      setTcStatus("读取失败：" + (error.message || error));
      return;
    }
    tcItems = ((data && data.items) || []).map((item) => ({
      id: item.entry_id,
      codex_id: item.codex_id,
      codex_title: item.codex_title || "",
      title: item.title || item.entry_id,
      path: item.path || [],
      tags: item.tags || "",
      characters: item.characters || [],
      note: item.note || "",
      thumb: item.thumb || "",
      image: item.image || item.thumb || "",
      source_url: item.source_url || "",
      collected: true,
    }));
    tcHasMore = false;
    tcSelected.clear();
    setTcStatus(tcItems.length ? ("提示词库共 " + tcItems.length + " 条。只存文本和远程链接，没下载图片。") : "提示词库是空的。先在搜索结果里收几条。");
    renderTagcloud();
  }
  function switchTagcloudView(view) {
    tcView = view === "collected" ? "collected" : "search";
    document.querySelectorAll("[data-tagcloud-view]").forEach((button) => {
      const on = button.getAttribute("data-tagcloud-view") === tcView;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    const form = document.querySelector("[data-tagcloud-search]");
    if (form) form.hidden = tcView !== "search";
    tcItems = [];
    tcHasMore = false;
    tcPage = 1;
    tcSelected.clear();
    if (tcView === "collected") {
      void loadTagcloudCollection();
    } else {
      setTcStatus("输入关键词或选一部法典再搜。都空着点搜索不会访问站点。");
      renderTagcloud();
    }
  }
  function findTagcloudItem(key) {
    return tcItems.find((item) => tcKey(item) === key) || null;
  }
  function closeTagcloudDetail() {
    const modal = document.querySelector("[data-tagcloud-detail]");
    if (modal) modal.hidden = true;
  }
  function copyText(text, done) {
    const finish = (ok) => { if (typeof done === "function") done(ok); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true), () => finish(false));
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    area.remove();
    finish(ok);
  }
  function openTagcloudDetail(key) {
    const item = findTagcloudItem(key);
    const modal = document.querySelector("[data-tagcloud-detail]");
    const body = document.querySelector("[data-tc-detail-body]");
    const title = document.querySelector("[data-tc-detail-title]");
    if (!item || !modal || !body) return;
    if (title) title.textContent = item.title || key;
    const place = (item.path || []).join(" / ") || item.codex_title || "";
    body.innerHTML = `
      ${item.image ? `<img src="${escapeText(item.image)}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px" data-tc-img />` : ""}
      <p><b>法典</b> ${escapeText(item.codex_title || item.codex_id)}${place ? ` · <b>分类</b> ${escapeText(place)}` : ""}</p>
      <h4 style="margin:10px 0 4px">提示词（含 NovelAI 权重语法，原样保留）</h4>
      <pre class="ex-log" style="white-space:pre-wrap">${escapeText(item.tags || "（此词条没有提示词文本）")}</pre>
      ${(item.characters && item.characters.length) ? `<h4 style="margin:10px 0 4px">角色槽提示词（V4 多角色）</h4>${item.characters.map((c) => `<p><b>${escapeText(c.label || "角色")}</b>：${escapeText(c.prompt)}</p>`).join("")}` : ""}
      ${item.note ? `<h4 style="margin:10px 0 4px">注释</h4><p>${escapeText(item.note)}</p>` : ""}
      <div class="ex-actions">
        <button class="ex-btn primary" type="button" data-tc-send>送到生成台</button>
        <button class="ex-btn" type="button" data-tc-copy>复制提示词</button>
        <button class="ex-btn" type="button" data-tc-collect>${item.collected ? "从提示词库移除" : "收进提示词库"}</button>
        ${item.source_url ? `<a class="ex-btn" href="${escapeText(item.source_url)}" target="_blank" rel="noreferrer noopener">查看原站</a>` : ""}
      </div>
      <p class="ex-empty" data-tc-msg></p>
    `;
    const img = body.querySelector("[data-tc-img]");
    if (img) img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
    const msg = body.querySelector("[data-tc-msg]");
    body.querySelector("[data-tc-send]").addEventListener("click", () => {
      window.location.href = "/generate?prompt=" + encodeURIComponent(item.tags || "");
    });
    body.querySelector("[data-tc-copy]").addEventListener("click", () => {
      copyText(item.tags || "", (ok) => { if (msg) msg.textContent = ok ? "已复制到剪贴板。" : "复制失败，请手动选择文本复制。"; });
    });
    body.querySelector("[data-tc-collect]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await window.ApiClient.post("/api/nai/tagcloud/collection/toggle", {
          codex_id: item.codex_id,
          entry_id: item.id,
        });
        item.collected = Boolean(result && result.collected);
        button.textContent = item.collected ? "从提示词库移除" : "收进提示词库";
        if (msg) msg.textContent = (result && result.message) || "";
        if (tcView === "collected" && !item.collected) void loadTagcloudCollection();
      } catch (error) {
        if (msg) msg.textContent = "操作失败：" + (error.message || error);
      } finally {
        button.disabled = false;
      }
    });
    modal.hidden = false;
  }
  async function collectTagcloudSelected() {
    const keys = Array.from(tcSelected);
    if (!keys.length) {
      setTcStatus("先点卡片选中词条，再收进提示词库。");
      return;
    }
    const button = document.querySelector("[data-tagcloud-collect]");
    if (button) button.disabled = true;
    let ok = 0;
    const failed = [];
    for (const key of keys) {
      const item = findTagcloudItem(key);
      if (!item) continue;
      try {
        const result = await window.ApiClient.post("/api/nai/tagcloud/collection/toggle", {
          codex_id: item.codex_id,
          entry_id: item.id,
        });
        if (result && result.collected) ok += 1;
      } catch (error) {
        failed.push((item.title || key) + "：" + (error.message || error));
      }
    }
    setTcStatus((ok ? ("已收进提示词库 " + ok + " 条。点「提示词库」标签查看。") : "这次没有收藏成功。可以换几条再试。")
      + (failed.length ? " 失败 " + failed.length + " 条：" + failed.slice(0, 2).join("；") : ""));
    if (button) button.disabled = false;
  }

  function buildBookmarklet(token) {
    const base = window.location.origin;
    const code = "(function(){var OID='nxz-acquire-overlay';var old=document.getElementById(OID);if(old)old.remove();"
      + "var box=document.createElement('div');box.id=OID;box.style.cssText='position:fixed;right:18px;top:18px;z-index:2147483647;width:400px;box-shadow:0 24px 60px rgba(0,0,0,.55);border-radius:18px;overflow:hidden;background:#070a11';"
      + "var bar=document.createElement('div');bar.style.cssText='min-height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#10182a;color:#9db4cc;font:12px/1 sans-serif';"
      + "var lb=document.createElement('span');lb.textContent='Nai学长 \\u00b7 一键入库';bar.appendChild(lb);"
      + "var x=document.createElement('button');x.type='button';x.textContent='\\u00d7';x.style.cssText='border:0;background:none;color:#e6edfb;font-size:18px;cursor:pointer';x.onclick=function(){box.remove();};bar.appendChild(x);box.appendChild(bar);"
      + "var fr=document.createElement('iframe');fr.name='nxz-acquire-frame';fr.style.cssText='width:100%;height:526px;border:0;background:#070a11';box.appendChild(fr);"
      + "var hint=document.createElement('div');hint.style.cssText='padding:6px 10px;background:#10182a;color:#9db4cc;font:12px/1.5 sans-serif';"
      + "hint.textContent='正在联系本机服务…';"
      + "var mk=function(tgt){var f=document.createElement('form');f.method='POST';f.action='" + base + "/acquire/quick-import';f.target=tgt;f.style.display='none';var a=function(n,v){var i=document.createElement('input');i.type='hidden';i.name=n;i.value=v;f.appendChild(i);};a('url',location.href);a('title',document.title);a('token','" + token + "');document.body.appendChild(f);return f;};"
      + "var fb=document.createElement('button');fb.type='button';fb.textContent='没反应？在新标签页打开';fb.style.cssText='margin-left:8px;padding:3px 10px;border:0;border-radius:999px;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px';"
      + "fb.onclick=function(){var f2=mk('_blank');f2.submit();f2.remove();};hint.appendChild(fb);box.appendChild(hint);"
      + "document.body.appendChild(box);var f=mk('nxz-acquire-frame');f.submit();f.remove();"
      + "window.addEventListener('message',function onMsg(e){if(!e||!e.data)return;var b=document.getElementById(OID);if(e.data==='nxz-acquire-ready'&&hint)hint.style.display='none';if(e.data==='nxz-acquire-close'&&b)b.remove();});"
      + "})()";
    return "javascript:" + code;
  }
  async function setupBookmarklet() {
    const link = document.querySelector("[data-bookmarklet]");
    const note = document.querySelector("[data-bookmark-note]");
    if (!link) return;
    try {
      const data = await window.ApiClient.get("/api/acquire/bookmark");
      const href = buildBookmarklet(String((data && data.token) || ""));
      link.href = href;
      link.dataset.ready = "1";
      const copyBtn = document.querySelector("[data-bookmark-copy]");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          copyText(href, (ok) => {
            if (note) note.textContent = ok
              ? "书签代码已复制。手动新建一个书签，把地址粘进去即可。"
              : "复制失败。可以长按「一键入库」按钮手动复制链接。";
          });
        });
      }
      const rotateBtn = document.querySelector("[data-bookmark-rotate]");
      if (rotateBtn) {
        rotateBtn.addEventListener("click", async () => {
          if (!window.confirm("重置入库令牌？\n\n书签栏里旧的「一键入库」会立刻失效，需要重新拖一次。")) return;
          rotateBtn.disabled = true;
          try {
            const data = await window.ApiClient.post("/api/acquire/bookmark/rotate", {});
            const next = buildBookmarklet(String((data && data.token) || ""));
            link.href = next;
            link.dataset.ready = "1";
            if (note) note.textContent = "令牌已重置。请把「一键入库」重新拖进书签栏。";
          } catch (error) {
            if (note) note.textContent = "重置失败：" + (error.message || error);
          } finally {
            rotateBtn.disabled = false;
          }
        });
      }
    } catch (_) {
      if (note) note.textContent = "书签初始化失败：本机服务没读到令牌。刷新本页再试。";
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
    document.getElementById("pixivStop")?.addEventListener("click", (event) => {
      if (window.confirm("停止当前 Pixiv 采集？已入库的图会保留。")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
  async function runPixivOp(kind) {
    const msg = document.querySelector("[data-pixiv-ops-msg]");
    const confirms = {
      autopilot: "按当前已保存的 Pixiv 任务开始甩手采集，并打开守护？",
      arknights: "把任务改成明日方舟标签并开始采集？会覆盖当前搜索范围。",
      restart: "重启采集进程？进行中的一轮会中断，任务配置会保留。",
    };
    if (!window.confirm(confirms[kind] || "继续？")) return;
    if (msg) msg.textContent = "正在执行…";
    try {
      const path = kind === "autopilot"
        ? "/api/crawler/autopilot"
        : kind === "arknights"
          ? "/api/crawler/arknights/update"
          : "/api/crawler/restart";
      const body = kind === "autopilot" ? { target: "pixiv" } : (kind === "arknights" ? { restart: true } : {});
      const result = await window.ApiClient.post(path, body);
      if (msg) msg.textContent = (result && (result.message || result.ok)) ? (result.message || "已提交。进度看上方计数。") : "已提交。进度看上方计数。";
      void refreshPixivLive();
    } catch (error) {
      if (msg) msg.textContent = "失败：" + (error.message || error);
    }
  }
  function start() {
    if (!window.ApiClient) return;
    const query = new URLSearchParams(window.location.search || "");
    showSite(query.get("site"));
    document.querySelectorAll("[data-site]").forEach((button) => {
      button.addEventListener("click", () => showSite(button.getAttribute("data-site")));
    });
    const form = document.querySelector("[data-aitag-search]");
    if (form) {
      if (query.get("q")) form.q.value = query.get("q");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const q = String(data.get("q") || "");
        if (aitagView === "favorites") void loadAitagFavorites(1, false);
        else void searchAitag(q, String(data.get("sort") || "new"), 1, false);
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
    const tcForm = document.querySelector("[data-tagcloud-search]");
    if (tcForm) {
      tcForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(tcForm);
        void searchTagcloud(String(data.get("q") || ""), String(data.get("codex") || ""), 1, false);
      });
    }
    document.querySelectorAll("[data-tagcloud-view]").forEach((button) => {
      button.addEventListener("click", () => switchTagcloudView(button.getAttribute("data-tagcloud-view")));
    });
    document.querySelector("[data-tagcloud-more]")?.addEventListener("click", () => {
      if (tcView === "search" && tcLastQuery) void searchTagcloud(tcLastQuery.q, tcLastQuery.codex, tcPage + 1, true);
    });
    const tcGrid = document.querySelector("[data-tagcloud-grid]");
    if (tcGrid) {
      tcGrid.addEventListener("click", (event) => {
        const openBtn = event.target.closest("[data-tc-open]");
        if (openBtn) {
          event.stopPropagation();
          openTagcloudDetail(openBtn.getAttribute("data-tc-open"));
          return;
        }
        const card = event.target.closest("[data-tc-key]");
        if (!card) return;
        const key = card.getAttribute("data-tc-key");
        if (tcSelected.has(key)) tcSelected.delete(key);
        else tcSelected.add(key);
        renderTagcloud();
      });
    }
    document.querySelector("[data-tagcloud-clear]")?.addEventListener("click", () => {
      tcSelected.clear();
      renderTagcloud();
    });
    document.querySelector("[data-tagcloud-all]")?.addEventListener("click", () => {
      tcItems.forEach((item) => tcSelected.add(tcKey(item)));
      renderTagcloud();
    });
    document.querySelector("[data-tagcloud-collect]")?.addEventListener("click", () => { void collectTagcloudSelected(); });
    document.querySelector("[data-tc-detail-close]")?.addEventListener("click", closeTagcloudDetail);
    document.querySelector("[data-tagcloud-detail]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeTagcloudDetail();
    });
    document.querySelector("[data-detail-close]")?.addEventListener("click", closeDetail);
    document.querySelector("[data-aitag-detail]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeDetail();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDetail();
        closeTagcloudDetail();
      }
    });
    guardPixivStart();
    void setupBookmarklet();
    document.querySelector("[data-pixiv-watchdog]")?.addEventListener("click", () => { void toggleWatchdog(); });
    document.querySelector("[data-pixiv-autopilot]")?.addEventListener("click", () => { void runPixivOp("autopilot"); });
    document.querySelector("[data-pixiv-arknights]")?.addEventListener("click", () => { void runPixivOp("arknights"); });
    document.querySelector("[data-pixiv-restart]")?.addEventListener("click", () => { void runPixivOp("restart"); });
    window.addEventListener("pixiv-intake-report", (event) => {
      pixivLiveEventAt = Date.now();
      renderPixivLive((event && event.detail) || {});
    });
    renderAitag();
    void refreshStates();
    void refreshPixivLive();
    void refreshWatchdog();
    setInterval(() => {
      if (document.hidden) return;
      void refreshStates();
      void refreshPixivLive();
      void refreshWatchdog();
    }, 5000);
    if (query.get("q") && query.get("site") === "tagcloud") {
      void searchTagcloud(query.get("q"), query.get("codex") || "", 1, false);
    } else if (query.get("q") && query.get("site") !== "pixiv") {
      showSite("aitag");
      if (form) form.q.value = query.get("q");
      void searchAitag(query.get("q"), "new", 1, false);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
