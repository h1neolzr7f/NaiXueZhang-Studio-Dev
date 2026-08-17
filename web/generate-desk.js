(function () {
  const DRAFT_KEY = "nxzGenerateDraft";
  const STUDIO_DRAFT_KEY = "aitag.studio.draft.v1";

  function escapeText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function params() {
    return new URLSearchParams(window.location.search || "");
  }
  function readDraft() {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  function writeDraft(draft) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft || {})); } catch (_) { /* ignore */ }
  }
  function collectDraft() {
    const query = params();
    const size = document.querySelector("[data-size]");
    const picked = String((size && size.value) || "832x1216").split("x");
    const batch = document.querySelector("[data-batch]");
    return {
      prompt: String((document.querySelector("[data-prompt]") || {}).value || ""),
      uc: String((document.querySelector("[data-uc]") || {}).value || ""),
      steps: String((document.querySelector("[data-steps]") || {}).value || "28"),
      scale: String((document.querySelector("[data-cfg]") || {}).value || "5"),
      seed: String((document.querySelector("[data-seed]") || {}).value || ""),
      sampler: String((document.querySelector("[data-sampler]") || {}).value || "k_euler_ancestral"),
      width: picked[0] || "832",
      height: picked[1] || "1216",
      batch: String((batch && batch.value) || "1"),
      from: String(query.get("from") || readDraft().from || ""),
      gallery: String(query.get("gallery") || query.get("gallery_id") || readDraft().gallery || "site"),
    };
  }
  // Hand off through the real Studio draft store: /studio restores
  // localStorage["aitag.studio.draft.v1"] on boot when no work import is given.
  function writeStudioDraft(item) {
    const payload = {
      draftId: "",
      workId: 0,
      pageIndex: 0,
      sourceKind: "",
      source: { provider: "" },
      texts: {
        prompt: String(item.prompt || "").trim(),
        base_caption: "",
        uc: String(item.uc || "").trim(),
        char_captions: [],
      },
      params: {
        width: item.width,
        height: item.height,
        steps: item.steps,
        scale: item.scale,
        seed: item.seed && item.seed !== "-1" ? item.seed : "",
        sampler: item.sampler,
        batch: item.batch || "1",
      },
      refs: { vibe: "", char: "", strength: "0.6" },
      comment: null,
      pages: [],
      ts: Date.now(),
    };
    try {
      window.localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }
  function clearWorkBridge() {
    try {
      window.sessionStorage.removeItem((window.WorkBridge && window.WorkBridge.KEY) || "aitag.workBridge");
    } catch (_) { /* ignore */ }
  }
  function buildStudioHandoff(draft) {
    const item = draft || collectDraft();
    if (item.from) {
      const studio = new URL("/studio", window.location.origin);
      studio.searchParams.set("from", item.from);
      studio.searchParams.set("gallery", item.gallery || "site");
      return studio.pathname + studio.search;
    }
    writeStudioDraft(item);
    // /studio boot order is URL from > WorkBridge > local draft; a stale
    // bridge from earlier gallery clicks would shadow this fresh draft.
    clearWorkBridge();
    return "/studio";
  }
  function applyDraft(draft) {
    const item = draft || {};
    const prompt = document.querySelector("[data-prompt]");
    const uc = document.querySelector("[data-uc]");
    const steps = document.querySelector("[data-steps]");
    const cfg = document.querySelector("[data-cfg]");
    const seed = document.querySelector("[data-seed]");
    const sampler = document.querySelector("[data-sampler]");
    const size = document.querySelector("[data-size]");
    if (prompt && item.prompt) prompt.value = item.prompt;
    if (uc && item.uc) uc.value = item.uc;
    if (steps && item.steps) steps.value = item.steps;
    if (cfg && item.scale) cfg.value = item.scale;
    if (seed && item.seed) seed.value = item.seed;
    if (sampler && item.sampler) sampler.value = item.sampler;
    if (size && item.width && item.height) size.value = item.width + "x" + item.height;
    bindCounts();
  }
  async function fillSourceCard() {
    const source = document.querySelector("[data-source]");
    if (!source) return;
    const query = params();
    const from = String(query.get("from") || readDraft().from || "");
    if (!from) {
      source.textContent = "文生图 · 需要参考图时从图库点「用此图生成」";
      return;
    }
    const gid = String(query.get("gallery") || query.get("gallery_id") || readDraft().gallery || "site");
    let text = "将导入来源作品 #" + from + " 的咒语与参数；到工作台后可继续编辑";
    try {
      const lite = await window.ApiClient.get("/api/work/" + encodeURIComponent(from) + "/lite?gallery_id=" + encodeURIComponent(gid));
      const title = String((lite && lite.title) || "作品 " + from);
      text = "将导入来源作品 #" + from + "（" + title + "）的咒语与参数；到工作台后可继续编辑";
    } catch (_) { /* keep generic text */ }
    source.textContent = text + " ";
    const clear = document.createElement("a");
    clear.href = "/generate";
    clear.textContent = "清除来源";
    clear.style.color = "var(--ex-cyan, #5ce1ff)";
    clear.addEventListener("click", (event) => {
      event.preventDefault();
      const draft = readDraft();
      delete draft.from;
      writeDraft(draft);
      clearWorkBridge();
      window.location.href = "/generate";
    });
    source.appendChild(clear);
  }
  function draftComment() {
    const item = collectDraft();
    const prompt = String(item.prompt || "").trim();
    return {
      prompt,
      uc: String(item.uc || "").trim(),
      v4_prompt: { caption: { base_caption: prompt, char_captions: [] } },
      width: Number(item.width) || 832,
      height: Number(item.height) || 1216,
      steps: Number(item.steps) || 28,
      scale: Number(item.scale) || 5,
      sampler: item.sampler || "k_euler_ancestral",
      seed: null,
    };
  }
  function applyTexts(texts) {
    if (!texts) return;
    const prompt = document.querySelector("[data-prompt]");
    const uc = document.querySelector("[data-uc]");
    if (prompt && (texts.prompt || texts.base_caption)) prompt.value = texts.prompt || texts.base_caption;
    if (uc && texts.uc != null) uc.value = texts.uc;
    bindCounts();
  }
  let aiKeyReady = null;
  async function gatePromptTools() {
    const optimize = document.querySelector("[data-optimize]");
    try {
      const status = await window.ApiClient.get("/api/settings/status");
      aiKeyReady = Boolean(status && status.ai && status.ai.has_api_key);
    } catch (_) {
      aiKeyReady = null;
      return;
    }
    if (optimize && aiKeyReady === false) {
      optimize.textContent = "智能优化（需管家模型 Key）";
      optimize.title = "先在「设置」里保存管家模型 Key，再用智能优化";
    }
  }
  async function runPromptTool(kind) {
    const status = document.querySelector("[data-gen-status]");
    if (kind === "optimize" && aiKeyReady === false) {
      if (status) status.textContent = "还没配管家模型 Key。去「设置 → 助手服务」保存后再用智能优化；「清洗风险词」是本机规则，可直接用。";
      return;
    }
    const prompt = String((document.querySelector("[data-prompt]") || {}).value || "").trim();
    if (!prompt) {
      if (status) status.textContent = "先写点正向提示词，再" + (kind === "optimize" ? "优化。" : "清洗。");
      return;
    }
    if (status) status.textContent = kind === "optimize" ? "正在智能优化（不生成图）…" : "正在清洗风险词…";
    try {
      const path = kind === "optimize" ? "/api/studio/optimize" : "/api/studio/sanitize";
      const body = kind === "optimize" ? { comment: draftComment(), mode: "smart" } : { comment: draftComment() };
      const result = await window.ApiClient.post(path, body);
      applyTexts(result && result.texts);
      if (status) {
        const removed = result && Array.isArray(result.removed) ? result.removed.length : 0;
        status.textContent = kind === "sanitize" && removed
          ? ("已清洗 " + removed + " 处风险词。")
          : ((result && result.message) || "完成。咒语已回填，可继续编辑。");
      }
    } catch (error) {
      if (status) status.textContent = "处理失败：" + (error.message || error);
    }
  }
  function renderTimeline(payload) {
    const host = document.querySelector("[data-timeline]");
    if (!host) return;
    const events = (payload && payload.events) || [];
    if (!events.length) {
      host.innerHTML = `<div class="ex-event"><i></i><div><b>理解请求</b><small>提示词会带到完整工作台</small></div></div>
        <div class="ex-event"><i></i><div><b>检查权限</b><small>付费出图要确认，此页不扣费</small></div></div>
        <div class="ex-event"><i></i><div><b>提交真实队列</b><small>在完整工作台 Ctrl+Enter</small></div></div>`;
      return;
    }
    host.innerHTML = events.slice(-10).reverse().map((item) => {
      const severity = item.severity === "error" ? " is-error" : item.severity === "warning" ? " is-warning" : "";
      const progress = item.progress || {};
      const bar = progress.current != null && progress.total
        ? `<div class="ex-progress"><span style="width:${Math.max(0, Math.min(100, Math.round((Number(progress.current) / Number(progress.total)) * 100)))}%"></span></div>`
        : "";
      return `<div class="ex-event${severity}"><i></i><div><b>${escapeText(item.stage_label || item.type)}</b><small>${escapeText(item.agent_id || "")}</small>${bar}</div></div>`;
    }).join("");
  }
  function renderJob(job) {
    const host = document.querySelector("[data-job]");
    if (!host) return;
    if (!job || !job.status || job.status === "idle") {
      host.innerHTML = '<p class="ex-empty">当前没有生成任务。提交后这里会显示真实进度。</p>';
      return;
    }
    const done = Number(job.done != null ? job.done : (job.progress && job.progress.done) || 0);
    const total = Number(job.total != null ? job.total : (job.progress && job.progress.total) || 0);
    const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    const label = {
      running: "生成中",
      queued: "排队中",
      done: "已完成",
      error: "失败",
      cancelled: "已取消",
      unknown: "状态不确定",
    }[String(job.status)] || String(job.status);
    const warn = job.billing_uncertain ? '<p class="ex-empty">计费结果不确定，请打开生成库核对后再重试。</p>' : "";
    host.innerHTML = `<div class="ex-step">
      <b>${escapeText(label)}${total ? " · " + done + "/" + total : ""}</b>
      <div class="ex-progress"><span style="width:${pct}%"></span></div>
      <small>${escapeText(String(job.message || job.current_phase || ""))}</small>
      ${warn}
      <a class="ex-btn" href="/generated">打开生成库</a>
    </div>`;
  }
  async function refreshJob() {
    try {
      const data = await window.ApiClient.get("/api/nai/jobs");
      renderJob((data && data.job) || null);
    } catch (_) { /* keep last */ }
  }
  function renderStudioQueue(items) {
    const host = document.querySelector("[data-studio-queue]");
    const status = document.querySelector("[data-queue-status]");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = "";
      if (status) status.textContent = "待生成队列是空的。在图库详情里点「加入待生成」。";
      return;
    }
    if (status) status.textContent = "待生成 " + items.length + " 项 · 点卡片带进完整工作台";
    host.innerHTML = items.map((item) => {
      const thumb = item.thumb || "";
      const wid = String(item.work_id || "");
      return `<article class="ex-card" data-queue-open="${escapeText(wid)}" title="带进完整工作台">
        ${thumb ? `<img src="${escapeText(thumb)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}
        <div class="ex-meta"><strong>${escapeText(item.title || ("作品 " + wid))}</strong></div>
      </article>`;
    }).join("");
  }
  async function loadStudioQueue() {
    const status = document.querySelector("[data-queue-status]");
    try {
      const data = await window.ApiClient.get("/api/studio/queue?limit=12");
      const items = (data && data.items) || [];
      renderStudioQueue(items);
      if (!items.length && status) {
        try {
          const all = await window.ApiClient.get("/api/queue");
          const elsewhere = ((all && all.refs) || []).filter((ref) => ref.gallery_id !== "site").length;
          if (elsewhere) {
            status.textContent = "本机图库的待生成是空的；另有 " + elsewhere + " 项在自选库/QQ 群库，去「我的图库」切到对应库查看。";
          }
        } catch (_) { /* keep default empty text */ }
      }
    } catch (_) {
      if (status) status.textContent = "待生成队列暂时读不到。";
    }
  }
  function renderResults(groups) {
    const host = document.querySelector("[data-results]");
    if (!host) return;
    const rows = groups || [];
    if (!rows.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = rows.slice(0, 24).map((item) => {
      const thumb = item.cover_url || item.cover_thumb || item.source_thumb || "";
      const gid = item.group_id || item.id || "";
      const href = gid ? ("/generated?g=" + encodeURIComponent(gid)) : "/generated";
      const when = String(item.latest_at || "").replace("T", " ").slice(5, 16);
      const count = Number(item.count || 0);
      return `<a class="ex-card" href="${escapeText(href)}">${thumb ? `<img src="${escapeText(thumb)}" alt="" loading="lazy" />` : `<div class="ex-ph"></div>`}<div class="ex-meta"><strong>${escapeText(item.source_title || gid || "生成结果")}</strong><small>${count ? count + " 张" : ""}${when ? " · " + escapeText(when) : ""}</small></div></a>`;
    }).join("");
  }
  async function loadResults() {
    const status = document.querySelector("[data-result-status]");
    try {
      const data = await window.ApiClient.get("/api/generated");
      const groups = (data && data.groups) || [];
      renderResults(groups);
      if (status) {
        const batch = data && data.batch;
        const batchBits = batch && batch.status && batch.status !== "idle"
          ? (" · 当前批量 " + String(batch.status) + " " + Number(batch.done || 0) + "/" + Number(batch.total || 0))
          : "";
        status.textContent = groups.length
          ? ("最近 " + groups.length + " 组真实结果" + batchBits + " · 更多在生成库")
          : "还没有生成结果。提交后会出现在这里和生成库。";
      }
    } catch (_) {
      renderResults([]);
      if (status) status.textContent = "生成结果暂时读不到，可打开生成库查看。";
    }
  }
  function showConfirm(decided, href) {
    const host = document.querySelector("[data-confirm-card]");
    if (!host) return;
    const butler = "/butler?agent=tomori&return=" + encodeURIComponent(href);
    host.innerHTML = `<div class="ex-confirm">
      <b>需要确认非免费生成</b>
      <p>${escapeText(decided.reason || decided.decision || "付费出图要先确认")}</p>
      <p>咒语和参数已经带上。此页不会扣费，真正提交仍在完整工作台。</p>
      <div class="ex-actions">
        <button class="ex-btn" type="button" data-cancel-confirm>取消</button>
        <a class="ex-btn" href="${escapeText(butler)}">去管家台确认</a>
        <a class="ex-btn primary" href="${escapeText(href)}">打开完整工作台</a>
      </div>
    </div>`;
    const cancel = host.querySelector("[data-cancel-confirm]");
    if (cancel) cancel.addEventListener("click", () => { host.innerHTML = ""; });
  }
  async function startGenerate() {
    const status = document.querySelector("[data-gen-status]");
    const draft = collectDraft();
    if (!draft.from && !String(draft.prompt || "").trim()) {
      if (status) status.textContent = "先写正向提示词，或从图库点「用此图生成」带来源。";
      return;
    }
    writeDraft(draft);
    const href = buildStudioHandoff(draft);
    if (window.WorkBridge && draft.from) {
      window.WorkBridge.save({ workId: draft.from, galleryId: draft.gallery, from: "generate" });
    }
    if (status) status.textContent = "正在检查生成权限…";
    let decided = { decision: "CONFIRM", reason: "付费出图需要确认" };
    try {
      decided = await window.ApiClient.post("/api/capability/decide", {
        persona_id: "studio",
        capability_id: "nai.generate_paid",
      });
    } catch (_) { /* still open the real workbench */ }
    if (decided.decision === "ALLOW") {
      if (status) status.textContent = "权限已通过，正在打开完整工作台…";
      window.location.href = href;
      return;
    }
    if (status) status.textContent = "咒语已保存。打开完整工作台提交真实队列，或先去管家台确认。不会自动扣费。";
    showConfirm(decided, href);
  }
  function bindCounts() {
    const prompt = document.querySelector("[data-prompt]");
    const uc = document.querySelector("[data-uc]");
    const promptCount = document.querySelector("[data-prompt-count]");
    const ucCount = document.querySelector("[data-uc-count]");
    const steps = document.querySelector("[data-steps]");
    const cfg = document.querySelector("[data-cfg]");
    const update = () => {
      if (promptCount) promptCount.textContent = String((prompt && prompt.value) || "").length + "/1000";
      if (ucCount) ucCount.textContent = String((uc && uc.value) || "").length + "/1000";
      const stepsVal = document.querySelector("[data-steps-val]");
      const cfgVal = document.querySelector("[data-cfg-val]");
      if (stepsVal && steps) stepsVal.textContent = steps.value;
      if (cfgVal && cfg) cfgVal.textContent = cfg.value;
    };
    if (prompt) prompt.addEventListener("input", update);
    if (uc) uc.addEventListener("input", update);
    if (steps) steps.addEventListener("input", update);
    if (cfg) cfg.addEventListener("input", update);
    update();
  }
  async function loadStudioOptions() {
    const sampler = document.querySelector("[data-sampler]");
    const size = document.querySelector("[data-size]");
    try {
      const cfg = await window.ApiClient.get("/api/studio/config");
      const samplers = (cfg && cfg.samplers) || ["k_euler_ancestral"];
      if (sampler) {
        const current = sampler.value || "k_euler_ancestral";
        sampler.innerHTML = samplers.map((name) => `<option value="${escapeText(name)}">${escapeText(name)}</option>`).join("");
        sampler.value = samplers.indexOf(current) >= 0 ? current : samplers[0];
      }
      const presets = (cfg && cfg.size_presets) || [{ width: 832, height: 1216, label: "832 x 1216" }];
      if (size) {
        size.innerHTML = presets.map((item) => {
          const value = String(item.width || 832) + "x" + String(item.height || 1216);
          return `<option value="${escapeText(value)}">${escapeText(item.label || value)}</option>`;
        }).join("");
      }
      const defaults = (cfg && cfg.defaults) || {};
      if (defaults.steps && document.querySelector("[data-steps]")) document.querySelector("[data-steps]").value = defaults.steps;
      if (defaults.scale != null && document.querySelector("[data-cfg]")) document.querySelector("[data-cfg]").value = defaults.scale;
    } catch (_) {
      if (sampler && !sampler.options.length) {
        sampler.innerHTML = '<option value="k_euler_ancestral">k_euler_ancestral</option>';
      }
    }
  }
  function start() {
    if (!window.ApiClient) return;
    const query = params();
    const draft = Object.assign({}, readDraft(), {
      from: query.get("from") || readDraft().from || "",
      gallery: query.get("gallery") || query.get("gallery_id") || readDraft().gallery || "site",
      prompt: query.get("prompt") || readDraft().prompt || "",
    });
    bindCounts();
    void loadStudioOptions().then(() => applyDraft(draft));
    void gatePromptTools();
    void fillSourceCard();
    document.querySelector("[data-start]").addEventListener("click", () => { void startGenerate(); });
    document.querySelector("[data-optimize]").addEventListener("click", () => { void runPromptTool("optimize"); });
    document.querySelector("[data-sanitize]").addEventListener("click", () => { void runPromptTool("sanitize"); });
    document.querySelector("[data-clear]").addEventListener("click", () => {
      document.querySelector("[data-prompt]").value = "";
      document.querySelector("[data-uc]").value = "";
      writeDraft(collectDraft());
      bindCounts();
    });
    document.querySelector("[data-random]").addEventListener("click", () => {
      document.querySelector("[data-prompt]").value = "1girl, neon lights, rainy night, looking at viewer";
      bindCounts();
    });
    document.querySelector("[data-studio-queue]").addEventListener("click", (event) => {
      const card = event.target.closest("[data-queue-open]");
      if (!card) return;
      const wid = card.getAttribute("data-queue-open");
      if (window.WorkBridge) window.WorkBridge.save({ workId: wid, galleryId: "site", from: "generate" });
      window.location.href = "/studio?from=" + encodeURIComponent(wid) + "&gallery=site";
    });
    window.addEventListener("experience-snapshot", (event) => renderTimeline(event.detail || {}));
    window.ApiClient.get("/api/experience/snapshot").then(renderTimeline).catch(() => renderTimeline({}));
    void loadResults();
    void loadStudioQueue();
    void refreshJob();
    setInterval(() => {
      if (document.hidden) return;
      void refreshJob();
      void loadResults();
    }, 4000);
  }
  window.buildStudioHandoff = buildStudioHandoff;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
