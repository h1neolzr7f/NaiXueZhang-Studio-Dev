(function () {
  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }

  function escapeText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  let lastCardKey = "";
  function renderCards(specialists, events) {
    const host = document.querySelector("[data-agent-cards]");
    if (!host) return;
    const busy = String((events[events.length - 1] || {}).agent_id || "");
    const key = (specialists || []).map((item) => item.persona_id).join(",") + "|" + busy;
    if (key === lastCardKey) return;
    lastCardKey = key;
    host.innerHTML = (specialists || []).map((item) => {
      const tone = item.persona_id || "library";
      const photoTone = tone === "service" ? "support" : tone;
      const running = busy && (busy === item.persona_id || (item.persona_id === "service" && busy === "sakiko"));
      return `<a class="ex-agent-card${running ? " is-busy" : ""}" data-tone="${escapeText(tone)}" href="${escapeText(item.workspace_href || "/")}">
        <em>${running ? "运行中" : "在线"}</em>
        <img class="ex-card-photo" src="/assets/experience-portraits/${escapeText(photoTone)}.png" alt="" loading="lazy" />
        <div class="ex-card-body">
          <strong>${escapeText(item.display_name)}</strong>
          <small>${escapeText(item.role)}</small>
          <span class="ex-card-go">进入 →</span>
        </div>
      </a>`;
    }).join("");
    host.querySelectorAll("img.ex-card-photo").forEach((img) => {
      img.addEventListener("error", () => { img.remove(); }, { once: true });
    });
  }

  function renderTasks(events) {
    const host = document.querySelector("[data-tasks]");
    if (!host) return;
    if (!events.length) {
      host.innerHTML = `<p class="ex-empty">当前没有进行中的任务。</p>`;
      return;
    }
    host.innerHTML = events.slice(-6).reverse().map((item) => {
      const progress = item.progress || {};
      const bar = progress.current != null && progress.total
        ? `<div class="ex-desk-bar"><i style="width:${Math.max(0, Math.min(100, Math.round((Number(progress.current) / Number(progress.total)) * 100)))}%"></i></div>`
        : "";
      return `<div class="ex-task"><b>${escapeText(item.stage_label || item.type)}</b><small> ${escapeText(item.agent_id || "")}</small>${bar}</div>`;
    }).join("");
  }

  function renderQueue(events) {
    const host = document.querySelector("[data-queue]");
    const donut = document.querySelector("[data-donut]");
    if (!host) return;
    let generating = 0;
    let queued = 0;
    let waiting = 0;
    events.forEach((item) => {
      const type = String(item.type || "");
      if (type.indexOf("queued") >= 0) queued += 1;
      else if (type.indexOf("waiting") >= 0 || type.indexOf("authorization") >= 0) waiting += 1;
      else if (type.indexOf("running") >= 0 || type.indexOf("progress") >= 0 || type.indexOf("partial") >= 0) generating += 1;
    });
    const total = generating + queued + waiting;
    host.textContent = total ? `${total} 个真实任务 · 生成 ${generating} · 排队 ${queued} · 等待 ${waiting}` : "还没有生成任务";
    if (donut && total) {
      const g = (generating / total) * 100;
      const q = (queued / total) * 100;
      donut.style.background = `conic-gradient(#3d8bff 0 ${g}%, #8b7cff ${g}% ${g + q}%, #ffb020 ${g + q}% 100%)`;
    }
  }

  function renderSnapshot(payload) {
    const hello = document.querySelector("[data-hello]");
    if (hello) hello.textContent = greeting();
    const events = (payload && payload.events) || [];
    renderCards((payload && payload.specialists) || [], events);
    renderTasks(events);
    renderQueue(events);
  }

  async function loadStats() {
    const count = document.querySelector("[data-stat-count]");
    const label = document.querySelector("[data-stat-label]");
    if (!window.ApiClient || !count) return;
    try {
      const raw = await window.ApiClient.get("/api/maintenance/storage");
      const storage = (raw && raw.storage) || {};
      const originals = storage.originals != null ? storage.originals : storage.image_count;
      count.textContent = originals != null ? String(originals) : "0";
      const used = storage.used_human || storage.used_label || "";
      if (label) label.textContent = used ? `占用 ${used}` : "以本机维护台读数为准";
    } catch (_) {
      count.textContent = "0";
    }
  }

  function start() {
    const hello = document.querySelector("[data-hello]");
    if (hello) hello.textContent = greeting();
    window.addEventListener("experience-snapshot", (event) => renderSnapshot(event.detail || {}));
    if (!window.ApiClient || typeof window.ApiClient.get !== "function") return;
    window.ApiClient.get("/api/experience/snapshot").then(renderSnapshot).catch(() => renderSnapshot({}));
    void loadStats();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
