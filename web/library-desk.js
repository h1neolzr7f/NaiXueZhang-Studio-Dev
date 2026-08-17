(function () {
  const PAGE_SIZE = 60;
  const state = {
    view: "all",
    page: 1,
    hasMore: false,
    items: [],
    selected: null,
    batch: new Set(),
    dupes: [],
    dupeKind: "exact",
    reviewedDupes: new Set(),
  };
  const DUPE_REVIEW_KEY = "nxzDupesReviewed";

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
  function itemId(item) {
    return String((item && (item.id != null ? item.id : item.work_id)) || "");
  }
  function galleryId() {
    const select = document.querySelector("[data-gallery]");
    const query = new URLSearchParams(window.location.search || "");
    return String((select && select.value) || query.get("gallery") || query.get("gallery_id") || "site");
  }
  function imagePrefix(gid) {
    if (gid === "codex") return "/data/gallery/codex/";
    if (gid === "qqgroup") return "/data/gallery/qqgroup/";
    return "/data/images/";
  }
  function resolvePath(path, gid) {
    const text = String(path || "").replace(/\\/g, "/");
    if (!text) return "";
    if (/^https?:\/\//i.test(text) || text.startsWith("/")) return text;
    return imagePrefix(gid) + text.replace(/^\/+/, "").replace(/^data\/images\//, "");
  }
  function thumb(item) {
    const image = (item.images && item.images[0]) || item;
    const gid = item.gallery_id || galleryId();
    const direct = item.cover_url || item.thumbnail_url || item.thumb_url || image.thumbnail_url || image.thumb_url || "";
    if (direct) return direct;
    const path = item.thumb_path || image.thumb_path || image.local_path || "";
    return resolvePath(path, gid);
  }
  function detailImageSrc(image, gid) {
    const direct = image.thumbnail_url || image.thumb_url || image.url || "";
    if (direct) return direct;
    return resolvePath(image.local_path || image.file_name || "", gid);
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
  function setStatus(text) {
    const el = document.querySelector("[data-status]");
    if (el) el.textContent = text || "";
  }
  function setPicked() {
    const picked = document.querySelector("[data-picked]");
    if (picked) {
      picked.textContent = state.batch.size
        ? "已批量选择 " + state.batch.size + " 项"
        : state.selected ? "已选择 1 项" : "未选择资产";
    }
    const batchBar = document.querySelector("[data-batch-actions]");
    if (batchBar) batchBar.hidden = state.batch.size === 0;
    const singleBar = document.querySelector("[data-single-actions]");
    if (singleBar) singleBar.hidden = state.batch.size > 0;
  }
  function loadReviewedDupes() {
    try {
      const raw = window.localStorage.getItem(DUPE_REVIEW_KEY + ":" + galleryId());
      state.reviewedDupes = new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      state.reviewedDupes = new Set();
    }
  }
  function markDupeReviewed(groupKey) {
    state.reviewedDupes.add(groupKey);
    try {
      window.localStorage.setItem(DUPE_REVIEW_KEY + ":" + galleryId(), JSON.stringify(Array.from(state.reviewedDupes)));
    } catch (_) { /* ignore */ }
    renderDupes();
  }
  async function buildIndex(noteSelector) {
    const gid = galleryId();
    const note = noteSelector ? document.querySelector(noteSelector) : null;
    if (note) note.textContent = "正在为本库建立相似索引…";
    try {
      const result = await window.ApiClient.post("/api/gallery/" + encodeURIComponent(gid) + "/index/incremental", { visual: true });
      const done = Number(result.indexed != null ? result.indexed : (result.hashed || 0));
      if (note) note.textContent = "索引已更新（" + done + " 张）。再点「找相似」或「查重复」。";
      void loadRibbon();
      return true;
    } catch (error) {
      if (note) note.textContent = "建索引失败：" + (error.message || error);
      return false;
    }
  }

  async function loadGalleries() {
    const select = document.querySelector("[data-gallery]");
    if (!select) return;
    try {
      const data = await window.ApiClient.get("/api/galleries");
      const rows = (data && data.items) || [];
      if (!rows.length) return;
      const current = galleryId();
      select.innerHTML = rows.map((item) =>
        `<option value="${escapeText(item.id)}">${escapeText(item.label_zh || item.id)}（${Number(item.total_works || 0)}）</option>`
      ).join("");
      select.value = rows.some((item) => item.id === current) ? current : "site";
    } catch (_) {
      if (!select.options.length) {
        select.innerHTML = '<option value="site">本机图库</option><option value="codex">自选库</option><option value="qqgroup">QQ 群库</option>';
      }
    }
  }
  async function loadGroups() {
    const select = document.querySelector("[data-group]");
    if (!select) return;
    const gid = galleryId();
    try {
      const data = await window.ApiClient.get("/api/galleries/" + encodeURIComponent(gid) + "/groups");
      const rows = (data && data.items) || [];
      if (!rows.length) {
        select.hidden = true;
        select.innerHTML = "";
        return;
      }
      select.innerHTML = '<option value="">全部文件夹</option>' + rows.map((item) =>
        `<option value="${escapeText(item.key)}">${escapeText(item.label || item.key)}（${Number(item.count || 0)}）</option>`
      ).join("");
      select.hidden = false;
    } catch (_) {
      select.hidden = true;
    }
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
  function renderGrid() {
    const host = document.querySelector("[data-grid]");
    const more = document.querySelector("[data-more]");
    if (!host) return;
    if (state.view === "dupes") {
      host.innerHTML = "";
      renderDupes();
      if (more) more.hidden = true;
      return;
    }
    const dupesHost = document.querySelector("[data-dupes]");
    if (dupesHost) dupesHost.hidden = true;
    if (more) more.hidden = !state.hasMore;
    if (!state.items.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = state.items.map((item) => {
      const src = thumb(item);
      const id = itemId(item);
      const on = state.selected && itemId(state.selected) === id ? " is-on" : "";
      const inBatch = state.batch.has(id) ? " is-batch" : "";
      return `<article class="ex-card${on}${inBatch}" data-id="${escapeText(id)}" data-gallery="${escapeText(item.gallery_id || galleryId())}">
        ${src ? `<img src="${escapeText(src)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}
        <span class="ex-check">✓</span>
        <span class="ex-hover"><button type="button" data-batch-toggle="${escapeText(id)}" title="加入/移出批量选择">${inBatch ? "✓" : "选"}</button></span>
        <div class="ex-meta"><strong>${escapeText(item.title || id)}</strong><small>${escapeText(item.author || item.userName || "")} · ${escapeText(shortDate(item.create_date))}</small></div>
      </article>`;
    }).join("");
  }
  function dupeGroupKey(group, index) {
    return String(group.sha256 || (group.items && group.items[0] && group.items[0].image_key) || "group-" + index);
  }
  function renderDupes() {
    const host = document.querySelector("[data-dupes]");
    if (!host) return;
    host.hidden = false;
    const rows = state.dupes;
    const head = `<div class="ex-toolbar" style="margin-top:0">
      <button class="ex-tab${state.dupeKind === "exact" ? " is-on" : ""}" type="button" data-dupe-kind="exact">完全一样</button>
      <button class="ex-tab${state.dupeKind === "near" ? " is-on" : ""}" type="button" data-dupe-kind="near">看起来很像</button>
      <button class="ex-btn" type="button" data-dupe-index>更新索引</button>
      <span class="ex-empty" data-dupe-note>重复不会自动删：挑出要留的（「留」= 收藏），其余留着不影响使用</span>
    </div>`;
    if (!rows.length) {
      host.innerHTML = head + '<p class="ex-empty">这一库没查到重复。换个库，或先点「更新索引」再查。</p>';
      return;
    }
    const pending = rows.filter((group, index) => !state.reviewedDupes.has(dupeGroupKey(group, index)));
    const reviewedCount = rows.length - pending.length;
    host.innerHTML = head + pending.map((group, index) => {
      const members = (group.items || []).map((member) => {
        const wid = String(member.work_id);
        return `<span class="ex-dupe-member">
          <button class="ex-btn" type="button" data-dupe-open="${escapeText(wid)}" title="打开详情对比">#${escapeText(wid)} p${Number(member.page_index || 0)}</button>
          <button class="ex-btn" type="button" data-dupe-keep="${escapeText(wid)}" title="收藏这张，作为要留的">留</button>
          <button class="ex-btn" type="button" data-dupe-use="${escapeText(wid)}" title="加入待生成队列">用</button>
        </span>`;
      }).join("");
      return `<div class="ex-step"><b>第 ${index + 1} 组 · ${(group.items || []).length} 张${group.kind === "near" ? " · 近似" : ""}</b><div class="ex-actions">${members}</div><div class="ex-actions"><button class="ex-btn" type="button" data-dupe-reviewed="${escapeText(dupeGroupKey(group, index))}">已看完，收起</button></div></div>`;
    }).join("") + (reviewedCount ? `<p class="ex-empty">已收起 ${reviewedCount} 组看过的。刷新或换库可重新查看。</p>` : "");
  }
  function similarHtml(rows) {
    if (!rows.length) return '<p class="ex-empty">没有找到相似作品。</p>';
    return `<div class="ex-grid ex-similar-grid">${rows.map((row) => {
      const gid = row.gallery_id || galleryId();
      const src = thumb(row);
      return `<article class="ex-card" data-similar-open="${escapeText(itemId(row))}" data-gallery="${escapeText(gid)}">
        ${src ? `<img src="${escapeText(src)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}
        <div class="ex-meta"><strong>${escapeText(row.title || itemId(row))}</strong><small>距离 ${Number(row.distance || 0)}</small></div>
      </article>`;
    }).join("")}</div>`;
  }
  async function loadSimilarInto(host, workId, gid) {
    host.innerHTML = '<p class="ex-empty">正在本机索引里找相似…</p>';
    try {
      const data = await window.ApiClient.get(
        "/api/gallery/" + encodeURIComponent(gid) + "/similar?work_id=" + encodeURIComponent(workId) + "&limit=12"
      );
      const rows = (data && data.items) || [];
      if (!rows.length && data && data.reason === "hash_missing") {
        host.innerHTML = '<p class="ex-empty">这张图还没进相似索引。</p><div class="ex-actions"><button class="ex-btn" type="button" data-build-index>建立索引</button><span class="ex-empty" data-index-note></span></div>';
        const btn = host.querySelector("[data-build-index]");
        if (btn) btn.addEventListener("click", async () => {
          btn.disabled = true;
          const ok = await buildIndex("[data-index-note]");
          btn.disabled = false;
          if (ok) void loadSimilarInto(host, workId, gid);
        });
        return;
      }
      if (!rows.length) {
        host.innerHTML = '<p class="ex-empty">没有找到相似作品。索引越全，结果越多。</p>';
        return;
      }
      const hydrated = [];
      for (const row of rows.slice(0, 12)) {
        try {
          const lite = await window.ApiClient.get("/api/work/" + encodeURIComponent(String(row.work_id)) + "/lite?gallery_id=" + encodeURIComponent(gid));
          const work = (lite && (lite.work || lite)) || {};
          hydrated.push(Object.assign({ gallery_id: gid, distance: row.distance }, work, { id: work.id != null ? work.id : row.work_id }));
        } catch (_) {
          hydrated.push({ id: row.work_id, gallery_id: gid, distance: row.distance, title: "作品 " + row.work_id });
        }
      }
      host.innerHTML = similarHtml(hydrated);
    } catch (error) {
      host.innerHTML = '<p class="ex-empty">相似查询失败：' + escapeText(error.message || error) + "</p>";
    }
  }
  async function renderDetail(item) {
    const host = document.querySelector("[data-detail]");
    state.selected = item || null;
    setPicked();
    if (!host) return;
    if (!item) {
      host.innerHTML = `<h3>资产详情</h3><p class="ex-empty">点选一张作品查看来源与谱系。</p>`;
      return;
    }
    const gid = item.gallery_id || galleryId();
    const id = itemId(item);
    host.innerHTML = '<p class="ex-empty">正在读取详情…</p>';
    let detail = null;
    try {
      detail = await window.ApiClient.get("/api/work/" + encodeURIComponent(id) + "?gallery_id=" + encodeURIComponent(gid));
    } catch (error) {
      host.innerHTML = `<h3>${escapeText(item.title || id)}</h3><p class="ex-empty">详情读取失败：${escapeText(error.message || error)}</p>`;
      return;
    }
    const work = (detail && detail.work) || {};
    const images = (detail && detail.images) || [];
    const src = thumb(item) || (images.length ? detailImageSrc(images[0], gid) : "");
    const tags = itemTags(work).length ? itemTags(work) : itemTags(item);
    const studio = window.WorkBridge
      ? window.WorkBridge.buildUrl("/studio", id, 0, gid)
      : ("/studio?from=" + encodeURIComponent(id) + "&gallery=" + encodeURIComponent(gid));
    const remix = "/remix?from=" + encodeURIComponent(id) + "&gallery=" + encodeURIComponent(gid);
    const promptText = String(work.prompt || work.comment || item.prompt || "").trim();
    host.innerHTML = `
      <h3>${escapeText(work.title || item.title || id)}</h3>
      ${src ? `<img src="${escapeText(src)}" alt="" style="width:100%;border-radius:12px;margin:8px 0" />` : ""}
      <p><b>编号</b> ${escapeText(id)} · <b>作者</b> ${escapeText(work.author || work.userName || item.author || "—")}</p>
      <p><b>来源</b> ${escapeText(work.source || item.source || gid)} · <b>发布</b> ${escapeText(shortDate(work.create_date || item.create_date))} · <b>图数</b> ${Number(work.image_count || images.length || 0)}</p>
      ${images.length > 1 ? `<div class="ex-detail-grid">${images.slice(0, 6).map((image) => {
        const isrc = detailImageSrc(image, gid);
        return isrc ? `<img src="${escapeText(isrc)}" alt="" loading="lazy" />` : "";
      }).join("")}</div>` : ""}
      ${tags.length ? `<div class="ex-tags" data-detail-tags>${tags.slice(0, 14).map((tag) => `<button class="ex-tag" type="button" data-tag="${escapeText(tag)}">${escapeText(tag)}</button>`).join("")}</div>` : ""}
      ${promptText ? `<details class="ex-advanced"><summary>查看咒语</summary><pre class="ex-log">${escapeText(promptText.slice(0, 2000))}</pre></details>` : ""}
      <div class="ex-step"><b>资产谱系</b><div class="ex-flow-mini"><span>发现</span><span>入库</span><span>生成引用</span></div></div>
      <div class="ex-actions">
        <button class="ex-btn" type="button" data-detail-fav>…</button>
        <button class="ex-btn" type="button" data-detail-queue>…</button>
        <button class="ex-btn" type="button" data-detail-similar>找相似</button>
      </div>
      <div class="ex-actions">
        <a class="ex-btn primary" data-use-selected href="${escapeText(studio)}">用此图生成</a>
        <a class="ex-btn" href="${escapeText(remix)}">换角色</a>
      </div>
      <div data-similar-host></div>
    `;
    const favBtn = host.querySelector("[data-detail-fav]");
    const queueBtn = host.querySelector("[data-detail-queue]");
    async function syncToggles() {
      try {
        const fav = await window.ApiClient.get("/api/favorites/" + encodeURIComponent(id) + "?gallery_id=" + encodeURIComponent(gid));
        if (favBtn) favBtn.textContent = fav && fav.favorited ? "取消收藏" : "收藏";
      } catch (_) { if (favBtn) favBtn.textContent = "收藏"; }
      try {
        const queued = await window.ApiClient.get("/api/queue/" + encodeURIComponent(id) + "?gallery_id=" + encodeURIComponent(gid));
        if (queueBtn) queueBtn.textContent = queued && queued.queued ? "移出待生成" : "加入待生成";
      } catch (_) { if (queueBtn) queueBtn.textContent = "加入待生成"; }
    }
    void syncToggles();
    if (favBtn) favBtn.addEventListener("click", async () => {
      favBtn.disabled = true;
      try {
        await window.ApiClient.post("/api/favorites/" + encodeURIComponent(id) + "/toggle?gallery_id=" + encodeURIComponent(gid), {});
        await syncToggles();
        void loadRibbon();
      } finally { favBtn.disabled = false; }
    });
    if (queueBtn) queueBtn.addEventListener("click", async () => {
      queueBtn.disabled = true;
      try {
        await window.ApiClient.post("/api/queue/" + encodeURIComponent(id) + "/toggle?gallery_id=" + encodeURIComponent(gid), {});
        await syncToggles();
        void loadRibbon();
      } finally { queueBtn.disabled = false; }
    });
    const similarHost = host.querySelector("[data-similar-host]");
    const similarBtn = host.querySelector("[data-detail-similar]");
    if (similarBtn && similarHost) similarBtn.addEventListener("click", () => {
      similarBtn.disabled = true;
      loadSimilarInto(similarHost, id, gid).finally(() => { similarBtn.disabled = false; });
    });
  }
  async function batchApply(kind) {
    const ids = Array.from(state.batch);
    if (!ids.length) return;
    const gid = galleryId();
    setStatus(kind === "fav" ? "正在批量收藏…" : "正在批量加入待生成…");
    let ok = 0;
    for (const id of ids) {
      try {
        const path = kind === "fav" ? "/api/favorites/" : "/api/queue/";
        await window.ApiClient.post(path + encodeURIComponent(id) + "?gallery_id=" + encodeURIComponent(gid), {});
        ok += 1;
      } catch (_) { /* keep going */ }
    }
    setStatus((kind === "fav" ? "已收藏 " : "已加入待生成 ") + ok + " 项。");
    state.batch.clear();
    setPicked();
    renderGrid();
    void loadRibbon();
  }
  function selectedHref(kindName) {
    if (!state.selected) return kindName === "remix" ? "/remix" : "/studio";
    const gid = state.selected.gallery_id || galleryId();
    const id = itemId(state.selected);
    if (kindName === "remix") return "/remix?from=" + encodeURIComponent(id) + "&gallery=" + encodeURIComponent(gid);
    return window.WorkBridge
      ? window.WorkBridge.buildUrl("/studio", id, 0, gid)
      : ("/studio?from=" + encodeURIComponent(id) + "&gallery=" + encodeURIComponent(gid));
  }
  async function loadRibbon(total) {
    const set = (sel, value) => { const el = document.querySelector(sel); if (el) el.textContent = value; };
    if (total != null) set("[data-stat-total]", String(total));
    const gid = galleryId();
    try {
      const favs = await window.ApiClient.get("/api/favorites");
      const count = ((favs && favs.refs) || []).filter((item) => item.gallery_id === gid).length;
      set("[data-stat-favs]", String(count));
    } catch (_) { /* keep */ }
    try {
      const queue = await window.ApiClient.get("/api/queue");
      const count = ((queue && queue.refs) || []).filter((item) => item.gallery_id === gid).length;
      set("[data-stat-queue]", String(count));
    } catch (_) { /* keep */ }
    try {
      const index = await window.ApiClient.get("/api/gallery/" + encodeURIComponent(gid) + "/index/status");
      const indexed = Number(index.indexed || 0);
      const works = Number(index.works || 0);
      set("[data-stat-index]", works ? (indexed >= works ? "已就绪" : indexed + "/" + works) : "空库");
    } catch (_) { set("[data-stat-index]", "未知"); }
    try {
      const raw = await window.ApiClient.get("/api/maintenance/storage");
      const storage = (raw && raw.storage) || {};
      set("[data-stat-size]", humanBytes(storage.asset_bytes));
      set("[data-stat-free]", humanBytes(storage.disk_free_bytes));
    } catch (_) { /* keep placeholders */ }
  }
  function searchParams(page) {
    const form = document.querySelector(".ex-page [data-search]");
    const data = new FormData(form);
    return {
      q: String(data.get("q") || "").trim(),
      sort: String(data.get("sort") || "new"),
      group: String(data.get("group") || ""),
      gid: galleryId(),
      page,
    };
  }
  async function search(page, append) {
    const params = searchParams(page);
    let url;
    if (state.view === "favorites") {
      url = "/api/favorites/works?q=" + encodeURIComponent(params.q) + "&page=" + page + "&page_size=" + PAGE_SIZE + "&gallery_id=" + encodeURIComponent(params.gid);
    } else if (state.view === "queue") {
      url = "/api/queue/works?q=" + encodeURIComponent(params.q) + "&page=" + page + "&page_size=" + PAGE_SIZE + "&gallery_id=" + encodeURIComponent(params.gid);
    } else {
      url = "/api/ai_works_search?q=" + encodeURIComponent(params.q)
        + "&sort=" + encodeURIComponent(params.sort)
        + "&page=" + page + "&page_size=" + PAGE_SIZE
        + "&gallery_id=" + encodeURIComponent(params.gid)
        + (params.group ? "&group=" + encodeURIComponent(params.group) : "");
    }
    if (!append) setStatus("正在搜索…");
    let data = null;
    try {
      data = await window.ApiClient.get(url);
    } catch (error) {
      setStatus("搜索失败：" + (error.message || error));
      return;
    }
    const batch = (data && data.items) || [];
    state.items = append ? state.items.concat(batch) : batch;
    state.page = page;
    const total = data && data.total != null ? Number(data.total) : null;
    state.hasMore = total != null ? state.items.length < total : batch.length >= PAGE_SIZE;
    if (!state.items.length) {
      setStatus(state.view === "all"
        ? "无搜索结果。换个词，或先去在线发现入库。"
        : state.view === "favorites" ? "这一库还没有收藏。" : "这一库还没有待生成作品。");
    } else {
      setStatus(total != null
        ? ("共 " + total + " 项 · 已显示 " + state.items.length + (state.hasMore ? " · 还能加载更多" : ""))
        : ("已显示 " + state.items.length + " 项"));
    }
    renderGrid();
    renderTags(state.items);
    void loadRibbon(total);
  }
  async function loadDupes() {
    setStatus("正在查重复…");
    const gid = galleryId();
    let data = null;
    try {
      data = await window.ApiClient.get("/api/gallery/" + encodeURIComponent(gid) + "/duplicates?kind=" + encodeURIComponent(state.dupeKind));
    } catch (error) {
      setStatus("查重复失败：" + (error.message || error) + "。先建索引再试。");
      return;
    }
    state.dupes = (data && data.groups) || [];
    setStatus(state.dupes.length ? ("查到 " + state.dupes.length + " 组重复" + (data.truncated ? "（已截断）" : "")) : "");
    renderGrid();
    void loadRibbon();
  }
  function switchView(view) {
    state.view = ["all", "favorites", "queue", "dupes"].indexOf(view) >= 0 ? view : "all";
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-on", button.getAttribute("data-view") === state.view);
    });
    const sortSelect = document.querySelector("[data-search] select[name='sort']");
    const groupSelect = document.querySelector("[data-group]");
    if (sortSelect) sortSelect.disabled = state.view !== "all";
    if (groupSelect) groupSelect.disabled = state.view !== "all";
    state.page = 1;
    state.items = [];
    state.dupes = [];
    if (state.view === "dupes") void loadDupes();
    else void search(1, false);
  }
  function start() {
    if (!window.ApiClient) return;
    const query = new URLSearchParams(window.location.search || "");
    const form = document.querySelector(".ex-page [data-search]");
    const groupSelect = document.querySelector("[data-group]");
    if (query.get("q")) form.q.value = query.get("q");
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.getAttribute("data-view")));
    });
    document.querySelectorAll("[data-view-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        switchView(link.getAttribute("data-view-link"));
      });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.view === "dupes") switchView("all");
      else void search(1, false);
    });
    const gallery = document.querySelector("[data-gallery]");
    if (gallery) gallery.addEventListener("change", () => {
      state.selected = null;
      state.batch.clear();
      setPicked();
      loadReviewedDupes();
      renderDetail(null);
      void loadGroups().then(() => switchView(state.view));
    });
    if (groupSelect) groupSelect.addEventListener("change", () => {
      if (state.view === "all") void search(1, false);
    });
    document.querySelector("[data-more]").addEventListener("click", () => {
      if (state.hasMore && state.view !== "dupes") void search(state.page + 1, true);
    });
    document.querySelector("[data-grid]").addEventListener("click", (event) => {
      const batchBtn = event.target.closest("[data-batch-toggle]");
      if (batchBtn) {
        event.stopPropagation();
        const id = batchBtn.getAttribute("data-batch-toggle");
        if (state.batch.has(id)) state.batch.delete(id);
        else state.batch.add(id);
        setPicked();
        renderGrid();
        return;
      }
      const card = event.target.closest("[data-id]");
      if (!card) return;
      const item = state.items.find((row) => itemId(row) === card.getAttribute("data-id"));
      if (!item) return;
      void renderDetail(item);
      renderGrid();
    });
    document.querySelector("[data-dupes]").addEventListener("click", async (event) => {
      const kindBtn = event.target.closest("[data-dupe-kind]");
      if (kindBtn) {
        state.dupeKind = kindBtn.getAttribute("data-dupe-kind") === "near" ? "near" : "exact";
        void loadDupes();
        return;
      }
      if (event.target.closest("[data-dupe-index]")) {
        await buildIndex("[data-dupe-note]");
        void loadDupes();
        return;
      }
      const reviewedBtn = event.target.closest("[data-dupe-reviewed]");
      if (reviewedBtn) {
        markDupeReviewed(reviewedBtn.getAttribute("data-dupe-reviewed"));
        return;
      }
      const keepBtn = event.target.closest("[data-dupe-keep]");
      if (keepBtn) {
        keepBtn.disabled = true;
        try {
          await window.ApiClient.post("/api/favorites/" + encodeURIComponent(keepBtn.getAttribute("data-dupe-keep")) + "?gallery_id=" + encodeURIComponent(galleryId()), {});
          keepBtn.textContent = "已留";
          void loadRibbon();
        } catch (_) { keepBtn.textContent = "失败"; }
        return;
      }
      const useBtn = event.target.closest("[data-dupe-use]");
      if (useBtn) {
        useBtn.disabled = true;
        try {
          await window.ApiClient.post("/api/queue/" + encodeURIComponent(useBtn.getAttribute("data-dupe-use")) + "?gallery_id=" + encodeURIComponent(galleryId()), {});
          useBtn.textContent = "已入队";
          void loadRibbon();
        } catch (_) { useBtn.textContent = "失败"; }
        return;
      }
      const openBtn = event.target.closest("[data-dupe-open]");
      if (openBtn) {
        void renderDetail({ id: openBtn.getAttribute("data-dupe-open"), gallery_id: galleryId(), title: "作品 " + openBtn.getAttribute("data-dupe-open") });
      }
    });
    document.querySelector("[data-detail]").addEventListener("click", (event) => {
      const tag = event.target.closest("[data-tag]");
      if (tag) {
        form.q.value = tag.getAttribute("data-tag") || "";
        switchView("all");
        return;
      }
      const similar = event.target.closest("[data-similar-open]");
      if (similar) {
        const gid = similar.getAttribute("data-gallery") || galleryId();
        void renderDetail({ id: similar.getAttribute("data-similar-open"), gallery_id: gid, title: "作品 " + similar.getAttribute("data-similar-open") });
      }
    });
    document.querySelector("[data-tags]").addEventListener("click", (event) => {
      const tag = event.target.closest("[data-tag]");
      if (!tag) return;
      form.q.value = tag.getAttribute("data-tag") || "";
      switchView("all");
    });
    document.querySelector("[data-fav-toggle]").addEventListener("click", async () => {
      if (!state.selected) { setStatus("先点选一张作品，再收藏。"); return; }
      const gid = state.selected.gallery_id || galleryId();
      await window.ApiClient.post("/api/favorites/" + encodeURIComponent(itemId(state.selected)) + "/toggle?gallery_id=" + encodeURIComponent(gid), {});
      void renderDetail(state.selected);
      void loadRibbon();
    });
    document.querySelector("[data-queue-toggle]").addEventListener("click", async () => {
      if (!state.selected) { setStatus("先点选一张作品，再加入待生成。"); return; }
      const gid = state.selected.gallery_id || galleryId();
      await window.ApiClient.post("/api/queue/" + encodeURIComponent(itemId(state.selected)) + "/toggle?gallery_id=" + encodeURIComponent(gid), {});
      void renderDetail(state.selected);
      void loadRibbon();
    });
    document.querySelector("[data-batch-fav]").addEventListener("click", () => { void batchApply("fav"); });
    document.querySelector("[data-batch-queue]").addEventListener("click", () => { void batchApply("queue"); });
    document.querySelector("[data-batch-clear]").addEventListener("click", () => {
      state.batch.clear();
      setPicked();
      renderGrid();
    });
    document.querySelector("[data-use]").addEventListener("click", (event) => {
      event.preventDefault();
      if (!state.selected) {
        setStatus("先点选一张作品，再生成。");
        return;
      }
      if (window.WorkBridge) window.WorkBridge.save({ workId: itemId(state.selected), galleryId: state.selected.gallery_id || galleryId(), from: "library" });
      window.location.href = selectedHref("studio");
    });
    document.querySelector("[data-remix]").addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = selectedHref("remix");
    });
    loadReviewedDupes();
    void loadGalleries().then(() => {
      const query2 = new URLSearchParams(window.location.search || "");
      const wanted = query2.get("gallery") || query2.get("gallery_id");
      const select = document.querySelector("[data-gallery]");
      if (wanted && select && Array.from(select.options).some((opt) => opt.value === wanted)) select.value = wanted;
      return loadGroups();
    }).then(() => switchView("all"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
