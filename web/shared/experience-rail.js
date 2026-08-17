(function () {
  const STORAGE_KEY = "nxzExperienceAgentOff";
  const STATE_TO_SITUATION = {
    idle: "ready",
    listening: "ready",
    thinking: "thinking",
    searching: "working",
    organizing: "working",
    generating: "generate",
    processing: "working",
    waiting_confirmation: "ready",
    warning: "sorry",
    error: "sorry",
    success: "happy",
  };
  const ICONS = {
    desk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
    acquire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg>',
    studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3l8 8-10 10H3v-8z"/></svg>',
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 7l3 3-8 8H6v-3z"/><path d="M16 5a3 3 0 0 1 3 3"/></svg>',
    models: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h10M14 8l3-3M14 8l3 3M20 16H10M10 16l-3-3M10 16l-3 3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.2 6.2l1.4 1.4M18.4 16.4l1.4 1.4M3 12h2M19 12h2M4.2 17.8l1.4-1.4M18.4 7.6l1.4-1.4"/></svg>',
  };
  const SIDEBAR = [
    { id: "desk", href: "/desk", label: "工作台" },
    { id: "acquire", href: "/discover", label: "在线发现" },
    { id: "library", href: "/library", label: "我的图库" },
    { id: "studio", href: "/generate", label: "生成台" },
    { id: "agents", href: "/butler", label: "智能体" },
    { id: "gap" },
    { id: "tools", href: "/tools", label: "工具箱" },
    { id: "models", href: "/models", label: "模型管理" },
    { id: "flow", href: "/flow", label: "工作流" },
    { id: "settings", href: "/settings", label: "设置" },
  ];
  const PORTRAITS = {
    acquire: "/assets/experience-portraits/acquire.png",
    library: "/assets/experience-portraits/library.png",
    studio: "/assets/experience-portraits/studio.png",
    service: "/assets/experience-portraits/support.png",
    support: "/assets/experience-portraits/support.png",
  };

  function agentOff() {
    try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch (_) { return false; }
  }
  function setAgentOff(off) {
    try { window.localStorage.setItem(STORAGE_KEY, off ? "1" : "0"); } catch (_) { /* ignore */ }
    document.body.classList.toggle("experience-agent-off", off);
    document.body.classList.toggle("experience-shell-on", !off);
    document.body.classList.toggle("experience-rail-on", !off);
  }
  function situationFromTask(task) {
    if (!task) return "ready";
    if (task.terminal) return String(task.status || "") === "succeeded" || task.status === "done" ? "happy" : "sorry";
    const status = String(task.status || "");
    const phase = String(task.phase || "");
    if (status === "awaiting_confirmation" || status === "waiting" || phase === "confirm" || phase === "authorization") return STATE_TO_SITUATION.waiting_confirmation;
    if (status === "running" || status === "processing" || phase.indexOf("generat") >= 0) {
      return String(task.kind || "").indexOf("generat") >= 0 || task.kind === "director" ? STATE_TO_SITUATION.generating : STATE_TO_SITUATION.processing;
    }
    if (status === "queued" || status === "created") return STATE_TO_SITUATION.listening;
    return STATE_TO_SITUATION.thinking;
  }
  window.ExperienceCharacter = { situationFromTask, STATE_TO_SITUATION, PORTRAITS };

  if (agentOff()) {
    document.body.classList.add("experience-agent-off");
    document.body.classList.remove("experience-shell-on", "experience-rail-on");
    return;
  }
  if (!window.ApiClient || typeof window.ApiClient.get !== "function") return;
  if (document.getElementById("experienceShell") || document.getElementById("experienceRail")) return;

  const root = document.createElement("div");
  root.id = "experienceShell";
  root.setAttribute("aria-label", "助手工作台");
  root.innerHTML = `
    <aside class="ex-sidebar">
      <a class="ex-brand pywebview-drag-region" href="/desk">
        <span class="ex-brand-mark">N</span>
        <span><strong>Nai学长工作室</strong><small>本地创作台</small></span>
      </a>
      <nav class="ex-nav" data-nav></nav>
      <div class="ex-side-card">
        <b>今日创作时长</b>
        <span data-session>本次会话计时中</span>
        <div class="ex-meter"><i data-session-meter style="width:18%"></i></div>
        <small>本地记录，不上传</small>
      </div>
      <div class="ex-pro-card">
        <b>Pro 会员</b>
        <span>本地完整版 · 无需到期</span>
        <a class="ex-upgrade" href="/settings">打开设置</a>
      </div>
      <button type="button" class="ex-agent-off" data-agent-off>关闭助手</button>
    </aside>
    <header class="ex-topbar">
      <form class="ex-search" data-search>
        <span aria-hidden="true">⌕</span>
        <input name="q" type="search" placeholder="搜索作品、角色、关键词、工具或智能体..." />
        <kbd>Ctrl K</kbd>
      </form>
      <div class="ex-top-actions">
        <a class="is-primary" href="/generate">新建项目 +</a>
        <a class="ex-icon-btn" href="/ops" title="通知">🔔</a>
        <a class="ex-icon-btn" href="/butler" title="帮助">?</a>
        <div class="ex-win" data-window-controls>
          <button type="button" class="min" data-win="minimize" aria-label="最小化"></button>
          <button type="button" class="max" data-win="maximize" aria-label="最大化"></button>
          <button type="button" class="cls" data-win="close" aria-label="关闭"></button>
        </div>
        <div class="ex-profile">
          <img class="ex-avatar-img" src="/assets/experience-portraits/avatar.png" alt="" />
          <span>Nai学长 <i class="ex-pro">Pro</i></span>
        </div>
      </div>
    </header>
    <aside class="ex-mascot-rail" aria-hidden="true">
      <div class="ex-mascot-bubble">有什么我可以帮你的吗？ — Nai学长助手</div>
      <img src="/assets/experience-portraits/mascot.png" alt="" />
    </aside>
    <aside class="ex-agent" aria-label="专业助手">
      <div class="ex-agent-head">
        <div class="ex-portrait"><img data-agent-photo alt="" src="/assets/experience-portraits/library.png" /><span data-agent-status>在线</span></div>
        <a class="ex-switch" href="/butler">切换智能体 →</a>
        <h2 data-agent-name>图库助手</h2>
        <div class="ex-online">● 在线</div>
        <p data-agent-role>本地图库、收藏、相似/重复、索引与血缘整理</p>
      </div>
      <div class="ex-agent-body" data-agent-body></div>
    </aside>
    <footer class="ex-status">
      <span data-status-note>公告 v2.1.0：体验层只投影真实任务，不会另起一套引擎</span>
      <b data-status-health>● 所有系统运行正常</b>
    </footer>
  `;
  const pathNow = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  if (pathNow === "/butler") document.body.classList.add("experience-compact");
  document.body.classList.add("experience-shell-on", "experience-rail-on");
  document.body.appendChild(root);
  const returnTo = new URLSearchParams(window.location.search || "").get("return") || "";
  if (returnTo.indexOf("/") === 0 && returnTo.indexOf("//") !== 0) {
    const actions = root.querySelector(".ex-top-actions");
    if (actions) {
      const back = document.createElement("a");
      back.className = "is-primary";
      back.href = returnTo;
      back.textContent = "返回工作台";
      actions.insertBefore(back, actions.firstChild);
    }
  }

  const nav = root.querySelector("[data-nav]");
  const search = root.querySelector("[data-search]");
  const started = Date.now();

  function currentWorkspace() {
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    if (path === "/desk") return "desk";
    if (path === "/discover" || path === "/progress" || path === "/pixiv" || params.get("workspace") === "acquire" || params.get("online") === "1") return "acquire";
    if (path === "/generate" || path === "/studio" || path === "/remix" || path === "/queue" || path === "/generated" || path === "/pipeline" || path === "/director" || path === "/flow") return "studio";
    if (path === "/maintenance" || path === "/ops" || path === "/settings" || path === "/tools" || path === "/models" || path === "/compliance") return "support";
    if (path === "/butler") return params.get("agent") === "tomori" ? "studio" : "support";
    return "library";
  }
  function activeNavId() {
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    if (path === "/desk") return "desk";
    if (path === "/discover" || path === "/progress" || path === "/pixiv" || params.get("workspace") === "acquire") return "acquire";
    if (path === "/generate" || path === "/studio" || path === "/generated" || path === "/remix" || path === "/pipeline") return "studio";
    if (path === "/butler") return "agents";
    if (path === "/tools" || path === "/maintenance" || path === "/ops" || path === "/compliance") return "tools";
    if (path === "/models") return "models";
    if (path === "/settings") return "settings";
    if (path === "/flow" || path === "/queue" || path === "/director") return "flow";
    if (path === "/library" || path === "/" || path === "/favorites" || path === "/codex" || path === "/references" || path === "/tag-assets" || path === "/nai-tags") return "library";
    return "library";
  }
  function specialistForWorkspace(specialists) {
    const workspace = currentWorkspace();
    if (workspace === "desk") return (specialists || [])[1] || (specialists || [])[0] || null;
    return (specialists || []).find((item) => item.persona_id === workspace || (item.persona_id === "service" && workspace === "support")) || null;
  }
  function renderNav() {
    nav.replaceChildren();
    SIDEBAR.forEach((item) => {
      if (item.id === "gap") {
        const gap = document.createElement("div");
        gap.className = "ex-nav-gap";
        nav.appendChild(gap);
        return;
      }
      const link = document.createElement("a");
      link.href = item.href;
      link.dataset.navId = item.id;
      link.innerHTML = (ICONS[item.id] || "") + "<span>" + item.label + "</span>";
      if (item.id === activeNavId()) {
        link.className = "is-active";
        link.setAttribute("aria-current", "page");
      }
      nav.appendChild(link);
    });
  }
  function progressHtml(progress) {
    const current = progress && progress.current;
    const total = progress && progress.total;
    if (current == null || !total) return "";
    const pct = Math.max(0, Math.min(100, Math.round((Number(current) / Number(total)) * 100)));
    const basis = progress.basis === "estimate" ? "估计" : progress.basis === "exact" ? "实际" : "";
    return `<div class="ex-progress" title="${basis}"><span style="width:${pct}%"></span></div>`;
  }
  function renderAgent(payload) {
    const specialist = specialistForWorkspace(payload.specialists || []);
    const events = payload.events || [];
    const active = payload.active_stage || {};
    const persona = specialist && specialist.persona_id;
    const workspace = currentWorkspace();
    root.querySelector("[data-agent-name]").textContent = (specialist && specialist.display_name) || "助手";
    root.querySelector("[data-agent-role]").textContent = (specialist && ((specialist.workspace_label || "") + " · " + (specialist.role || ""))) || "助手待命";
    root.querySelector("[data-agent-status]").textContent = events.length ? (active.stage_label || "工作中") : "在线";
    const photo = root.querySelector("[data-agent-photo]");
    if (photo) photo.src = PORTRAITS[persona] || PORTRAITS.library;
    const body = root.querySelector("[data-agent-body]");
    const bits = [];
    bits.push(`<div class="ex-bubble">${workspace === "acquire" ? "采集只对两个站：Pixiv 开爬虫，AITag 搜到再入库。不是跟我对话。" : (events.length ? "当前工作流独立于聊天记录。" : "有什么我可以帮你的吗？ — Nai学长助手")}</div>`);
    const waiting = events.find((item) => item.type === "authorization.required");
    if (waiting) {
      bits.push(`<div class="ex-confirm"><b>需要确认非免费生成</b><p>${waiting.stage_label || waiting.type}</p><p>这里不会伪造积分，也不会直接扣费。</p><a href="/butler">去管家台确认</a></div>`);
    }
    if (workspace === "acquire") {
      const found = events.filter((item) => String(item.type || "").indexOf("search") >= 0 || String(item.stage_label || "").indexOf("发现") >= 0).length;
      const stored = events.filter((item) => String(item.type || "").indexOf("library") >= 0 || String(item.stage_label || "").indexOf("入库") >= 0).length;
      bits.push(`<div class="ex-step"><b>怎么采集</b>
        <div class="ex-stepper">
          <div class="row is-on"><i></i><div><b>先选站点</b><small>Pixiv 或 AITag，点中间大卡</small></div></div>
          <div class="row ${found ? "is-on" : ""}"><i></i><div><b>Pixiv 填标签开爬</b><small>可先试跑，再开始采集</small></div></div>
          <div class="row ${stored ? "is-on" : ""}"><i></i><div><b>AITag 搜了再勾选</b><small>${stored ? "已入库 " + stored + " 项" : "导入到标签资产"}</small></div></div>
          <div class="row"><i></i><div><b>去图库看</b><small>采集结果在「我的图库」</small></div></div>
        </div>
        <div class="ex-flow-mini"><span>选站</span><span>Pixiv 爬虫</span><span>AITag 搜索</span><span>入库 ${stored || 0}</span></div>
      </div>
      <div class="ex-tip">我不会替你对话采集。完整日志在「爬虫」页，和这里是同一套进程。</div>
      <div class="ex-step"><b>本地图库空间</b><div class="ex-meter"><i data-storage-meter style="width:8%"></i></div><small data-storage-label>读取本机占用中</small><a class="ex-btn" href="/library">管理图库</a></div>`);
    }
    if (workspace === "library") {
      bits.push(`<div class="ex-suggest"><b>智能检索</b><p>用顶栏 Ctrl+K 或左侧标签过滤本机资产。</p></div>
        <div class="ex-suggest"><b>相似 / 重复</b><p>点选作品后，右侧详情会给出谱系和下一步。</p></div>`);
    }
    (payload.proactive || []).slice(0, 3).forEach((item) => {
      const text = item.text || item.message || item.title || "";
      if (text) bits.push(`<div class="ex-suggest"><b>${item.level || "建议"}</b><p>${text}</p></div>`);
    });
    if (events.length) {
      bits.push(events.slice(-6).reverse().map((item) => {
        const severity = item.severity === "error" ? " is-error" : item.severity === "warning" ? " is-warning" : "";
        return `<div class="ex-event${severity}"><i></i><div><b>${item.stage_label || item.type}</b><small>${item.agent_id || ""} ${item.workflow_ref || ""}</small>${progressHtml(item.progress)}</div></div>`;
      }).join(""));
    }
    body.innerHTML = bits.join("");
  }
  function guardPortraitImages() {
    root.querySelectorAll("img").forEach((img) => {
      const swap = () => {
        const label = (root.querySelector("[data-agent-name]") || {}).textContent || "N";
        const fallback = document.createElement("span");
        fallback.className = "ex-portrait-fallback";
        fallback.textContent = (img.classList.contains("ex-avatar-img") ? "N" : label).trim().slice(0, 1) || "N";
        img.replaceWith(fallback);
      };
      if (img.complete && img.naturalWidth === 0 && img.src) {
        swap();
        return;
      }
      img.addEventListener("error", swap, { once: true });
    });
  }
  function renderSession() {
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    const label = root.querySelector("[data-session]");
    const meter = root.querySelector("[data-session-meter]");
    if (label) label.textContent = String(hours).padStart(2, "0") + " 小时 " + String(remain).padStart(2, "0") + " 分钟 / 10 小时";
    if (meter) meter.style.width = Math.min(100, (mins / 600) * 100) + "%";
  }
  async function refresh() {
    renderSession();
    try {
      const payload = await window.ApiClient.get("/api/experience/snapshot");
      renderNav();
      renderAgent(payload || {});
      window.dispatchEvent(new CustomEvent("experience-snapshot", { detail: payload || {} }));
    } catch (error) {
      root.querySelector("[data-agent-body]").innerHTML = `<p class="ex-empty">状态暂时读不到，页面功能仍可手动使用。</p>`;
    }
    try {
      const health = await window.ApiClient.get("/api/product/health");
      const ok = !health || !health.health || health.health.ok !== false;
      root.querySelector("[data-status-health]").textContent = ok ? "● 所有系统运行正常" : "● 需要查看维护台";
    } catch (_) { /* keep default */ }
    try {
      const raw = await window.ApiClient.get("/api/maintenance/storage");
      const storage = (raw && raw.storage) || {};
      const used = Number(storage.asset_bytes || 0);
      const total = Number(storage.disk_total_bytes || 0);
      const pct = total ? Math.min(100, Math.round((used / total) * 1000) / 10) : 0;
      const meter = root.querySelector("[data-storage-meter]");
      const label = root.querySelector("[data-storage-label]");
      if (meter) meter.style.width = Math.max(4, pct) + "%";
      if (label) label.textContent = (used ? (used / (1024 * 1024 * 1024)).toFixed(2) + " GB" : "0 B") + " 本机占用 · " + pct + "%";
    } catch (_) { /* keep default */ }
  }

  search.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = String(new FormData(search).get("q") || "").trim();
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/discover") {
      const box = document.querySelector(".ex-page [data-search] input[name='q']");
      if (box) {
        box.value = q;
        const form = box.closest("form");
        if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        return;
      }
      window.location.href = q ? `/discover?q=${encodeURIComponent(q)}` : "/discover";
      return;
    }
    if (path === "/generate" || path === "/studio") {
      const prompt = document.querySelector("[data-prompt], #prompt, textarea[name='prompt']");
      if (prompt && q) {
        prompt.value = q;
        prompt.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    if (path === "/" || path === "/codex" || path === "/favorites") {
      const box = document.querySelector("#q, input[name='q'], input[type='search']");
      if (box && box !== search.querySelector("input")) {
        box.value = q;
        const form = box.closest("form");
        if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return;
      }
    }
    window.location.href = q ? `/library?q=${encodeURIComponent(q)}` : "/library";
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") {
      event.preventDefault();
      const input = search.querySelector("input");
      if (input) input.focus();
    }
  });
  function desktopApi() {
    return window.pywebview && window.pywebview.api ? window.pywebview.api : null;
  }
  function bindWindowControls() {
    const box = root.querySelector("[data-window-controls]");
    if (!box || box.dataset.bound === "1") return;
    box.dataset.bound = "1";
    box.addEventListener("click", (event) => {
      const button = event.target.closest("[data-win]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const api = desktopApi();
      if (!api) return;
      const action = button.getAttribute("data-win");
      if (action === "minimize" && api.minimize) void api.minimize();
      if (action === "maximize" && api.toggle_maximize) void api.toggle_maximize();
      if (action === "close" && api.close) void api.close();
    });
  }
  function markDesktopShell() {
    if (!desktopApi() && !document.documentElement.classList.contains("experience-desktop")) return;
    document.body.classList.add("experience-desktop");
    bindWindowControls();
  }
  window.addEventListener("pywebviewready", markDesktopShell);
  markDesktopShell();
  root.querySelector("[data-agent-off]").addEventListener("click", () => {
    setAgentOff(true);
    root.remove();
  });
  function enhanceClassicSurfaces() {
    if (document.querySelector(".ex-page")) return;
    document.body.classList.add("experience-classic");
    const cards = document.querySelectorAll(".gallery-grid .card, .work-card, .online-discover-card");
    cards.forEach((card) => card.classList.add("ex-legacy-card"));
    document.querySelectorAll("button, .atlas-button, .studio-btn, .settings-button").forEach((el) => {
      if (el.classList.contains("primary") || el.classList.contains("blue") || el.classList.contains("atlas-button")) {
        el.classList.add("ex-legacy-action");
      }
    });
  }
  renderNav();
  guardPortraitImages();
  enhanceClassicSurfaces();
  void refresh();
  window.setInterval(() => {
    if (document.hidden || agentOff()) return;
    void refresh();
  }, 4000);
})();
