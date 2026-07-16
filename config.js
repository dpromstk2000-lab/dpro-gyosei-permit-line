/**
 * DPRO 行政書士・許認可申請 LINE
 * STEP GYOSEI-4 公開基盤・共通設定
 * Version: GYOSEI-4-CONFIG-PUBLIC-BASE-20260716
 */
(function (global) {
  "use strict";

  const CONFIG = Object.freeze({
    SERVICE_NAME: "DPRO 行政書士・許認可申請 LINE",
    OFFICE_NAME: "DPRO行政書士事務所",
    OFFICE_CODE: "dpro_gyosei_demo",
    API_BASE: "https://dpro-gyosei-permit-line-api.dpromstk2000.workers.dev",
    TIMEZONE: "Asia/Tokyo",
    DEFAULT_SLOT_MINUTES: 30,
    VERSION: "GYOSEI-4-CONFIG-PUBLIC-BASE-20260716",
    IS_DEMO: true,
    COLORS: Object.freeze({
      primary: "#17324D",
      secondary: "#247B78",
      background: "#F7F8F5",
      card: "#FFFFFF",
      success: "#2F855A",
      warning: "#C26A12",
      danger: "#B42318",
      text: "#17212B",
      muted: "#617180",
      border: "#D9E1E5",
    }),
    DEMO: Object.freeze({
      lineUserId: "demo_gyosei_line_001",
      memberPhone: "090-1111-2301",
      memberName: "山田 一郎",
    }),
  });

  const ADMIN_SESSION_KEY = "dpro_gyosei_admin_code";

  function normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return "";
    return p.startsWith("/") ? p : "/" + p;
  }

  function buildUrl(path, params) {
    const url = new URL(CONFIG.API_BASE + normalizePath(path));
    const values = params || {};
    Object.keys(values).forEach(function (key) {
      const value = values[key];
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  function getAdminCode() {
    try {
      return global.sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function setAdminCode(value) {
    const code = String(value || "").trim();
    try {
      if (code) global.sessionStorage.setItem(ADMIN_SESSION_KEY, code);
      else global.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (_) {}
    return code;
  }

  function clearAdminCode() {
    setAdminCode("");
  }

  function getLineUserId(fallback) {
    const url = new URL(global.location.href);
    return (
      url.searchParams.get("line_user_id") ||
      fallback ||
      (url.searchParams.get("demo") === "1" ? CONFIG.DEMO.lineUserId : "")
    );
  }

  async function apiFetch(path, options) {
    const opts = Object.assign({}, options || {});
    const params = opts.params || null;
    const admin = Boolean(opts.admin);
    const lineUserId = opts.lineUserId || "";
    delete opts.params;
    delete opts.admin;
    delete opts.lineUserId;

    const headers = new Headers(opts.headers || {});
    headers.set("X-Office-Code", CONFIG.OFFICE_CODE);
    if (admin) {
      const code = getAdminCode();
      if (!code) {
        const error = new Error("管理コードを入力してください。");
        error.status = 401;
        error.code = "admin_code_required";
        throw error;
      }
      headers.set("X-Admin-Code", code);
    }
    if (lineUserId) headers.set("X-Line-User-Id", lineUserId);

    if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
      opts.body = JSON.stringify(opts.body);
    }

    const controller = new AbortController();
    const timeout = global.setTimeout(function () { controller.abort(); }, 20000);
    opts.headers = headers;
    opts.signal = controller.signal;
    opts.cache = "no-store";

    let response;
    try {
      response = await fetch(buildUrl(path, params), opts);
    } catch (error) {
      if (error && error.name === "AbortError") {
        const timeoutError = new Error("通信がタイムアウトしました。時間をおいて再度お試しください。");
        timeoutError.code = "request_timeout";
        throw timeoutError;
      }
      throw new Error("通信できませんでした。インターネット接続をご確認ください。");
    } finally {
      global.clearTimeout(timeout);
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (_) { data = { ok: false, message: text }; }
    }

    if (!response.ok || (data && data.ok === false)) {
      const error = new Error(
        (data && (data.message || data.error)) ||
        "処理に失敗しました。"
      );
      error.status = response.status;
      error.code = data && data.error;
      error.data = data;
      throw error;
    }
    return data;
  }

  function normalizePhone(value) {
    if (!value) return "";
    let phone = String(value)
      .normalize("NFKC")
      .replace(/[ー―‐‑‒–—−]/g, "-")
      .replace(/[^0-9+]/g, "");
    if (phone.startsWith("+81")) phone = "0" + phone.slice(3);
    else if (phone.startsWith("81") && phone.length >= 11) phone = "0" + phone.slice(2);
    return phone.replace(/\D/g, "");
  }

  function formatDate(value, withTime) {
    if (!value) return "－";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    const options = withTime
      ? { timeZone: CONFIG.TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }
      : { timeZone: CONFIG.TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" };
    return new Intl.DateTimeFormat("ja-JP", options).format(date);
  }

  function todayJst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function statusLabel(value) {
    const labels = {
      new: "新規相談", reviewing: "確認中", reply_waiting: "返信待ち",
      appointment_scheduled: "面談予定", converted: "案件化済み", closed: "終了",
      not_decided: "受任未確定", estimate_preparing: "見積準備中",
      estimate_sent: "見積案内済み", accepted: "受任済み", declined: "辞退・不受任",
      not_started: "未着手", requested: "書類依頼済み",
      partially_received: "一部受領", deficient: "不足あり", complete: "書類完了",
      preparing: "申請準備中", ready_to_submit: "提出準備完了",
      submitted: "申請提出済み", under_review: "審査中",
      correction_required: "補正・追加資料対応", approved: "許可・完了",
      rejected: "不許可", withdrawn: "取下げ", open: "進行中", on_hold: "保留",
      completed: "完了", cancelled: "取消", not_required: "更新対象外",
      future: "将来更新", notice_due: "案内時期", notified: "更新案内済み",
      renewal_in_progress: "更新手続き中", renewed: "更新完了", expired: "期限経過",
      reserved: "予約受付", confirmed: "予約確定", change_requested: "変更依頼中",
      cancel_requested: "キャンセル依頼中", no_show: "来所なし",
      not_submitted: "未提出", checking: "確認中", replacement_requested: "差し替え依頼",
      not_applicable: "対象外", in_progress: "対応中",
    };
    return labels[value] || value || "－";
  }

  global.DPRO_GYOSEI_CONFIG = CONFIG;
  global.DPRO_GYOSEI = Object.freeze({
    config: CONFIG,
    buildUrl: buildUrl,
    apiFetch: apiFetch,
    getAdminCode: getAdminCode,
    setAdminCode: setAdminCode,
    clearAdminCode: clearAdminCode,
    getLineUserId: getLineUserId,
    normalizePhone: normalizePhone,
    formatDate: formatDate,
    todayJst: todayJst,
    escapeHtml: escapeHtml,
    statusLabel: statusLabel,
  });
})(window);
