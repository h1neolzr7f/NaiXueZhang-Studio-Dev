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
  const SIDEBAR = [
    { id: "desk", href: "/desk", label: "工作台", icon: "▣" },
    { id: "acquire", href: "/?workspace=acquire", label: "在线发现", icon: "⌕" },
    { id: "library", href: "/", label: "我的图库", icon: "▦" },
    { id: "studio", href: "/studio", label: "生成台", icon: "✎" },
    { id: "agents", href: "/butler", label: "智能体", icon: "◎" },
    { id: "gap" },
    { id: "tools", href: "/maintenance", label: "工具箱", icon: "⚒" },
    { id: "models", href: "/settings", label: "模型管理", icon: "⚙" },
    { id: "flow", href: "/queue", label: "工作流", icon: "➟" },
    { id: "settings", href: "/settings", label: "设置", icon: "☰" },
  ];

  function agentOff() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setAgentOff(off) {
    try {
      window.localStorage.setItem(STORAGE_KEY, off ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
    document.body.classList.toggle("experience-agent-off", off);
    document.body.classList.toggle("experience-shell-on", !off);
    document.body.classList.toggle("experience-rail-on", !off);
  }

  function situationFromTask(task) {
    if (!task) return "ready";
    if (task.terminal) return String(task.status || "") === "succeeded" || task.status === "done" ? "happy" : "sorry";
    const status = String(task.status || "");
    const phase = String(task.phase || "");
    if (status === "awaiting_confirmation" || status === "waiting" || phase === "confirm" || phase === "authorization") {
      return STATE_TO_SITUATION.waiting_confirmation;
    }
    if (status === "running" || status === "processing" || phase.indexOf("generat") >= 0) {
      const kind = String(task.kind || "");
      if (kind === "studio_generate" || kind === "batch_generate" || kind === "director") {
        return STATE_TO_SITUATION.generating;
      }
      return STATE_TO_SITUATION.processing;
    }
    if (status === "queued" || status === "created") return STATE_TO_SITUATION.listening;
    return STATE_TO_SITUATION.thinking;
  }

  window.ExperienceCharacter = {
    situationFromTask,
    STATE_TO_SITUATION,
  };

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
      <a class="ex-brand" href="/desk">
        <span class="ex-brand-mark">N</span>
        <span><strong>Nai学长工作室</strong><small>本地创作台</small></span>
      </a>
      <nav class="ex-nav" data-nav></nav>
      <div class="ex-side-foot" data-side-foot>
        <b>本地运行</b>
        <span data-health-label>正在读取系统状态</span>
        <div class="ex-meter"><i data-health-meter style="width:0%"></i></div>
        <small>关闭助手后会回到经典顶栏</small>
      </div>
    </aside>
    <header class="ex-topbar">
      <form class="ex-search" data-search>
        <input name="q" type="search" placeholder="搜索作品、角色、关键词、工具或智能体..." />
        <kbd>Ctrl K</kbd>
      </form>
      <div class="ex-top-actions">
        <a class="is-primary" href="/studio">新建项目 +</a>
        <a href="/butler" title="智能体">帮助</a>
        <button type="button" data-agent-off>关闭助手</button>
        <div class="ex-profile"><span class="ex-avatar" aria-hidden="true"></span><span>本地</span></div>
      </div>
    </header>
    <aside class="ex-agent" aria-label="专业助手">
      <div class="ex-agent-head">
        <div class="ex-portrait"><span data-agent-status>在线</span></div>
        <h2 data-agent-name>图库助手</h2>
        <div class="ex-online" data-agent-online>● 在线</div>
        <p data-agent-role>本地图库、收藏、相似/重复、索引与血缘整理</p>
      </div>
      <div class="ex-agent-body" data-agent-body></div>
    </aside>
    <footer class="ex-status">
      <span data-status-note>体验层只投影真实任务，不会另起一套引擎</span>
      <b data-status-health>● 系统状态读取中</b>
    </footer>
  `;
  document.body.classList.add("experience-shell-on", "experience-rail-on");
  document.body.appendChild(root);

  const nav = root.querySelector("[data-nav]");
  const search = root.querySelector("[data-search]");
  const offBtn = root.querySelector("[data-agent-off]");

  function currentWorkspace() {
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    if (path === "/desk") return "desk";
    if (params.get("workspace") === "acquire" || params.get("online") === "1") return "acquire";
    if (path === "/studio" || path === "/remix" || path === "/queue" || path === "/generated") return "studio";
    if (path === "/maintenance" || path === "/ops" || path === "/settings") return "support";
    if (path === "/butler") return params.get("agent") === "tomori" ? "studio" : "support";
    return "library";
  }

  function activeNavId() {
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    if (path === "/desk") return "desk";
    if (params.get("workspace") === "acquire" || params.get("online") === "1") return "acquire";
    if (path === "/studio" || path === "/generated") return "studio";
    if (path === "/butler") return "agents";
    if (path === "/maintenance" || path === "/ops") return "tools";
    if (path === "/settings") return "settings";
    if (path === "/queue" || path === "/director") return "flow";
    if (path === "/remix") return "studio";
    return "library";
  }

  function specialistForWorkspace(specialists) {
    const workspace = currentWorkspace();
    if (workspace === "desk") return (specialists || [])[1] || (specialists || [])[0] || null;
    return (specialists || []).find((item) => {
      return item.persona_id === workspace || (item.persona_id === "service" && workspace === "support");
    }) || null;
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
      link.innerHTML = `<i>${item.icon}</i><span>${item.label}</span>`;
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
    root.querySelector("[data-agent-name]").textContent = (specialist && specialist.display_name) || "助手";
    root.querySelector("[data-agent-role]").textContent = (specialist && (specialist.workspace_label + " · " + specialist.role)) || specialist && specialist.role || "助手待命";
    root.querySelector("[data-agent-status]").textContent = events.length ? (active.stage_label || "工作中") : "在线";
    const body = root.querySelector("[data-agent-body]");
    const bits = [];
    bits.push(`<div class="ex-bubble">${events.length ? "当前工作流独立于聊天记录。" : "有什么我可以帮你的吗？先打开对应工作区，或直接手动操作。"}</div>`);
    const waiting = events.find((item) => item.type === "authorization.required" || item.severity === "warning");
    if (waiting) {
      bits.push(`<div class="ex-confirm"><b>需要确认</b><p>${waiting.stage_label || waiting.type}</p><a href="/butler">去管家台确认</a></div>`);
    }
    (payload.proactive || []).slice(0, 3).forEach((item) => {
      const text = item.text || item.message || item.title || "";
      if (!text) return;
      bits.push(`<div class="ex-suggest"><b>${item.level || item.kind || "建议"}</b><p>${text}</p></div>`);
    });
    if (!events.length) {
      bits.push(`<p class="ex-empty">还没有进行中的工作流。删除聊天也不会丢掉已有任务。</p>`);
    } else {
      bits.push(events.slice(-8).reverse().map((item) => {
        const severity = item.severity === "error" ? " is-error" : item.severity === "warning" ? " is-warning" : "";
        return `<div class="ex-event${severity}"><i></i><div><b>${item.stage_label || item.type}</b><small>${item.agent_id || ""} ${item.workflow_ref || ""}</small>${progressHtml(item.progress)}</div></div>`;
      }).join(""));
    }
    body.innerHTML = bits.join("");
  }

  function renderHealth(health, storage) {
    const label = root.querySelector("[data-health-label]");
    const meter = root.querySelector("[data-health-meter]");
    const status = root.querySelector("[data-status-health]");
    const note = root.querySelector("[data-status-note]");
    const used = Number((storage && (storage.used_bytes || storage.bytes_used)) || 0);
    const total = Number((storage && (storage.total_bytes || storage.disk_free_bytes)) || 0);
    const pct = total > 0 ? Math.min(100, Math.round((used / (used + total)) * 100)) : 8;
    meter.style.width = pct + "%";
    const ok = !health || health.ok !== false;
    label.textContent = ok ? "本机可用，无会员门槛" : "有检查项需要处理";
    status.textContent = ok ? "● 所有系统运行正常" : "● 需要查看维护台";
    if (storage && storage.originals != null) {
      note.textContent = `图库 ${storage.originals || 0} 张原图 · 助手只投影真实任务`;
    }
  }

  async function refresh() {
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
      let storage = null;
      try {
        const raw = await window.ApiClient.get("/api/maintenance/storage");
        storage = raw && raw.storage;
      } catch (_) {
        storage = null;
      }
      renderHealth(health && health.health, storage);
    } catch (_) {
      renderHealth({ ok: true }, null);
    }
  }

  search.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = String(new FormData(search).get("q") || "").trim();
    window.location.href = q ? `/?q=${encodeURIComponent(q)}` : "/";
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") {
      event.preventDefault();
      const input = search.querySelector("input");
      if (input) input.focus();
    }
  });
  offBtn.addEventListener("click", () => {
    setAgentOff(true);
    root.remove();
  });

  renderNav();
  void refresh();
  window.setInterval(() => {
    if (document.hidden || agentOff()) return;
    void refresh();
  }, 4000);
})();
