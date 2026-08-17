(function () {
  function escapeText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function setText(sel, value) {
    const el = document.querySelector(sel);
    if (el) el.textContent = value;
  }
  function humanBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  async function fillTools() {
    try {
      const health = await window.ApiClient.get("/api/product/health");
      const ok = !health || !health.health || health.health.ok !== false;
      setText("[data-health]", ok ? "本机服务正常" : "需要查看运营台");
    } catch (_) {
      setText("[data-health]", "健康状态暂时读不到");
    }
    try {
      const raw = await window.ApiClient.get("/api/maintenance/storage");
      const storage = (raw && raw.storage) || {};
      setText("[data-storage]", humanBytes(storage.asset_bytes) + " 占用 · " + String(storage.original_files || 0) + " 张原图");
    } catch (_) {
      setText("[data-storage]", "存储统计暂时读不到");
    }
  }
  async function fillModels() {
    try {
      const cfg = await window.ApiClient.get("/api/studio/config");
      const token = cfg && cfg.token;
      const ready = token && (token.ok || token.has_token || token.present);
      setText("[data-token]", ready ? "生图通道已配置" : "还没有可用的 NAI / 闲云 Token，去设置里粘贴");
      const samplers = (cfg && cfg.samplers) || [];
      setText("[data-samplers]", samplers.length ? ("当前采样器 " + samplers[0] + " 等 " + samplers.length + " 项") : "采样器从本机工作台读取");
      const ai = cfg && cfg.ai;
      setText("[data-assistant]", ai && ai.has_api_key ? "管家模型 Key 已保存" : "管家模型 Key 未配置，对话优化不可用");
    } catch (_) {
      setText("[data-token]", "模型状态暂时读不到");
    }
  }
  async function fillFlow() {
    try {
      const queue = await window.ApiClient.get("/api/studio/queue?limit=40");
      const items = (queue && queue.items) || [];
      setText("[data-queue]", items.length ? ("待生成 " + items.length + " 项") : "待生成队列是空的");
    } catch (_) {
      setText("[data-queue]", "队列暂时读不到");
    }
    try {
      const generated = await window.ApiClient.get("/api/generated");
      const groups = (generated && generated.groups) || [];
      setText("[data-generated]", groups.length ? ("生成库 " + groups.length + " 组") : "还没有生成结果");
    } catch (_) {
      setText("[data-generated]", "生成库暂时读不到");
    }
  }
  function start() {
    if (!window.ApiClient) return;
    const page = document.body.getAttribute("data-page");
    if (page === "tools") void fillTools();
    if (page === "models") void fillModels();
    if (page === "flow") void fillFlow();
  }
  window.escapeText = window.escapeText || escapeText;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
