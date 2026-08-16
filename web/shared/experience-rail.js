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
    return;
  }
  if (!window.ApiClient || typeof window.ApiClient.get !== "function") return;
  if (document.getElementById("experienceRail")) return;

  const root = document.createElement("aside");
  root.id = "experienceRail";
  root.className = "experience-rail";
  root.setAttribute("aria-label", "助手工作状态");
  root.innerHTML = `
    <div class="experience-rail-card">
      <div class="experience-rail-head">
        <div class="experience-rail-stage">
          <strong data-stage>空闲</strong>
          <span data-detail>助手待命，工作台可直接手动操作</span>
        </div>
        <div class="experience-rail-actions">
          <button type="button" data-toggle-timeline aria-expanded="false">时间线</button>
          <button type="button" data-agent-off>关闭助手</button>
        </div>
      </div>
      <nav class="experience-rail-desks" aria-label="专业助手工作区"></nav>
      <div class="experience-rail-timeline" data-timeline hidden></div>
    </div>
  `;
  document.body.classList.add("experience-rail-on");
  document.body.appendChild(root);

  const desks = root.querySelector(".experience-rail-desks");
  const stage = root.querySelector("[data-stage]");
  const detail = root.querySelector("[data-detail]");
  const timeline = root.querySelector("[data-timeline]");
  const toggle = root.querySelector("[data-toggle-timeline]");
  const offBtn = root.querySelector("[data-agent-off]");

  function currentWorkspace() {
    const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("workspace") === "acquire" || params.get("online") === "1") return "acquire";
    if (path === "/studio" || path === "/remix" || path === "/queue" || path === "/generated") return "studio";
    if (path === "/maintenance" || path === "/ops" || path === "/settings") return "support";
    if (path === "/butler") return params.get("agent") === "tomori" ? "studio" : "support";
    return "library";
  }

  function renderDesks(specialists) {
    desks.replaceChildren();
    (specialists || []).forEach((item) => {
      const link = document.createElement("a");
      link.className = "experience-desk" + (item.persona_id === currentWorkspace() || (item.persona_id === "service" && currentWorkspace() === "support") ? " is-active" : "");
      link.href = item.workspace_href || "/";
      link.textContent = item.short_name || item.display_name;
      link.title = item.role || "";
      desks.appendChild(link);
    });
  }

  function progressHtml(progress) {
    const current = progress && progress.current;
    const total = progress && progress.total;
    if (current == null || !total) return "";
    const pct = Math.max(0, Math.min(100, Math.round((Number(current) / Number(total)) * 100)));
    const basis = progress.basis === "estimate" ? "估计" : progress.basis === "exact" ? "实际" : "";
    return `<div class="experience-progress" title="${basis}"><span style="width:${pct}%"></span></div>`;
  }

  function renderSnapshot(payload) {
    const active = payload.active_stage || {};
    const progress = active.progress || {};
    root.querySelector(".experience-rail-card").classList.toggle("is-idle", !(payload.events || []).length);
    stage.textContent = active.stage_label || "空闲";
    const bits = [];
    if (active.agent_id) bits.push(active.agent_id);
    if (progress.current != null && progress.total) bits.push(`${progress.current}/${progress.total}`);
    if (progress.basis === "estimate") bits.push("估计进度");
    if ((payload.events || []).length) bits.push("任务独立于聊天");
    detail.textContent = bits.join(" · ") || "助手待命，可直接操作图库或工作台";
    renderDesks(payload.specialists || []);
    const events = payload.events || [];
    if (!events.length) {
      timeline.innerHTML = `<p class="experience-empty">还没有进行中的工作流。删除聊天也不会丢掉已有任务。</p>`;
      return;
    }
    timeline.innerHTML = events
      .slice(-8)
      .reverse()
      .map((item) => {
        const severity = item.severity === "error" ? " is-error" : item.severity === "warning" ? " is-warning" : "";
        const prog = progressHtml(item.progress);
        return `<div class="experience-event${severity}"><i></i><div><b>${item.stage_label || item.type}</b><small>${item.agent_id || ""} ${item.workflow_ref || ""}</small>${prog}</div></div>`;
      })
      .join("");
  }

  async function refresh() {
    try {
      const payload = await window.ApiClient.get("/api/experience/snapshot");
      renderSnapshot(payload || {});
    } catch (error) {
      timeline.innerHTML = `<p class="experience-error">状态暂时读不到，页面功能仍可手动使用。</p>`;
    }
  }

  toggle.addEventListener("click", () => {
    const open = timeline.hasAttribute("hidden");
    timeline.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  offBtn.addEventListener("click", () => {
    setAgentOff(true);
    root.remove();
  });

  void refresh();
  window.setInterval(() => {
    if (document.hidden || agentOff()) return;
    void refresh();
  }, 4000);
})();
