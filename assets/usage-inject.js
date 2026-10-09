(() => {
  const modules = window.__CODEX_USAGE_MONITOR_MODULES__;
  if (!modules?.constants || !modules?.i18n || !modules?.placement) {
    throw new Error("CtxMeter modules are incomplete.");
  }
  const {
    VERSION, PRODUCT_NAME, TOPBAR_MARK, STATE_KEY, USAGE_KEY, HOST_ID, SETTINGS_KEY, PREVIOUS_SETTINGS_KEY,
    PERSISTED_SETTINGS_KEY, SETTINGS_BINDING, CONFIGURATION_KEY, CONFIGURATION_BINDING,
    REFRESH_INTERVAL_MS, LAYOUT_FALLBACK_INTERVAL_MS, COUNTDOWN_INTERVAL_MS,
    PLACEMENT_DEBOUNCE_MS, MAX_SELECTED_METRICS,
    MAX_MINIMAL_SELECTED_METRICS,
  } = modules.constants;
  const { createTranslator } = modules.i18n;
  const { findPlacement, configurePosition, clearPlacement } = modules.placement;
  const isVisible = (node) => {
    const rect = node?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  };
  const SESSION_METRIC_IDS = new Set(["contextUsage", "currentStatus", "executionTime", "autoResume", "currentTaskTokens", "lastTurnTokens", "cacheHitRate", "lastTurnCacheHitRate", "contextCompactions"]);
  const SESSION_METRIC_FALLBACKS = [
    { id: "contextUsage", label: "当前上下文占用", display: "上下文 --", value: "--", defaultVisible: true },
    { id: "currentTaskTokens", label: "当前会话累计 Token", display: "会话 --", value: "--", defaultVisible: true },
    { id: "lastTurnTokens", label: "上次回答消耗 Token", display: "上次回答 --", value: "--", defaultVisible: false },
    { id: "cacheHitRate", label: "总缓存命中率", display: "总缓存 --", value: "--", defaultVisible: false },
    { id: "lastTurnCacheHitRate", label: "上次回答缓存命中率", display: "上次缓存 --", value: "--", defaultVisible: false },
    { id: "contextCompactions", label: "自动压缩上下文次数", display: "压缩 --", value: "--", defaultVisible: false },
    { id: "executionTime", label: "执行总耗时", display: "耗时 --", value: "--", durationMs: null, defaultVisible: false },
    { id: "autoResume", label: "额度恢复续跑", display: "续跑 --", value: "--", defaultVisible: false },
  ];
  const DEFAULT_METRIC_SELECTIONS = Object.freeze({
    session: Object.freeze(["contextUsage", "currentTaskTokens"]),
    official: Object.freeze(["secondaryRemaining"]),
  });
  const AUTO_RESUME_DEFAULT_MESSAGE = "继续";
  const normalizeSummaryStyle = (value) => ["clear", "capsule", "stacked"].includes(value) ? value : "clear";
  const MAX_AUTO_RESUME_MESSAGE_LENGTH = 500;
  const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CUSTOM_PROVIDER_DEFAULTS = Object.freeze({
    id: "custom", label: "API Key", baseUrl: "",
    usagePath: "", statusPath: "", authHeader: "Authorization", authScheme: "Bearer",
    usageRoot: "data", statusRoot: "data", used: "total_used", limit: "total_granted",
    unlimited: "unlimited", expiresAt: "expires_at", quotaPerUnit: "quota_per_unit",
    currency: "currency", defaultQuotaPerUnit: "1", defaultCurrency: "USD",
  });

  const previousUsage = window[STATE_KEY]?.usage || window[USAGE_KEY] || null;
  try { window[STATE_KEY]?.cleanup?.(); } catch {}

  const normalizeConfigurationSummary = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const account = source.account && typeof source.account === "object" ? source.account : {};
    const provider = source.provider && typeof source.provider === "object" ? source.provider : {};
    const response = provider.response && typeof provider.response === "object" ? provider.response : {};
    return {
      account: {
        configured: Boolean(account.configured),
        baseUrl: typeof account.baseUrl === "string" ? account.baseUrl.slice(0, 2048) : "https://www.cctq.ai",
        userId: typeof account.userId === "string" ? account.userId.slice(0, 20) : "",
        baselineConfigured: Boolean(account.baselineConfigured),
        initialTokens: typeof account.initialTokens === "string" && /^\d{1,19}$/.test(account.initialTokens)
          ? account.initialTokens
          : finiteNumber(account.initialTokens) ? String(Math.max(0, Math.trunc(Number(account.initialTokens)))) : "0",
      },
      provider: {
        configured: Boolean(provider.configured),
        id: typeof provider.id === "string" ? provider.id.slice(0, 32) : CUSTOM_PROVIDER_DEFAULTS.id,
        label: typeof provider.label === "string" ? provider.label.slice(0, 24) : CUSTOM_PROVIDER_DEFAULTS.label,
        baseUrl: typeof provider.baseUrl === "string" ? provider.baseUrl.slice(0, 2048) : CUSTOM_PROVIDER_DEFAULTS.baseUrl,
        usagePath: typeof provider.requests?.usagePath === "string" ? provider.requests.usagePath.slice(0, 2048) : CUSTOM_PROVIDER_DEFAULTS.usagePath,
        statusPath: typeof provider.requests?.statusPath === "string" ? provider.requests.statusPath.slice(0, 2048) : "",
        authHeader: typeof provider.auth?.header === "string" ? provider.auth.header.slice(0, 128) : "Authorization",
        authScheme: typeof provider.auth?.scheme === "string" ? provider.auth.scheme.slice(0, 32) : "Bearer",
        usageRoot: typeof response.usageRoot === "string" ? response.usageRoot.slice(0, 256) : "data",
        statusRoot: typeof response.statusRoot === "string" ? response.statusRoot.slice(0, 256) : "data",
        used: typeof response.used === "string" ? response.used.slice(0, 256) : "total_used",
        limit: typeof response.limit === "string" ? response.limit.slice(0, 256) : "total_granted",
        unlimited: typeof response.unlimited === "string" ? response.unlimited.slice(0, 256) : CUSTOM_PROVIDER_DEFAULTS.unlimited,
        expiresAt: typeof response.expiresAt === "string" ? response.expiresAt.slice(0, 256) : "expires_at",
        quotaPerUnit: typeof response.quotaPerUnit === "string" ? response.quotaPerUnit.slice(0, 256) : "quota_per_unit",
        currency: typeof response.currency === "string" ? response.currency.slice(0, 256) : CUSTOM_PROVIDER_DEFAULTS.currency,
        defaultQuotaPerUnit: finiteNumber(response.defaultQuotaPerUnit) ? String(response.defaultQuotaPerUnit) : CUSTOM_PROVIDER_DEFAULTS.defaultQuotaPerUnit,
        defaultCurrency: typeof response.defaultCurrency === "string" ? response.defaultCurrency.slice(0, 12) : CUSTOM_PROVIDER_DEFAULTS.defaultCurrency,
      },
    };
  };

  const setText = (node, value) => {
    const text = String(value ?? "");
    if (node && node.textContent !== text) node.textContent = text;
  };
  const finiteNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const normalizeAutoResumeMessage = (value) => {
    if (typeof value !== "string") return AUTO_RESUME_DEFAULT_MESSAGE;
    const message = value.trim();
    return message && message.length <= MAX_AUTO_RESUME_MESSAGE_LENGTH && !/[\u0000-\u001f\u007f]/.test(message)
      ? message
      : AUTO_RESUME_DEFAULT_MESSAGE;
  };
  const validStatus = (value) => ["loading", "ready", "stale", "unavailable", "error", "rate-limited"].includes(value) ? value : "unavailable";
  const normalizeContextWindow = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const validCount = (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
    const valid = validCount(source.usedTokens) && validCount(source.limitTokens) && source.limitTokens > 0;
    return {
      status: source.status === "awaiting-sample" ? "awaiting-sample" : source.status === "ready" && valid ? "ready" : "unknown",
      usedTokens: valid ? source.usedTokens : null,
      limitTokens: valid ? source.limitTokens : null,
      sampledAt: typeof source.sampledAt === "string" && Number.isFinite(Date.parse(source.sampledAt)) ? source.sampledAt : null,
    };
  };
  const normalizeMetric = (item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
    const id = item.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    if (!id) return null;
    return {
      id,
      label: typeof item.label === "string" ? item.label.slice(0, 32) : id,
      display: typeof item.display === "string" ? item.display.slice(0, 48) : "--",
      detail: typeof item.detail === "string" ? item.detail.slice(0, 96) : null,
      value: typeof item.value === "string" ? item.value.slice(0, 48) : null,
      statusCode: ["running", "completed", "quota-paused", "paused"].includes(item.statusCode) ? item.statusCode : null,
      durationMs: finiteNumber(item.durationMs) && Number(item.durationMs) >= 0 ? Number(item.durationMs) : null,
      estimated: item.estimated === true,
      incomplete: item.incomplete === true,
      running: item.running === true,
      sampledAt: typeof item.sampledAt === "string" && Number.isFinite(Date.parse(item.sampledAt)) ? item.sampledAt : null,
      resetsAt: finiteNumber(item.resetsAt) && Number(item.resetsAt) > 0 ? Number(item.resetsAt) : null,
      defaultVisible: Boolean(item.defaultVisible),
    };
  };
  const normalizeLatestActivity = (value) => {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    if (!source) return null;
    const text = typeof source.text === "string" ? source.text.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    const createdAt = finiteNumber(source.createdAt) ? Number(source.createdAt) : null;
    const sourceUrl = typeof source.sourceUrl === "string" && /^https:\/\/(?:www\.)?x\.com\/thsottiaux\/status\/\d{6,24}$/i.test(source.sourceUrl)
      ? source.sourceUrl
      : null;
    return text && createdAt && sourceUrl ? { text, createdAt, sourceUrl } : null;
  };
  const normalizeSource = (item, fallbackId) => {
    const source = item && typeof item === "object" ? item : {};
    const id = typeof source.id === "string" ? source.id : fallbackId;
    return {
      id,
      label: typeof source.label === "string" ? source.label.slice(0, 24) : id,
      accountType: ["api-key", "api-account", "session", "forecast"].includes(source.accountType) ? source.accountType : "subscription",
      status: validStatus(source.status),
      error: typeof source.error === "string" ? source.error.slice(0, 160) : null,
      fetchedAt: finiteNumber(source.fetchedAt) ? Number(source.fetchedAt) : null,
      nextRefreshAt: finiteNumber(source.nextRefreshAt)
        ? Number(source.nextRefreshAt)
        : finiteNumber(source.fetchedAt) ? Number(source.fetchedAt) + REFRESH_INTERVAL_MS : null,
      latestActivity: normalizeLatestActivity(source.latestActivity),
      resetMethod: ["banked", "forced"].includes(source.resetMethod) ? source.resetMethod : "unknown",
      metrics: (Array.isArray(source.metrics) ? source.metrics : []).map(normalizeMetric).filter(Boolean).slice(0, 16),
    };
  };
  const legacyOfficialSource = (source) => {
    const windows = Array.isArray(source.windows) ? source.windows.slice(0, 3) : [];
    const metrics = [];
    for (const [index, item] of windows.entries()) {
      const label = typeof item?.label === "string" ? item.label.slice(0, 8) : "主";
      const remaining = finiteNumber(item?.remainingPercent) ? Math.max(0, Math.min(100, Number(item.remainingPercent))) : null;
      const reset = formatReset(item?.resetsAt);
      metrics.push({ id: index ? "secondaryRemaining" : "primaryRemaining", label: `${label} 剩余`, display: `${label} ${formatPercent(remaining)}`, detail: `${label} 剩余 ${formatPercent(remaining)}`, value: formatPercent(remaining), resetsAt: item?.resetsAt, defaultVisible: index === 0 });
      metrics.push({ id: index ? "secondaryReset" : "primaryReset", label: `${label} 重置`, display: `${label} ${reset}`, detail: `${label}：${reset}`, value: reset, defaultVisible: false });
    }
    if (finiteNumber(source.todayTokens)) metrics.push({ id: "todayTokens", label: "今日 token", display: `今日 ${formatTokens(Number(source.todayTokens))}`, detail: `今日 token：${formatTokens(Number(source.todayTokens))}`, value: String(Math.max(0, Math.round(Number(source.todayTokens)))), defaultVisible: true });
    if (finiteNumber(source.lifetimeTokens)) metrics.push({ id: "lifetimeTokens", label: "累计 token", display: `累计 ${formatTokens(Number(source.lifetimeTokens))}`, detail: `累计 token：${formatTokens(Number(source.lifetimeTokens))}`, value: String(Math.max(0, Math.round(Number(source.lifetimeTokens)))), defaultVisible: false });
    return normalizeSource({ id: "official", label: "官方订阅", accountType: "subscription", status: source.status, error: source.error, fetchedAt: source.fetchedAt, metrics }, "official");
  };
  const normalizeUsage = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const sources = {};
    if (source.sources && typeof source.sources === "object") {
      for (const [id, item] of Object.entries(source.sources)) {
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || id === "quota-token" || item?.accountType === "quota-token") continue;
        sources[id] = normalizeSource(item, id);
      }
    }
    if (!sources.official) sources.official = legacyOfficialSource(source);
    if (sources.official && (finiteNumber(source.todayTokens) || finiteNumber(source.lifetimeTokens))) {
      sources.official.metrics = sources.official.metrics.map((metric) => {
        if (metric.id === "todayTokens" && finiteNumber(source.todayTokens)) return { ...metric, value: String(Math.max(0, Math.round(Number(source.todayTokens)))) };
        if (metric.id === "lifetimeTokens" && finiteNumber(source.lifetimeTokens)) return { ...metric, value: String(Math.max(0, Math.round(Number(source.lifetimeTokens)))) };
        return metric;
      });
    }
    return {
      schemaVersion: finiteNumber(source.schemaVersion) ? Number(source.schemaVersion) : 1,
      currentThreadId: THREAD_ID_PATTERN.test(String(source.currentThreadId || ""))
        ? String(source.currentThreadId).toLowerCase()
        : null,
      nextRefreshAt: finiteNumber(source.nextRefreshAt) ? Number(source.nextRefreshAt) : null,
      contextWindow: normalizeContextWindow(source.contextWindow),
      autoResume: source.autoResume && typeof source.autoResume === "object"
        ? {
            enabled: source.autoResume.enabled === true,
            status: ["idle", "waiting", "sending", "sent"].includes(source.autoResume.status) ? source.autoResume.status : "idle",
            reason: ["desktop-request-client-unavailable", "desktop-send-timeout", "desktop-send-failed", "codex-desktop-unavailable"].includes(source.autoResume.reason) ? source.autoResume.reason : null,
            resetAt: finiteNumber(source.autoResume.resetAt) ? Number(source.autoResume.resetAt) : null,
          }
        : { enabled: false, status: "idle", resetAt: null },
      sources,
    };
  };
  const preserveMetricsWhileLoading = (previous, incoming) => {
    if (!previous?.sources || !incoming?.sources) return incoming;
    const sources = { ...incoming.sources };
    for (const [id, source] of Object.entries(sources)) {
      const previousSource = previous.sources[id];
      if (id === "session" && previous.currentThreadId !== incoming.currentThreadId) continue;
      if (source.status !== "loading" || !previousSource?.metrics?.length) continue;
      sources[id] = {
        ...source,
        fetchedAt: previousSource.fetchedAt,
        nextRefreshAt: previousSource.nextRefreshAt,
        metrics: previousSource.metrics,
      };
    }
    return { ...incoming, sources };
  };
  const formatPercent = (value) => value === null ? "--" : `${Math.round(value)}%`;
  const formatTokens = (value) => {
    if (value === null) return "--";
    if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
    if (value >= 10000) return `${Math.round(value / 10000)}万`;
    return String(Math.round(value));
  };
  const formatChineseTokenUnit = (value) => {
    if (!finiteNumber(value)) return "--";
    const number = Math.max(0, Number(value));
    if (number >= 100000000) return `${(number / 100000000).toFixed(2)}亿`;
    if (number >= 10000) return `${Math.round(number / 10000)}万`;
    return String(Math.round(number));
  };
  const parseTokenUnit = (value) => {
    const match = String(value ?? "").trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)(万|亿|[KMB])?$/i);
    if (!match) return null;
    const multiplier = match[2] === "万" ? 10000
      : match[2] === "亿" ? 100000000
        : match[2]?.toUpperCase() === "K" ? 1000
          : match[2]?.toUpperCase() === "M" ? 1000000
            : match[2]?.toUpperCase() === "B" ? 1000000000 : 1;
    const number = Number(match[1]) * multiplier;
    return Number.isFinite(number) ? Math.max(0, number) : null;
  };
  const formatEnglishTokenUnit = (value) => {
    const number = parseTokenUnit(value);
    if (number === null) return String(value ?? "--");
    const compact = (divisor, suffix) => `${Number((number / divisor).toFixed(2))}${suffix}`;
    if (number >= 1000000000) return compact(1000000000, "B");
    if (number >= 1000000) return compact(1000000, "M");
    if (number >= 1000) return compact(1000, "K");
    return String(Math.round(number));
  };
  const formatLocalizedTokenUnit = (value, language) => {
    const text = String(value ?? "--");
    const approximate = text.startsWith("≈");
    const raw = approximate ? text.slice(1).trim() : text;
    const number = parseTokenUnit(raw);
    if (number === null) return text;
    return `${approximate ? "≈" : ""}${language === "en" ? formatEnglishTokenUnit(raw) : formatChineseTokenUnit(number)}`;
  };
  const formatReset = (timestamp) => {
    if (!timestamp) return "重置时间未知";
    const date = new Date(Number(timestamp) * 1000);
    if (!Number.isFinite(date.getTime())) return "重置时间未知";
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const formatActivityTime = (timestamp, language) => {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return "--";
    const pad = (value) => String(value).padStart(2, "0");
    const value = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return language === "en" ? value : value;
  };
  const normalizeAutoResumeThreads = (value) => {
    const normalized = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
    for (const [threadId, config] of Object.entries(value).slice(0, 128)) {
      const id = String(threadId).toLowerCase();
      if (!THREAD_ID_PATTERN.test(id) || !config || typeof config !== "object" || Array.isArray(config)) continue;
      normalized[id] = {
        enabled: config.enabled === true,
        message: normalizeAutoResumeMessage(config.message),
      };
    }
    return normalized;
  };
  const autoResumeForThread = (settings, threadId) => {
    const config = threadId ? settings.autoResumeThreads?.[threadId] : null;
    return {
      enabled: config?.enabled === true,
      message: normalizeAutoResumeMessage(settings.autoResumeSharedMessage ? settings.autoResumeMessage : config?.message ?? settings.autoResumeMessage),
    };
  };
  const loadSettings = () => {
    try {
      const persisted = window[PERSISTED_SETTINGS_KEY];
      const value = persisted && typeof persisted === "object"
        ? persisted
        : JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(PREVIOUS_SETTINGS_KEY) || "null");
      const metrics = value?.metrics && typeof value.metrics === "object" ? value.metrics : {};
      const hasSettings = Boolean(value && typeof value === "object" && !Array.isArray(value));
      return {
        metrics: Object.fromEntries(Object.entries(metrics).filter(([id]) => id !== "quota-token").map(([id, ids]) => [id, Array.isArray(ids) ? [...new Set(ids.map((item) => item === "dayTokens" ? "todayTokens" : ["session", "official"].includes(id) && item === "currentStatus" ? "executionTime" : item).filter((item) => typeof item === "string"))].slice(0, 12) : []])),
        metricOrder: Array.isArray(value?.metricOrder)
          ? [...new Set(value.metricOrder.filter((item) => typeof item === "string" && item.includes(":") && !item.startsWith("quota-token:")).map((key) => key.replace(/^(session|official):currentStatus$/, "$1:executionTime")))].slice(0, 64)
          : [],
        apiKeyMetricsVersion: Number(value?.apiKeyMetricsVersion) || 0,
        officialMetricsVersion: Number(value?.officialMetricsVersion) || 0,
        unifiedMetricsVersion: Number(value?.unifiedMetricsVersion) || 0,
        minimalMode: Boolean(value?.minimalMode),
        summaryStyle: normalizeSummaryStyle(value?.summaryStyle),
        countdownVisualization: Boolean(value?.countdownVisualization),
        refreshEvery30Seconds: Boolean(value?.refreshEvery30Seconds),
        englishUi: Boolean(value?.englishUi),
        updateNotifications: Boolean(value?.updateNotifications),
        contextReminders: value?.contextReminders !== false,
        autoResume: Boolean(value?.autoResume),
        autoResumeThreads: normalizeAutoResumeThreads(value?.autoResumeThreads),
        showApiColumns: hasSettings
          ? (Object.prototype.hasOwnProperty.call(value, "showApiColumns") ? Boolean(value.showApiColumns) : true)
          : false,
        showResetForecast: Object.prototype.hasOwnProperty.call(value || {}, "showResetForecast")
          ? Boolean(value.showResetForecast)
          : true,
        autoResumeMessage: normalizeAutoResumeMessage(value?.autoResumeMessage),
        autoResumeSharedMessage: value?.autoResumeSharedMessage === true,
      };
    } catch {
      return {
        metrics: {}, metricOrder: [], apiKeyMetricsVersion: 0, officialMetricsVersion: 0, unifiedMetricsVersion: 0,
        minimalMode: false, summaryStyle: "clear", countdownVisualization: false, refreshEvery30Seconds: false, englishUi: false, updateNotifications: false, contextReminders: true, autoResume: false,
        showApiColumns: false,
        showResetForecast: true,
        autoResumeThreads: {},
        autoResumeMessage: AUTO_RESUME_DEFAULT_MESSAGE,
        autoResumeSharedMessage: false,
      };
    }
  };
  const saveSettings = (value) => {
    try {
      window[PERSISTED_SETTINGS_KEY] = value;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
      localStorage.removeItem(PREVIOUS_SETTINGS_KEY);
      if (typeof window[SETTINGS_BINDING] === "function") window[SETTINGS_BINDING](JSON.stringify(value));
    } catch {}
  };
  const selectedMetrics = (source, settings) => {
    const available = new Map(source.metrics.map((item) => [item.id, item]));
    const hasSavedSelection = Object.prototype.hasOwnProperty.call(settings.metrics, source.id);
    let ids = hasSavedSelection && Array.isArray(settings.metrics[source.id])
      ? settings.metrics[source.id].filter((id) => available.has(id))
      : (DEFAULT_METRIC_SELECTIONS[source.id] || []).filter((id) => available.has(id));
    return ids.map((id) => available.get(id)).filter(Boolean);
  };
  const metricSelectionKey = (sourceId, metricId) => `${sourceId}:${metricId}`;
  const selectionPreferenceKeys = (sources, settings) => {
    const keys = [];
    const representedSources = new Set();
    for (const source of sources) {
      representedSources.add(source.id);
      const hasSavedSelection = Object.prototype.hasOwnProperty.call(settings.metrics, source.id);
      const ids = hasSavedSelection && Array.isArray(settings.metrics[source.id])
        ? settings.metrics[source.id]
        : (DEFAULT_METRIC_SELECTIONS[source.id] || []);
      keys.push(...ids.map((id) => metricSelectionKey(source.id, id)));
    }
    for (const [sourceId, ids] of Object.entries(settings.metrics)) {
      if (representedSources.has(sourceId) || !Array.isArray(ids)) continue;
      keys.push(...ids.map((id) => metricSelectionKey(sourceId, id)));
    }
    return [...new Set(keys)];
  };
  const orderedSelectedMetrics = (sources, settings) => {
    const candidates = sources.flatMap((source) => selectedMetrics(source, settings)
      .map((metric) => ({ source, metric, key: metricSelectionKey(source.id, metric.id) })));
    const byKey = new Map(candidates.map((item) => [item.key, item]));
    const ordered = [];
    for (const key of settings.metricOrder || []) {
      const candidate = byKey.get(key);
      if (!candidate) continue;
      ordered.push(candidate);
      byKey.delete(key);
    }
    ordered.push(...byKey.values());
    return ordered;
  };
  const metricValue = (metric, prefix) => metric?.value || metric?.display?.replace(prefix, "").trim() || "--";
  const apiKeyMetrics = (source) => {
    const metricById = new Map(source.metrics.map((item) => [item.id, item]));
    const usedValue = metricValue(metricById.get("usedAmount"), /^已用(?:额度)?\s*/);
    const limitValue = metricValue(metricById.get("quotaLimit") || metricById.get("grantedAmount"), /^(?:限额|总额)\s*/);
    const expiryValue = metricValue(metricById.get("expiresAt"), /^到期\s*/);
    const requestValue = source.status === "ready" ? "正常"
      : source.status === "loading" ? "请求中"
      : source.status === "stale" ? "数据过期"
      : source.status === "rate-limited" ? "请求受限"
      : source.status === "error" ? "请求失败"
      : source.error?.includes("未配置") ? "未配置" : "不可用";
    return [
      { id: "usedAmount", label: "已用额度", display: `已用 ${usedValue}`, value: usedValue, defaultVisible: metricById.get("usedAmount")?.defaultVisible ?? source.status === "ready" },
      { id: "quotaLimit", label: "限额", display: `限额 ${limitValue}`, value: limitValue, defaultVisible: metricById.get("quotaLimit")?.defaultVisible ?? source.status === "ready" },
      { id: "expiresAt", label: "到期时间", display: `到期 ${expiryValue}`, value: expiryValue, defaultVisible: false },
      { id: "requestStatus", label: "请求状态", display: `状态 ${requestValue}`, value: requestValue, defaultVisible: false },
    ];
  };
  const apiAccountMetrics = (source) => {
    const metricById = new Map(source.metrics.map((item) => [item.id, item]));
    const rows = [
      ["balance", "账户余额", "余额", true],
      ["usedQuota", "累计已用额度", "已用", false],
      ["todayTokens", "今日 Token", "今日", false],
      ["totalTokens", "累计 Token", "累计", false],
      ["lastQuota", "上次消耗额度", "消耗", false],
      ["lastModel", "上次响应模型", "模型", false],
      ["lastRequestAt", "上次请求时间", "请求", false],
      ["lastLatency", "上次响应耗时", "耗时", false],
    ].map(([id, label, compactLabel, defaultVisible]) => {
      const metric = metricById.get(id);
      const value = metric?.value || "--";
      return { id, label, value, display: metric?.display || `${compactLabel} ${value}`, defaultVisible: metric?.defaultVisible ?? (defaultVisible && source.status === "ready") };
    });
    return rows;
  };
  const officialMetrics = (source) => {
    const metricById = new Map(source.metrics.map((item) => [item.id, item]));
    const rows = [];
    for (const [id, label, compactLabel, defaultVisible] of [
      ["primaryRemaining", "5小时剩余", "5时", true],
      ["secondaryRemaining", "7天剩余", "7天", false],
    ]) {
      const metric = metricById.get(id);
      if (!metric) continue;
      const remainingValue = metric.value || metric.display.match(/(?:^|\s)(\d+(?:\.\d+)?%|--)\s*$/)?.[1] || "--";
      rows.push({
        id,
        label,
        display: `${compactLabel} ${remainingValue}`,
        value: remainingValue,
        resetsAt: metric.resetsAt,
        defaultVisible,
      });
    }
    const resetMetric = metricById.get("primaryReset");
    if (resetMetric) {
      const resetValue = metricValue(resetMetric, /^重置\s*/).replace(/后重置$/, "后").trim();
      rows.push({
        id: "primaryReset",
        label: "重置时间",
        display: `重置 ${resetValue}`,
        value: resetValue,
        defaultVisible: true,
      });
    }
    for (const [id, label, compactLabel] of [
      ["todayTokens", "今日 Token", "今日"],
      ["last7DaysTokens", "近7天 Token", "近7天"],
      ["lifetimeTokens", "累计 Token", "累计"],
    ]) {
      const metric = metricById.get(id);
      if (!metric) continue;
      const value = metric.value || metricValue(metric, new RegExp(`^${compactLabel}\\s*`));
      const numericValue = Number(String(value).replace(/,/g, ""));
      const displayValue = id.endsWith("Tokens") && Number.isFinite(numericValue)
        ? String(Math.max(0, Math.round(numericValue)))
        : value;
      rows.push({ id, label, display: `${compactLabel} ${displayValue}`, value: displayValue, defaultVisible: false });
    }
    return rows;
  };
  const sessionMetrics = (source) => {
    const metricById = new Map(source.metrics.map((item) => [item.id, item]));
    return SESSION_METRIC_FALLBACKS.map((fallback) => {
      const metric = metricById.get(fallback.id) || fallback;
      return {
        ...metric,
        defaultVisible: metric.defaultVisible ?? fallback.defaultVisible,
      };
    });
  };
  const selectableSource = (source) => ({
    ...source,
    metrics: source.accountType === "forecast" ? source.metrics
      : source.accountType === "api-key"
      ? apiKeyMetrics(source)
      : source.accountType === "api-account" ? apiAccountMetrics(source)
        : source.accountType === "session" ? sessionMetrics(source) : officialMetrics(source),
  });
  const markup = `
    <div class="usage-summary" role="button" tabindex="0" aria-label="Codex usage details" aria-expanded="false">
      <span class="usage-refresh-ring" aria-hidden="true" hidden></span>
      <span class="usage-backend-warning" hidden></span>
      <span class="usage-summary-items"><span class="usage-summary-item">Usage --</span></span>
      <span class="usage-summary-overflow" aria-hidden="true" hidden>⋯</span>
    </div>
    <div class="usage-popover" role="dialog" aria-label="Usage display settings" hidden>
      <div class="usage-backend-notice" role="status" aria-atomic="true" hidden></div>
      <div class="usage-columns"></div>
    </div>
    <span class="usage-context-announcement" role="status" aria-live="polite" aria-atomic="true"></span>`;
  const css = `
    .usage-backend-notice { margin-bottom: 10px; padding: 8px; border: 1px solid currentColor; border-radius: 6px; color: inherit; font-weight: 600; line-height: 1.5; }
    :host([data-backend="disconnected"]) .usage-summary-items { display: none; }
    :host([data-backend="disconnected"]) .usage-status { background: #9ca3af !important; }
    :host {
      --usage-number-color: #172b36;
      --usage-label-color: #667085;
      --usage-time-color: #475569;
      --usage-quota-color: #1d4ed8;
      --usage-forecast-color: #6d28d9;
      --usage-number-chip: #e5e9ee;
      --usage-quota-chip: #e4ecfc;
      --usage-forecast-chip: #ede6fc;
      position: fixed;
      left: var(--usage-left, 0px);
      top: var(--usage-top, 0px);
      z-index: 1000;
      display: inline-flex;
      max-width: var(--usage-max-width, 280px);
      color: var(--usage-color, currentColor);
      font: 500 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }
    :host([hidden]) { display: none; }
    .usage-summary {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 0;
      min-width: 0;
      max-width: 100%;
      height: var(--usage-host-height, 28px);
      max-height: var(--usage-titlebar-height, none);
      padding: 0 9px;
      border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
      border-radius: 7px;
      color: inherit;
      background: color-mix(in srgb, currentColor 5%, transparent);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      font-size: var(--usage-font-size, 11px);
    }
    .usage-summary:hover, .usage-summary:focus-visible {
      background: color-mix(in srgb, currentColor 10%, transparent);
      outline: none;
    }
    .usage-summary, .usage-summary *, .usage-popover, .usage-popover * { -webkit-app-region: no-drag; }
    :host([data-placement="top"]) .usage-summary:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    :host([data-placement="top"]) .usage-summary { padding-block: var(--usage-titlebar-padding, 2px); }
    :host([data-placement="top"]) .usage-popover { max-width: calc(100vw - 24px); overflow-x: auto; }
    :host([data-placement="top"]) .usage-summary-items { flex: 0 0 auto; width: max-content; max-width: none; overflow: visible; }
    :host([data-placement="top"]) .usage-summary-item { flex: 0 0 auto; }
    :host([data-placement="top"]) .usage-summary-item[data-summary-first-visible] { padding-left: 0; }
    :host([data-placement="top"]) .usage-summary-item[data-summary-first-visible]::before { display: none; }
    .usage-summary-overflow { flex: 0 0 auto; margin-left: 6px; font-size: 16px; font-weight: 700; line-height: 1; }
    .usage-summary-items { display: flex; align-items: center; min-width: 0; max-width: 100%; height: 100%; gap: 0; overflow: hidden; line-height: 1; }
    .usage-summary-item { position: relative; display: inline-flex; align-items: center; min-width: 0; height: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .usage-summary-auto-resume { gap: 5px; overflow: visible; }
    [data-context-level] { --usage-context-color: #6b7280; }
    [data-context-level="continue"] { --usage-context-color: #15803d; }
    [data-context-level="save"] { --usage-context-color: #a16207; }
    [data-context-level="new-chat"] { --usage-context-color: #dc2626; }
    .usage-summary-context { gap: 6px; flex-shrink: 0; }
    .usage-context-mark { font-size: 20px; font-weight: 800; line-height: 1; letter-spacing: -1px; flex: 0 0 auto; }
    .usage-context-meter { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 32px; flex: 0 0 32px; }
    .usage-context-track { display: block; width: 30px; height: 5px; border-radius: 3px; overflow: hidden; background: color-mix(in srgb, var(--usage-context-color) 20%, transparent); }
    .usage-context-fill { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--usage-context-color); }
    .usage-context-percent { color: var(--usage-context-color); font-size: 12px; font-weight: 750; line-height: 13px; }
    .usage-context-label { color: var(--usage-context-color); font-weight: 650; }
    .usage-context-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: 0 0 7px; background: var(--usage-context-color, #9ca3af); }
    .usage-context-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .usage-context-card { display: grid; gap: 5px; min-width: 0; margin-top: 9px; padding: 8px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 6px; background: color-mix(in srgb, currentColor 3%, transparent); line-height: 1.45; overflow-wrap: anywhere; }
    .usage-context-card-title { display: flex; align-items: center; gap: 5px; font-weight: 650; }
    .usage-context-value { font-variant-numeric: tabular-nums; }
    .usage-context-sampled, .usage-context-note { font-size: 10px; opacity: .72; }
    .usage-context-advice { font-weight: 600; }
    .usage-context-actions { display: grid; gap: 5px; min-width: 0; }
    .usage-context-copy { justify-self: start; min-height: 28px; padding: 4px 7px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 5px; color: inherit; background: Canvas; font: inherit; cursor: pointer; }
    .usage-context-copy:hover { background: color-mix(in srgb, currentColor 8%, Canvas); }
    .usage-context-copy:focus-visible, .usage-context-handoff:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .usage-context-handoff { box-sizing: border-box; width: 100%; min-width: 0; min-height: 100px; padding: 6px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 4px; color: inherit; background: Canvas; font: inherit; line-height: 1.5; resize: vertical; user-select: text; }
    .usage-context-copy-status { font-size: 10px; }
    @media (prefers-color-scheme: dark) {
      :host {
        --usage-number-color: #f1f5f9;
        --usage-label-color: #adb8c8;
        --usage-time-color: #cbd5e1;
        --usage-quota-color: #93c5fd;
        --usage-forecast-color: #c4b5fd;
        --usage-number-chip: #343d4a;
        --usage-quota-chip: #263d62;
        --usage-forecast-chip: #403259;
      }
      [data-context-level] { --usage-context-color: #9ca3af; }
      [data-context-level="continue"] { --usage-context-color: #4ade80; }
      [data-context-level="save"] { --usage-context-color: #fbbf24; }
      [data-context-level="new-chat"] { --usage-context-color: #f87171; }
    }
    :host([data-minimal="true"]) .usage-summary-auto-resume { gap: 0; }
    .usage-summary-toggle { flex: 0 0 24px; }
    .usage-summary-item + .usage-summary-item { padding-left: 13px; }
    .usage-summary-item + .usage-summary-item::before {
      content: "";
      position: absolute;
      left: 6px;
      top: calc(50% + 1px);
      width: 1px;
      height: 14px;
      background: currentColor;
      opacity: .40;
      transform: translateY(-50%);
    }
    .usage-refresh-ring {
      --usage-refresh-progress: 0deg;
      box-sizing: border-box;
      position: relative;
      top: 0;
      width: 13px;
      height: 13px;
      margin-right: 6px;
      flex: 0 0 13px;
      border: 1.5px solid currentColor;
      border-radius: 50%;
      background: transparent;
    }
    .usage-refresh-ring::before {
      content: "";
      position: absolute;
      top: -3px;
      left: 50%;
      width: 3px;
      height: 3px;
      border-radius: 1px 1px 0 0;
      background: currentColor;
      transform: translateX(-50%);
    }
    .usage-refresh-ring::after {
      content: "";
      position: absolute;
      left: calc(50% - .75px);
      bottom: 50%;
      width: 1.5px;
      height: calc(50% + .5px);
      border-radius: 1px;
      background: #22c55e;
      transform: rotate(var(--usage-refresh-progress));
      transform-origin: 50% 100%;
    }
    :host([data-density="dense"]) .usage-summary { padding-inline: 6px; }
    :host([data-density="dense"]) .usage-refresh-ring { width: 12px; height: 12px; margin-right: 4px; flex-basis: 12px; }
    :host([data-density="dense"]) .usage-summary-item + .usage-summary-item { padding-left: 7px; }
    :host([data-density="dense"]) .usage-summary-item + .usage-summary-item::before { left: 3px; height: 13px; }
    :host([data-placement="top"][data-density="dense"]) .usage-summary-context { gap: 4px; }
    :host([data-placement="top"][data-density="dense"]) .usage-summary-metric { gap: 3px; }
    :host([data-density="packed"]) .usage-summary { height: 30px; padding: 2px 5px; }
    :host([data-density="packed"]) .usage-refresh-ring { width: 11px; height: 11px; margin-right: 3px; flex-basis: 11px; }
    :host([data-density="packed"]) .usage-summary-items { display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; align-items: stretch; line-height: 1; }
    :host([data-density="packed"]) .usage-summary-item + .usage-summary-item { padding-left: 5px; }
    :host([data-density="packed"]) .usage-summary-item + .usage-summary-item::before { left: 2px; height: 12px; }
    :host([data-density="packed"]) .usage-summary-item:nth-child(2) { padding-left: 0; }
    :host([data-density="packed"]) .usage-summary-item:nth-child(2)::before { display: none; }
    .usage-summary-metric { gap: 4px; }
    .usage-summary-label { color: var(--usage-label-color); font-size: 11px; font-weight: 450; line-height: 13px; }
    .usage-summary-value { color: var(--usage-number-color); font-size: 13px; font-weight: 750; line-height: 16px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-summary-kind="quota"] .usage-summary-value { color: var(--usage-quota-color); }
    [data-summary-kind="time"] .usage-summary-value { color: var(--usage-time-color); font-size: 12px; font-weight: 700; }
    :host([data-summary-style="capsule"]) .usage-summary-value { padding: 2px 5px; border-radius: 5px; background: var(--usage-number-chip); }
    :host([data-summary-style="capsule"]) [data-summary-kind="quota"] .usage-summary-value { background: var(--usage-quota-chip); }
    :host([data-summary-style="capsule"]) [data-summary-kind="forecast"] .usage-summary-value { color: var(--usage-forecast-color); background: var(--usage-forecast-chip); }
    :host([data-summary-style="capsule"]) .usage-summary-item + .usage-summary-item::before { display: none; }
    :host([data-summary-style="stacked"]:not([data-minimal="true"]):not([data-density="packed"])) .usage-summary-metric { flex-direction: column; justify-content: center; align-items: flex-start; gap: 0; }
    :host([data-summary-style="stacked"]) .usage-summary-label { font-size: 9px; line-height: 10px; }
    :host([data-summary-style="stacked"]) .usage-summary-value { font-size: 12px; line-height: 14px; }
    :host([data-density="packed"]) .usage-summary-metric { gap: 3px; }
    :host([data-density="packed"]) .usage-summary-label { font-size: 9px; line-height: 11px; }
    :host([data-density="packed"]) .usage-summary-value { font-size: 11px; line-height: 12px; }
    :host([data-density="packed"][data-summary-style="capsule"]) .usage-summary-value { padding: 0 3px; border-radius: 3px; }
    :host([data-density="packed"]) .usage-summary-context { grid-row: span 2; }
    :host([data-minimal="true"]) .usage-summary-metric { gap: 0; }
    [hidden] { display: none !important; }
    .usage-popover {
      box-sizing: border-box;
      position: absolute;
      left: 0;
      top: var(--usage-popover-top, auto);
      bottom: var(--usage-popover-bottom, calc(100% + 8px));
      z-index: 40;
      left: var(--usage-popover-shift, 0px);
      width: max-content;
      max-height: min(440px, var(--usage-popover-max-height, calc(100vh - 72px)));
      padding: 10px 11px;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 8px;
      color: inherit;
      background: Canvas;
      box-shadow: 0 10px 28px rgba(0, 0, 0, .16);
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      white-space: normal;
    }
    .usage-columns {
      display: grid;
      grid-template-columns: var(--usage-column-widths, repeat(var(--usage-column-count, 4), minmax(230px, 1fr)));
      align-items: stretch;
    }
    .usage-column { box-sizing: border-box; display: flex; flex-direction: column; width: 100%; min-width: 0; padding: 0 11px; }
    .usage-column:first-child { padding-left: 0; }
    .usage-column:last-child { padding-right: 0; }
    .usage-column-title {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 27px;
      padding-bottom: 5px;
      font-weight: 650;
    }
    .usage-column-heading { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .usage-config-trigger {
      min-height: 25px;
      margin-left: auto;
      padding: 2px 7px;
      border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
      border-radius: 5px;
      color: inherit;
      background: transparent;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .usage-config-trigger:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
    .usage-config-trigger:focus-visible,
    .usage-config-control:focus-visible,
    .usage-config-submit:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 42%, transparent); outline-offset: 1px; }
    .usage-config-form { display: grid; gap: 8px; padding: 3px 0 5px; }
    .usage-config-field { display: grid; gap: 3px; min-width: 0; }
    .usage-config-label { font-size: 10px; font-weight: 650; line-height: 1.25; }
    .usage-config-control {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      min-height: 32px;
      padding: 5px 7px;
      border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
      border-radius: 5px;
      color: inherit;
      background: Canvas;
      font: inherit;
    }
    .usage-config-control[aria-invalid="true"] { border-color: #ef4444; }
    .usage-config-error { min-height: 13px; color: #dc2626; font-size: 9px; line-height: 1.3; }
    .usage-config-hint { color: inherit; font-size: 9px; line-height: 1.35; opacity: .62; }
    .usage-config-secret-wrap { position: relative; }
    .usage-config-secret-wrap .usage-config-control { padding-right: 44px; }
    .usage-config-reveal {
      position: absolute;
      top: 0;
      right: 0;
      width: 42px;
      height: 32px;
      padding: 0;
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
      opacity: .68;
      font: inherit;
      font-size: 9px;
    }
    .usage-config-reveal:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 42%, transparent); outline-offset: -2px; }
    .usage-config-advanced { display: grid; gap: 8px; padding-top: 2px; }
    .usage-config-disclosure {
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 5px;
      padding: 0 7px;
    }
    .usage-config-disclosure > summary {
      min-height: 31px;
      display: flex;
      align-items: center;
      color: inherit;
      font-size: 10px;
      font-weight: 650;
      cursor: pointer;
    }
    .usage-config-disclosure[open] { padding-bottom: 7px; }
    .usage-config-disclosure > summary:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 42%, transparent); outline-offset: 1px; }
    .usage-config-advanced-title { margin: 1px 0; font-size: 10px; font-weight: 700; opacity: .72; }
    .usage-config-status { min-height: 15px; font-size: 9px; line-height: 1.35; }
    .usage-config-status[data-kind="error"] { color: #dc2626; }
    .usage-config-status[data-kind="success"] { color: #15803d; }
    .usage-config-submit {
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid color-mix(in srgb, currentColor 36%, transparent);
      border-radius: 5px;
      color: Canvas;
      background: color-mix(in srgb, currentColor 88%, Canvas);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .usage-config-submit:disabled { cursor: wait; opacity: .55; }
    .usage-config-trigger:active, .usage-config-reveal:active, .usage-config-submit:active { opacity: .72; }
    .usage-status { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #a1a1aa; }
    .usage-column[data-status="ready"] .usage-status { background: #22c55e; }
    .usage-column[data-status="loading"] .usage-status { background: #facc15; }
    .usage-column[data-status="stale"] .usage-status { background: #fb3f4f; }
    .usage-column-rows { display: grid; }
    .usage-detail-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-height: 27px;
    }
    .usage-detail-select { display: flex; align-items: center; min-width: 0; gap: 6px; cursor: pointer; }
    .usage-detail-select input {
      appearance: none;
      box-sizing: border-box;
      width: 13px;
      height: 13px;
      margin: 0;
      flex: 0 0 13px;
      display: grid;
      place-content: center;
      border: 1px solid color-mix(in srgb, currentColor 48%, transparent);
      border-radius: 2px;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .usage-detail-select input::before {
      content: "";
      width: 6px;
      height: 3px;
      border-left: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: translateY(-1px) rotate(-45deg) scale(0);
      transform-origin: center;
    }
    .usage-detail-select input:checked { border-color: currentColor; background: color-mix(in srgb, currentColor 16%, transparent); }
    .usage-detail-select input:checked::before { transform: translateY(-1px) rotate(-45deg) scale(1); }
    .usage-detail-select input:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 40%, transparent); outline-offset: 1px; }
    .usage-detail-select input:disabled { cursor: default; }
    .usage-detail-select:has(input:disabled) { opacity: .45; cursor: default; }
    .usage-detail-label { min-width: 0; color: inherit; font-weight: 650; }
    .usage-detail-value { max-width: 138px; overflow: hidden; color: inherit; font-weight: 650; text-align: right; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .usage-detail-reset { font-weight: 500; opacity: .58; }
    .usage-reset-method { margin-top: 6px; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .usage-tibo-activity {
      min-width: 0;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    }
    .usage-tibo-activity-head { display: flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0; }
    .usage-tibo-activity-label { min-width: 0; overflow: hidden; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .usage-tibo-activity-link { flex: 0 0 auto; color: inherit; font-size: 9px; font-weight: 600; opacity: .62; text-underline-offset: 2px; }
    .usage-tibo-activity-text {
      display: -webkit-box;
      margin-top: 4px;
      overflow: hidden;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.38;
      opacity: .78;
      overflow-wrap: anywhere;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .usage-tibo-activity-time { display: block; margin-top: 3px; overflow: hidden; font-size: 9px; opacity: .5; text-overflow: ellipsis; white-space: nowrap; }
    .usage-column-brand {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-self: flex-end;
      width: fit-content;
      max-width: 100%;
      min-height: 36px;
      margin: 0 8px 0 0;
      padding: 4px 0 2px;
      font-weight: 450;
      line-height: 1.35;
      opacity: .55;
      white-space: nowrap;
    }
    .usage-brand-product { color: inherit; font-size: 12px; text-decoration: none; }
    .usage-brand-product[href] { text-decoration: underline; text-underline-offset: 2px; }
    .usage-brand-credit { font-size: 9px; font-weight: 450; text-align: right; }
    .usage-column-footer {
      display: grid;
      gap: 2px;
      align-self: flex-end;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      margin-top: auto;
      padding-top: 4px;
    }
    .usage-mode-switches {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-flow: row;
      align-items: center;
      justify-content: flex-end;
      gap: 6px 10px;
      width: 100%;
      min-height: 22px;
      white-space: nowrap;
    }
    .usage-mode-switches[hidden] { display: none; }
    .usage-style-setting { display: grid; grid-template-columns: minmax(0, 1fr) minmax(100px, 1.4fr); grid-column: 1 / -1; align-items: center; gap: 8px; font-size: 11px; }
    .usage-style-setting select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 28px; padding: 3px 5px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 5px; background: Canvas; color: inherit; font: inherit; cursor: pointer; }
    .usage-style-setting select:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    .usage-mode-toggle {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      gap: 5px;
      min-width: 0;
      font-size: 9px;
      line-height: 1;
      opacity: .72;
      cursor: pointer;
    }
    .usage-mode-toggle > span:first-child {
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
    }
    .usage-mode-toggle input,
    .usage-inline-toggle input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .usage-toggle-track {
      box-sizing: border-box;
      position: relative;
      width: 24px;
      height: 14px;
      flex: 0 0 24px;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 9%, transparent);
      transition: background-color 120ms ease, border-color 120ms ease;
    }
    .usage-toggle-track::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: color-mix(in srgb, currentColor 72%, Canvas);
      transition: transform 120ms ease, background-color 120ms ease;
    }
    .usage-mode-toggle input:checked + .usage-toggle-track,
    .usage-inline-toggle input:checked + .usage-toggle-track { border-color: #86efac; background: #86efac; }
    .usage-mode-toggle input:checked + .usage-toggle-track::after,
    .usage-inline-toggle input:checked + .usage-toggle-track::after { background: #166534; transform: translateX(10px); }
    .usage-mode-toggle input:focus-visible + .usage-toggle-track,
    .usage-inline-toggle input:focus-visible + .usage-toggle-track { outline: 2px solid color-mix(in srgb, #86efac 60%, transparent); outline-offset: 1px; }
    .usage-inline-toggle { position: relative; display: block; width: 24px; height: 14px; cursor: pointer; }
    .usage-inline-toggle .usage-toggle-track { display: block; }
    .usage-auto-resume-field { display: grid; gap: 3px; min-width: 0; padding: 0 0 5px 19px; }
    .usage-auto-resume-error { padding: 3px 0 5px 19px; font-size: 10px; line-height: 1.5; color: #b45309; overflow-wrap: anywhere; }
    .usage-inline-toggle.usage-shared-resume { display: flex; width: auto; height: auto; min-height: 14px; gap: 6px; align-items: center; margin-left: 19px; font-size: 10px; justify-content: space-between; }
    .usage-shared-resume > span:first-child { white-space: normal; }
    .usage-auto-resume-label { font-size: 9px; font-weight: 650; line-height: 1.2; opacity: .72; }
    .usage-auto-resume-message {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 4px 7px;
      border: 1px solid color-mix(in srgb, currentColor 26%, transparent);
      border-radius: 5px;
      color: inherit;
      background: Canvas;
      font: inherit;
    }
    .usage-auto-resume-message:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 42%, transparent); outline-offset: 1px; }
    .usage-column-meta {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 5px;
      min-height: 27px;
      font-size: 10px;
      line-height: 1;
      opacity: .55;
      white-space: nowrap;
    }
    .usage-settings-trigger {
      min-height: 22px;
      padding: 0 6px;
      border: 1px solid currentColor;
      border-radius: 4px;
      color: inherit;
      background: transparent;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    .usage-settings-trigger:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
    .usage-settings-trigger:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 42%, transparent); outline-offset: 1px; }
    @media (max-width: 760px) {
      .usage-popover { padding-inline: 8px; font-size: 10px; }
      .usage-column { padding-inline: 6px; }
      .usage-detail-row { gap: 4px; }
      .usage-detail-select { gap: 4px; }
      .usage-detail-value { max-width: 116px; }
      .usage-brand-product { font-size: 10px; }
      .usage-brand-credit { font-size: 8px; }
      .usage-mode-switches { gap: 6px; }
      .usage-mode-toggle { grid-template-columns: minmax(0, 1fr) 22px; gap: 3px; font-size: 8px; }
      .usage-toggle-track { width: 22px; flex-basis: 22px; }
      .usage-inline-toggle { width: 22px; height: 14px; }
      .usage-mode-toggle input:checked + .usage-toggle-track::after,
      .usage-inline-toggle input:checked + .usage-toggle-track::after { transform: translateX(8px); }
      .usage-column-meta { font-size: 9px; }
      .usage-config-trigger { padding-inline: 5px; }
    }
    @supports not (color: color-mix(in srgb, red 50%, transparent)) {
      .usage-summary { border-color: rgba(128, 128, 128, .22); background: rgba(128, 128, 128, .06); }
      .usage-popover { border-color: rgba(128, 128, 128, .22); }
    }
    @media (prefers-reduced-motion: reduce) {
      .usage-toggle-track,
      .usage-toggle-track::after { transition: none; }
    }
  `;

  const summaryKind = (metric, source) => source?.accountType === "forecast" ? "forecast"
    : ["primaryRemaining", "secondaryRemaining", "balance", "quotaLimit"].includes(metric.id) ? "quota"
      : /(?:Reset|At)$/.test(metric.id || "") ? "time" : "statistic";
  const minimalSummaryDisplay = (metric) => {
    // Values have already been formatted and localized. Keep date separators,
    // currency signs, negative values and provider text intact in every style.
    return String(metric?.value ?? "--").replace(/\s+/g, " ").trim() || "--";
  };
  const appendSummaryMetric = (item, metric, source, settings, t, density) => {
    item.classList.add("usage-summary-metric");
    item.dataset.summaryKind = summaryKind(metric, source);
    if (!settings.minimalMode) {
      const label = document.createElement("span");
      label.className = "usage-summary-label";
      label.dataset.summaryLabel = "true";
      label.textContent = density === "normal" ? t.compact(metric.id, metric.label)
        : t.compact(metric.id, metric.label).replace(/\s+/g, "");
      item.append(label);
      if (density === "normal") item.append(document.createTextNode(" "));
    }
    const value = document.createElement("span");
    value.className = "usage-summary-value";
    value.dataset.summaryValue = "true";
    value.textContent = minimalSummaryDisplay(metric);
    item.append(value);
  };
  const selectedMetricLimit = (settings) => settings?.minimalMode
    ? MAX_MINIMAL_SELECTED_METRICS
    : MAX_SELECTED_METRICS;

  const summaryDensity = (host, settings, count) => {
    if (host.dataset.placement === "top") return "normal";
    const availableWidth = Number.parseInt(host.style.getPropertyValue("--usage-max-width"), 10) || 280;
    return settings.minimalMode ? count >= 9 ? "packed" : "normal"
      : count >= 7 || (count >= 5 && availableWidth < 280) ? "packed" : count >= 5 ? "dense" : "normal";
  };

  const fitSummary = (host) => {
    const shadow = host.shadowRoot;
    const summary = shadow?.querySelector(".usage-summary");
    if (!summary) return { width: 0, fits: true };
    const items = [...shadow.querySelectorAll(".usage-summary-item")];
    const overflow = shadow.querySelector(".usage-summary-overflow");
    const settings = loadSettings();
    const t = createTranslator(settings.englishUi ? "en" : "zh");
    const count = items.filter((item) => item.dataset.metric).length;
    items.forEach((item) => { item.hidden = false; });
    if (overflow) overflow.hidden = true;
    host.dataset.density = summaryDensity(host, settings, count);
    const styleWidth = (style, properties) => properties.reduce((total, name) => total + (Number.parseFloat(style[name]) || 0), 0);
    const measure = () => {
      const firstVisible = items.find((item) => !item.hidden);
      items.forEach((item) => item.toggleAttribute("data-summary-first-visible", item === firstVisible));
      const style = getComputedStyle(summary);
      const edges = styleWidth(style, ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]);
      const extra = [".usage-refresh-ring", ".usage-backend-warning", ".usage-summary-overflow"]
        .map((selector) => shadow.querySelector(selector)).filter((node) => node && !node.hidden)
        .reduce((total, node) => total + node.getBoundingClientRect().width
          + styleWidth(getComputedStyle(node), ["marginLeft", "marginRight"]), 0);
      return Math.ceil(edges + extra + items.filter((item) => !item.hidden)
        .reduce((total, item) => total + item.getBoundingClientRect().width, 0));
    };
    const available = Number.parseFloat(host.style.getPropertyValue("--usage-max-width")) || 280;
    let width = measure();
    if (host.dataset.placement === "top" && host.dataset.backend !== "disconnected") {
      if (width > available) {
        host.dataset.density = "dense";
        width = measure();
      }
      // Keep the user's selection/order intact. Only presentation changes;
      // the full set remains in the same details popover and returns on resize.
      const protectedItem = items.find((item) => item.dataset.metric === "contextUsage") || items[0];
      for (let index = items.length - 1; index >= 0 && width > available; index -= 1) {
        if (items[index] === protectedItem) continue;
        items[index].hidden = true;
        if (overflow) overflow.hidden = false;
        width = measure();
      }
    }
    const hidden = items.filter((item) => item.hidden && item.dataset.metric).length;
    const visible = count - hidden;
    host.dataset.overflowCount = String(hidden);
    host.dataset.visibleCount = String(visible);
    if (overflow) overflow.title = hidden ? t("foldedItems", { count: hidden }) : "";
    summary.title = hidden ? t("foldedItems", { count: hidden }) : "";
    summary.setAttribute("aria-label", host.dataset.backend === "disconnected" ? t("backendRecovery")
      : hidden ? t("displayedItemsOverflow", { count: visible, hidden }) : t("displayedItems", { count: visible }));
    return { width, fits: width <= available };
  };

  const executionTimeDisplay = (metric, t, now = Date.now()) => {
    if (!finiteNumber(metric?.durationMs)) return "--";
    const sampledAt = Date.parse(metric.sampledAt);
    const elapsed = metric.running && Number.isFinite(sampledAt) ? Math.max(0, now - sampledAt) : 0;
    // Stop extrapolating if the local data feed disappears. A later snapshot
    // reconciles this estimate; never turn a disconnected monitor into a clock.
    const seconds = Math.floor((Number(metric.durationMs) + Math.min(elapsed, 60000)) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const rest = seconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    const units = t.language === "en" ? ["h", "m", "s"] : ["时", "分", "秒"];
    const duration = hours ? `${hours}${units[0]}${pad(minutes)}${units[1]}${pad(rest)}${units[2]}`
      : minutes ? `${minutes}${units[1]}${pad(rest)}${units[2]}` : `${rest}${units[2]}`;
    return `${metric.estimated || metric.running ? "≈" : ""}${duration}${metric.incomplete || elapsed > 60000 ? "+" : ""}`;
  };

  const contextView = (usage, settings, t, now = Date.now()) => {
    const context = usage.contextWindow;
    const backend = window.__CODEX_USAGE_MONITOR_BACKEND__;
    const connected = backend && finiteNumber(backend.at) && now - Number(backend.at) <= 30000;
    const reasonKey = !usage.currentThreadId ? "contextNoThread" : !connected ? "contextNoBackend"
      : context.status === "awaiting-sample" ? "contextAfterCompaction" : context.status !== "ready" ? "contextUnknown" : null;
    if (reasonKey) {
      const awaiting = reasonKey === "contextAfterCompaction";
      const value = awaiting ? t("contextAwaiting") : "--";
      return { level: awaiting ? "awaiting-sample" : "unknown", value, label: awaiting ? t("contextAwaiting") : t("unavailable"), advice: t(reasonKey), ready: false };
    }
    // The ratio is recomputed from the latest request counts. Never use a
    // cumulative session total or a server-provided rounded percentage here.
    const percent = context.usedTokens / context.limitTokens * 100;
    const level = percent >= 85 ? "new-chat" : percent >= 70 ? "save" : "continue";
    const label = t(level === "new-chat" ? "contextNewChat" : level === "save" ? "contextSave" : "contextContinue");
    const value = `≈${Math.floor(percent)}%`;
    const advice = t(level === "new-chat" ? "contextNewChatHint" : level === "save" ? "contextSaveHint" : "contextContinueHint");
    return { level, value, label, percent, advice, ready: true };
  };
  const createContextCard = () => {
    const card = document.createElement("aside");
    card.className = "usage-context-card";
    card.innerHTML = `<div class="usage-context-card-title"><span class="usage-context-dot" aria-hidden="true"></span><span data-context-title></span></div>
      <div class="usage-context-value" data-context-value></div>
      <time class="usage-context-sampled" data-context-sampled></time>
      <div class="usage-context-advice" data-context-advice></div>
      <div class="usage-context-note" data-context-thresholds></div>
      <div class="usage-context-actions" data-context-actions>
        <button type="button" class="usage-context-copy" data-context-copy></button>
        <div class="usage-context-note" data-context-copy-note></div>
        <div class="usage-context-copy-status" data-context-copy-status role="status" aria-live="polite"></div>
        <textarea class="usage-context-handoff" data-context-handoff readonly hidden></textarea>
      </div>`;
    return card;
  };
  const updateContext = (host, usage, settings, t, now) => {
    const shadow = host.shadowRoot;
    const view = contextView(usage, settings, t, now);
    const summary = shadow.querySelector('.usage-summary-item[data-metric="contextUsage"]');
    if (summary) {
      summary.dataset.contextLevel = view.level;
      summary.title = `${t.metric("contextUsage")}：${view.value}${settings.contextReminders || !view.ready ? ` · ${view.advice}` : ""}`;
      const label = summary.querySelector("[data-context-summary]");
      setText(label, view.label);
      label.hidden = !settings.contextReminders;
      setText(summary.querySelector("[data-context-percent]"), view.ready ? `${Math.floor(view.percent)}%` : "--");
      const progress = summary.querySelector("[data-context-progress]");
      progress.setAttribute("aria-label", t.metric("contextUsage"));
      progress.setAttribute("aria-valuetext", summary.title);
      const filled = view.ready ? Math.min(100, Math.max(0, view.percent)) : 0;
      summary.querySelector(".usage-context-fill").style.width = `${filled}%`;
      if (view.ready) progress.setAttribute("aria-valuenow", String(Number(filled.toFixed(1))));
      else progress.removeAttribute("aria-valuenow");
    }
    const detail = shadow.querySelector("[data-context-detail]");
    setText(detail, view.value);
    if (detail) detail.title = summary?.title || `${t.metric("contextUsage")}：${view.value}`;
    const card = shadow.querySelector(".usage-context-card");
    if (card) {
      card.dataset.contextLevel = view.level;
      setText(card.querySelector("[data-context-title]"), t("contextCardTitle"));
      const locale = t.language === "en" ? "en-US" : "zh-CN";
      setText(card.querySelector("[data-context-value]"), view.ready ? t("contextEstimate", {
        used: usage.contextWindow.usedTokens.toLocaleString(locale), limit: usage.contextWindow.limitTokens.toLocaleString(locale),
      }) : view.advice);
      const sampleTime = card.querySelector("[data-context-sampled]");
      setText(sampleTime, view.ready && usage.contextWindow.sampledAt
        ? t("contextSampledAt", { value: formatActivityTime(Date.parse(usage.contextWindow.sampledAt), t.language) }) : t("contextNoSample"));
      if (view.ready && usage.contextWindow.sampledAt) sampleTime.dateTime = usage.contextWindow.sampledAt;
      else sampleTime.removeAttribute("datetime");
      const advice = card.querySelector("[data-context-advice]");
      advice.hidden = !settings.contextReminders || !view.ready;
      setText(advice, view.ready && settings.contextReminders ? view.advice : "");
      setText(card.querySelector("[data-context-thresholds]"), t("contextThresholdHint"));
      card.querySelector("[data-context-actions]").hidden = !settings.contextReminders;
      setText(card.querySelector("[data-context-copy]"), t("contextCopy"));
      setText(card.querySelector("[data-context-copy-note]"), t("contextCopyNote"));
      const handoff = card.querySelector("[data-context-handoff]");
      handoff.setAttribute("aria-label", t("contextCopy"));
      if (handoff.value !== t("contextHandoffPrompt")) handoff.value = t("contextHandoffPrompt");
    }
    const announcement = shadow.querySelector(".usage-context-announcement");
    const announcementKey = `${usage.currentThreadId || ""}:${view.level}:${settings.contextReminders}:${t.language}`;
    if (announcement && announcement.dataset.key !== announcementKey) {
      announcement.dataset.key = announcementKey;
      setText(announcement, settings.contextReminders ? `${t.compact("contextUsage")}：${view.advice}` : "");
    }
  };

  const updateCountdowns = (host, value) => {
    if (!host?.shadowRoot) return;
    const usage = normalizeUsage(value);
    const settings = loadSettings();
    const t = createTranslator(settings.englishUi ? "en" : "zh");
    const now = Date.now();
    updateContext(host, usage, settings, t, now);
    const backend = window.__CODEX_USAGE_MONITOR_BACKEND__;
    const disconnected = Boolean(backend && (!finiteNumber(backend.at) || now - Number(backend.at) > 30000));
    const wasDisconnected = host.dataset.backend === "disconnected";
    host.dataset.backend = disconnected ? "disconnected" : backend ? "connected" : "unknown";
    const warning = host.shadowRoot.querySelector(".usage-backend-warning");
    const notice = host.shadowRoot.querySelector(".usage-backend-notice");
    if (warning) { warning.hidden = !disconnected; setText(warning, t("backendDisconnected")); }
    if (notice) { notice.hidden = !disconnected; setText(notice, disconnected ? t("backendRecovery") : ""); }
    if (disconnected) host.shadowRoot.querySelector(".usage-summary")?.setAttribute("aria-label", t("backendRecovery"));
    else if (wasDisconnected) host.shadowRoot.querySelector(".usage-summary")?.setAttribute("aria-label", t("displayedItems", {
      count: host.shadowRoot.querySelectorAll('.usage-summary-item[data-metric]').length,
    }));
    const duration = usage.sources.session?.metrics.find((metric) => metric.id === "executionTime") || { durationMs: null };
    {
      const text = executionTimeDisplay(duration, t, now);
      const hint = `${t.metric("executionTime")}：${text} · ${t("executionTimeHint")}`;
      const detail = host.shadowRoot.querySelector('[data-duration-value]');
      setText(detail, text);
      if (detail) detail.title = hint;
      const summary = host.shadowRoot.querySelector('.usage-summary-item[data-source="session"][data-metric="executionTime"]');
      setText(summary?.querySelector("[data-summary-value]"), text);
      if (summary) summary.title = hint;
    }
    const remainingMs = finiteNumber(usage.nextRefreshAt)
      ? Math.max(0, Number(usage.nextRefreshAt) - now)
      : null;
    const seconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
    setText(host.shadowRoot.querySelector(".usage-refresh-countdown"), disconnected ? t("backendDisconnected") : t("refreshIn", {
      seconds: seconds === null ? "--" : t.language === "en" ? `${seconds}s` : `${seconds}秒后`,
    }));
    const ring = host.shadowRoot.querySelector(".usage-refresh-ring");
    if (ring) {
      const progress = remainingMs === null ? 0 : Math.max(0, Math.min(1, 1 - remainingMs / (settings.refreshEvery30Seconds ? 30000 : REFRESH_INTERVAL_MS)));
      ring.style.setProperty("--usage-refresh-progress", `${Math.round(progress * 360)}deg`);
    }
  };

  const configurationDraft = (sourceId) => {
    const configuration = window[STATE_KEY]?.configuration;
    if (!configuration) return {};
    if (configuration.drafts[sourceId]) return configuration.drafts[sourceId];
    if (sourceId === "api-account") {
      configuration.drafts[sourceId] = {
        baseUrl: configuration.summary.account.baseUrl || "https://www.cctq.ai",
        userId: configuration.summary.account.userId || "",
        token: "",
        initialTokens: configuration.summary.account.initialTokens || "0",
      };
    } else {
      const summary = configuration.summary.provider;
      configuration.drafts[sourceId] = { ...(summary.configured ? summary : CUSTOM_PROVIDER_DEFAULTS), apiKey: "" };
    }
    return configuration.drafts[sourceId];
  };

  const configurationField = (t, { name, label, value = "", type = "text", inputMode = "", placeholder = "", hint = "", required = false }) => {
    const field = document.createElement("label");
    field.className = "usage-config-field";
    const labelNode = document.createElement("span");
    labelNode.className = "usage-config-label";
    labelNode.textContent = label;
    const input = document.createElement("input");
    input.className = "usage-config-control";
    input.dataset.configField = name;
    input.name = name;
    input.type = type;
    if (inputMode) input.inputMode = inputMode;
    input.value = String(value ?? "");
    input.placeholder = placeholder;
    input.required = required;
    input.autocomplete = "off";
    input.spellcheck = false;
    const error = document.createElement("span");
    error.className = "usage-config-error";
    error.dataset.configError = name;
    error.id = `usage-config-error-${name}`;
    const hintNode = document.createElement("span");
    hintNode.className = "usage-config-hint";
    hintNode.id = `usage-config-hint-${name}`;
    hintNode.textContent = hint;
    input.setAttribute("aria-describedby", `${hint ? `${hintNode.id} ` : ""}${error.id}`);
    if (type === "password") {
      const wrapper = document.createElement("span");
      wrapper.className = "usage-config-secret-wrap";
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "usage-config-reveal";
      reveal.dataset.revealSecret = name;
      reveal.textContent = t.language === "en" ? "Show" : "显示";
      reveal.title = t.language === "en" ? "Show or hide credential" : "显示或隐藏凭据";
      reveal.setAttribute("aria-label", reveal.title);
      wrapper.append(input, reveal);
      field.append(labelNode, wrapper);
    } else {
      field.append(labelNode, input);
    }
    if (hint) field.append(hintNode);
    field.append(error);
    return field;
  };

  const createConfigurationForm = (source, t) => {
    const configuration = window[STATE_KEY]?.configuration;
    const draft = configurationDraft(source.id);
    const form = document.createElement("form");
    form.className = "usage-config-form";
    form.dataset.configSource = source.id;
    form.noValidate = true;
    if (source.accountType === "api-account") {
      form.append(
        configurationField(t, { name: "baseUrl", label: t("accountBaseUrl"), value: draft.baseUrl, required: true }),
        configurationField(t, { name: "userId", label: t("accountUserId"), value: draft.userId, required: true }),
        configurationField(t, {
          name: "token", label: t("accountToken"), value: draft.token, type: "password",
          placeholder: configuration?.summary.account.configured ? t("configuredSecretHint") : t("newSecretHint"),
          hint: configuration?.summary.account.configured ? t("storedCredentialNotice") : "",
        }),
        configurationField(t, {
          name: "initialTokens", label: t("accountTokenBaseline"), value: draft.initialTokens,
          inputMode: "numeric", hint: t("tokenBaselineHint"), required: true,
        }),
      );
    } else {
      const configured = Boolean(configuration?.summary.provider.configured);
      form.append(configurationField(t, {
        name: "apiKey", label: t("apiKeySecret"), value: draft.apiKey, type: "password",
        placeholder: configured ? t("configuredSecretHint") : t("newSecretHint"),
        hint: configured ? t("storedCredentialNotice") : "",
      }));
      const baseUrlField = () => configurationField(t, {
        name: "baseUrl", label: t("apiServiceUrl"), value: draft.baseUrl,
        placeholder: "https://api.example.com", hint: t("apiServiceUrlHint"), required: true,
      });
      const usagePathField = () => configurationField(t, {
        name: "usagePath", label: t("usagePath"), value: draft.usagePath,
        placeholder: "/v1/usage", hint: t("usagePathHint"), required: true,
      });
      if (!configured) form.append(baseUrlField(), usagePathField());
      const disclosure = document.createElement("details");
      disclosure.className = "usage-config-disclosure";
      const disclosureSummary = document.createElement("summary");
      disclosureSummary.textContent = configured ? t("connectionSettings") : t("advancedSettings");
      const advanced = document.createElement("div");
      advanced.className = "usage-config-advanced";
      if (configured) advanced.append(baseUrlField(), usagePathField());
      const advancedTitle = document.createElement("div");
      advancedTitle.className = "usage-config-advanced-title";
      advancedTitle.textContent = t("responseMapping");
      advanced.append(
        configurationField(t, { name: "statusPath", label: t("statusPath"), value: draft.statusPath }),
        configurationField(t, { name: "authHeader", label: t("authHeader"), value: draft.authHeader, required: true }),
        configurationField(t, { name: "authScheme", label: t("authScheme"), value: draft.authScheme }),
        advancedTitle,
      );
      for (const [name, label] of [
        ["usageRoot", t("usageRoot")], ["statusRoot", t("statusRoot")], ["used", t("usedField")],
        ["limit", t("limitField")], ["unlimited", t("unlimitedField")], ["expiresAt", t("expiresAtField")],
        ["quotaPerUnit", t("quotaPerUnitField")], ["currency", t("currencyField")],
        ["defaultQuotaPerUnit", t("defaultQuotaPerUnit")], ["defaultCurrency", t("defaultCurrency")],
      ]) advanced.append(configurationField(t, { name, label, value: draft[name], required: true }));
      disclosure.append(disclosureSummary, advanced);
      form.append(disclosure);
    }
    const status = document.createElement("div");
    status.className = "usage-config-status";
    status.setAttribute("role", configuration?.status?.kind === "error" ? "alert" : "status");
    status.setAttribute("aria-live", "polite");
    status.dataset.kind = configuration?.status?.kind || "idle";
    status.textContent = configuration?.status?.sourceId === source.id ? configuration.status.message : "";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "usage-config-submit";
    submit.disabled = Boolean(configuration?.pending);
    submit.textContent = configuration?.pending ? t("savingConfiguration") : t("saveConfiguration");
    form.append(status, submit);
    return form;
  };

  const validConfigurationUrl = (value) => {
    try {
      const url = new URL(value);
      const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
      return !url.username && !url.password && !url.search && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && local));
    } catch { return false; }
  };

  const validateConfiguration = (sourceId, draft, t) => {
    const configuration = window[STATE_KEY]?.configuration;
    const errors = {};
    if (!String(draft.baseUrl || "").trim()) errors.baseUrl = t("requiredField");
    else if (!validConfigurationUrl(String(draft.baseUrl).trim())) errors.baseUrl = t("invalidUrl");
    const secretName = sourceId === "api-account" ? "token" : "apiKey";
    const configured = sourceId === "api-account" ? configuration?.summary.account.configured : configuration?.summary.provider.configured;
    const secret = String(draft[secretName] || "");
    if (!secret && !configured) errors[secretName] = t("requiredField");
    else if (secret && (!/^[\x21-\x7E]+$/.test(secret) || secret.length > 16384)) errors[secretName] = t("invalidCredential");
    if (sourceId === "api-account") {
      if (!/^[1-9][0-9]{0,19}$/.test(String(draft.userId || ""))) errors.userId = t("invalidUserId");
      const baseline = String(draft.initialTokens || "").trim();
      if (!/^\d+$/.test(baseline) || baseline.length > 19 || (baseline.length === 19 && baseline > "9223372036854775807")) {
        errors.initialTokens = t("invalidTokenBaseline");
      }
    } else {
      for (const name of ["usagePath", "authHeader", "usageRoot", "statusRoot", "used", "limit", "unlimited", "expiresAt", "quotaPerUnit", "currency", "defaultQuotaPerUnit", "defaultCurrency"]) {
        if (!String(draft[name] || "").trim()) errors[name] = t("requiredField");
      }
    }
    return errors;
  };

  const render = (host, value, forceColumns = false) => {
    if (!host?.shadowRoot) return;
    const usage = normalizeUsage(value);
    const settings = loadSettings();
    if (settings.autoResume && usage.currentThreadId && !settings.autoResumeThreads[usage.currentThreadId]) {
      settings.autoResumeThreads[usage.currentThreadId] = {
        enabled: true,
        message: normalizeAutoResumeMessage(settings.autoResumeMessage),
      };
      settings.autoResume = false;
      saveSettings(settings);
    }
    const currentAutoResume = autoResumeForThread(settings, usage.currentThreadId);
    const t = createTranslator(settings.englishUi ? "en" : "zh");
    const currentContext = contextView(usage, settings, t);
    const apiKeySource = Object.values(usage.sources).find((item) => item.accountType === "api-key")
      || normalizeSource({ id: "api-key", label: "API Key", accountType: "api-key", status: "unavailable", error: "未配置 API key" }, "api-key");
    const sources = [
      usage.sources.session || normalizeSource({ id: "session", label: "本会话", accountType: "session", status: "unavailable" }, "session"),
      usage.sources.official || normalizeSource({ id: "official", label: "官方订阅", accountType: "subscription", status: "unavailable" }, "official"),
      usage.sources["reset-forecast"] || normalizeSource({ id: "reset-forecast", label: "重置概率预测（仅供参考）", accountType: "forecast", status: "unavailable", error: "重置概率预测接口暂不可用" }, "reset-forecast"),
      usage.sources["api-account"] || normalizeSource({ id: "api-account", label: "API 账户", accountType: "api-account", status: "unavailable", error: "未配置 API 账户令牌" }, "api-account"),
      { ...apiKeySource, label: "API Key" },
    ].map(selectableSource).map((source) => {
      const localizedStatus = source.status === "loading" ? t("loading") : source.status === "ready" ? t("ready")
        : source.status === "stale" ? t("stale") : source.status === "rate-limited" ? t("rateLimited")
          : source.status === "error" ? t("error") : t("unavailable");
      return {
        ...source,
        label: source.id === "session" ? t("session")
          : source.id === "official" ? t("official")
          : source.id === "reset-forecast" ? t("resetForecast")
          : source.accountType === "api-account" ? t("apiAccount")
            : source.accountType === "api-key" ? t("apiKey") : source.label,
        metrics: source.metrics.map((metric) => {
          const autoResumeValueKey = !currentAutoResume.enabled ? "autoResumeOff"
            : usage.autoResume.status === "waiting" ? "autoResumeWaitingValue"
              : usage.autoResume.status === "sending" ? "autoResumeSendingValue"
                : usage.autoResume.status === "sent" ? "autoResumeSentValue" : "autoResumeOn";
          const value = metric.id === "contextUsage" ? currentContext.value
            : metric.id === "autoResume" ? t(autoResumeValueKey)
            : metric.id === "executionTime" ? executionTimeDisplay(metric, t)
            : metric.id === "requestStatus" ? localizedStatus
            : metric.id.endsWith("Tokens") ? formatLocalizedTokenUnit(metric.value, t.language)
              : metric.value;
          return {
            ...metric,
            value,
            label: t.metric(metric.id, metric.label),
            display: `${t.compact(metric.id, metric.label)} ${value || "--"}`,
          };
        }),
      };
    });
    let settingsChanged = false;
    if (settings.unifiedMetricsVersion < 2) {
      if (Object.prototype.hasOwnProperty.call(settings.metrics, "official")) {
        const legacyOfficial = settings.metrics.official;
        if (!Object.prototype.hasOwnProperty.call(settings.metrics, "session")) {
          settings.metrics.session = legacyOfficial.filter((id) => SESSION_METRIC_IDS.has(id));
        }
        settings.metrics.official = legacyOfficial.filter((id) => !SESSION_METRIC_IDS.has(id));
        settings.metricOrder = [...new Set(settings.metricOrder.map((key) =>
          key.startsWith("official:") && SESSION_METRIC_IDS.has(key.slice(9)) ? `session:${key.slice(9)}` : key))];
      }
      settings.unifiedMetricsVersion = 2;
      settingsChanged = true;
    }
    const preferenceKeys = selectionPreferenceKeys(sources, settings);
    const preferenceSet = new Set(preferenceKeys);
    const normalizedOrder = [
      ...(settings.metricOrder || []).filter((key) => preferenceSet.has(key)),
      ...preferenceKeys.filter((key) => !(settings.metricOrder || []).includes(key)),
    ];
    if (JSON.stringify(settings.metricOrder) !== JSON.stringify(normalizedOrder)) {
      settings.metricOrder = normalizedOrder;
      settingsChanged = true;
    }
    let selected = orderedSelectedMetrics(sources, settings);
    const selectedLimit = selectedMetricLimit(settings);
    if (selected.length > selectedLimit) {
      selected = selected.slice(0, selectedLimit);
      settings.metricOrder = selected.map((item) => item.key);
      for (const source of sources) {
        settings.metrics[source.id] = selected.filter((item) => item.source.id === source.id).map((item) => item.metric.id);
      }
      settingsChanged = true;
    }
    if (settingsChanged) saveSettings(settings);
    host.dataset.density = summaryDensity(host, settings, selected.length);
    host.dataset.minimal = String(settings.minimalMode);
    host.dataset.summaryStyle = settings.summaryStyle;
    const shadow = host.shadowRoot;
    const refreshRing = shadow.querySelector(".usage-refresh-ring");
    if (refreshRing) refreshRing.hidden = !settings.countdownVisualization || selected.some(({ metric }) => metric.id === "contextUsage");
    const summaryRoot = shadow.querySelector(".usage-summary-items");
    if (summaryRoot) {
      const items = selected.length ? selected : [{ source: null, metric: { display: t("usageUnavailable") } }];
      summaryRoot.replaceChildren(...items.map(({ source, metric }) => {
        const item = document.createElement("span");
        item.className = "usage-summary-item";
        if (metric.id === "contextUsage") {
          item.classList.add("usage-summary-context");
          const mark = document.createElement("span");
          mark.className = "usage-context-mark";
          mark.textContent = TOPBAR_MARK;
          mark.setAttribute("aria-hidden", "true");
          const meter = document.createElement("span");
          meter.className = "usage-context-meter";
          const track = document.createElement("span");
          track.className = "usage-context-track";
          track.dataset.contextProgress = "true";
          track.setAttribute("role", "progressbar");
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", "100");
          const fill = document.createElement("span");
          fill.className = "usage-context-fill";
          track.append(fill);
          const percent = document.createElement("span");
          percent.className = "usage-context-percent";
          percent.dataset.contextPercent = "true";
          meter.append(track, percent);
          const text = document.createElement("span");
          text.className = "usage-context-label";
          text.dataset.contextSummary = "true";
          item.append(mark, meter, text);
        } else if (metric.id === "autoResume") {
          item.classList.add("usage-summary-auto-resume");
          if (!settings.minimalMode) item.append(document.createTextNode(t.compact("autoResume", metric.label)));
          const toggle = document.createElement("label");
          toggle.className = "usage-inline-toggle usage-summary-toggle";
          toggle.dataset.summarySetting = "autoResume";
          const toggleInput = document.createElement("input");
          toggleInput.type = "checkbox";
          toggleInput.dataset.setting = "autoResume";
          toggleInput.dataset.summarySetting = "autoResume";
          toggleInput.checked = currentAutoResume.enabled;
          toggleInput.disabled = !usage.currentThreadId;
          toggleInput.setAttribute("aria-label", t("autoResume"));
          const track = document.createElement("span");
          track.className = "usage-toggle-track";
          track.setAttribute("aria-hidden", "true");
          toggle.append(toggleInput, track);
          item.append(toggle);
        } else if (source) appendSummaryMetric(item, metric, source, settings, t, host.dataset.density);
        else item.textContent = metric.display;
        if (source) {
          item.dataset.source = source.id;
          item.dataset.metric = metric.id;
          item.title = `${source.label} · ${metric.label}：${metric.value || "--"}`;
        }
        return item;
      }));
    }
    shadow.querySelector(".usage-summary")?.setAttribute("aria-label", t("displayedItems", { count: selected.length }));
    shadow.querySelector(".usage-popover")?.setAttribute("aria-label", t("displaySettings"));
    const columns = shadow.querySelector(".usage-columns");
    if (columns && (forceColumns || !shadow.activeElement?.closest?.(".usage-config-form,.usage-auto-resume-field,.usage-context-card,.usage-style-setting"))) {
      const existingContextCard = shadow.querySelector(".usage-context-card");
      const visibleSources = sources.filter((source) => {
        if (["api-account", "api-key"].includes(source.accountType)) return settings.showApiColumns;
        if (source.accountType === "forecast") return settings.showResetForecast;
        return true;
      });
      host.dataset.apiColumns = String(settings.showApiColumns);
      host.dataset.resetForecast = String(settings.showResetForecast);
      host.dataset.columnCount = String(visibleSources.length);
      columns.style.setProperty("--usage-column-count", String(visibleSources.length));
      const selectedKeys = new Set(selected.map((item) => `${item.source.id}:${item.metric.id}`));
      columns.replaceChildren(...visibleSources.map((source) => {
        const column = document.createElement("section");
        column.className = "usage-column";
        column.dataset.status = source.status;
        column.dataset.source = source.id;
        const title = document.createElement("div");
        title.className = "usage-column-title";
        const status = document.createElement("span");
        status.className = "usage-status";
        const statusText = source.status === "loading" ? t("loading") : source.status === "ready" ? t("ready")
          : source.status === "stale" ? t("stale") : source.status === "rate-limited" ? t("rateLimited")
            : source.status === "error" ? t("error") : t("unavailable");
        status.title = source.error || statusText;
        status.setAttribute("aria-label", statusText);
        const heading = document.createElement("span");
        heading.className = "usage-column-heading";
        heading.textContent = source.label;
        title.append(status, heading);
        const configurable = ["api-account", "api-key"].includes(source.accountType);
        const configurationOpen = window[STATE_KEY]?.configuration?.openSourceId === source.id;
        if (configurable) {
          const configure = document.createElement("button");
          configure.type = "button";
          configure.className = "usage-config-trigger";
          configure.dataset.configureSource = source.id;
          configure.textContent = configurationOpen ? t("back") : t("configure");
          configure.setAttribute("aria-expanded", String(configurationOpen));
          title.append(configure);
        }
        const createRows = (metrics) => {
          const rows = document.createElement("div");
          rows.className = "usage-column-rows";
          const children = [];
          for (const metric of metrics) {
            const key = `${source.id}:${metric.id}`;
            const checked = selectedKeys.has(key);
            const row = document.createElement("div");
            row.className = "usage-detail-row";
            const select = document.createElement("label");
            select.className = "usage-detail-select";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.dataset.source = source.id;
            input.dataset.metric = metric.id;
            input.checked = checked;
            input.disabled = !checked && selected.length >= selectedLimit;
            const label = document.createElement("span");
            label.className = "usage-detail-label";
            label.textContent = metric.label;
            select.append(input, label);
            if (metric.id === "autoResume") {
              const statusKey = {
                waiting: "autoResumeWaiting",
                sending: "autoResumeSending",
                sent: "autoResumeSent",
              }[usage.autoResume.status] || "autoResumeIdle";
              const toggle = document.createElement("label");
              toggle.className = "usage-inline-toggle";
              toggle.title = t(statusKey);
              const toggleInput = document.createElement("input");
              toggleInput.type = "checkbox";
              toggleInput.dataset.setting = "autoResume";
              toggleInput.checked = currentAutoResume.enabled;
              toggleInput.disabled = !usage.currentThreadId;
              toggleInput.title = t(statusKey);
              toggleInput.setAttribute("aria-label", t("autoResume"));
              const track = document.createElement("span");
              track.className = "usage-toggle-track";
              track.setAttribute("aria-hidden", "true");
              toggle.append(toggleInput, track);
              row.append(select, toggle);
              children.push(row);

              const field = document.createElement("label");
              if (usage.autoResume.reason) {
                const error = document.createElement("div");
                error.className = "usage-auto-resume-error";
                error.setAttribute("role", "status");
                error.textContent = t(usage.autoResume.reason === "desktop-send-timeout" ? "autoResumeTimeout"
                  : ["desktop-request-client-unavailable", "codex-desktop-unavailable"].includes(usage.autoResume.reason) ? "autoResumeClientUnavailable" : "autoResumeSendFailed");
                children.push(error);
              }
              field.className = "usage-auto-resume-field";
              const fieldLabel = document.createElement("span");
              fieldLabel.className = "usage-auto-resume-label";
              fieldLabel.textContent = t("autoResumeMessage");
              const messageInput = document.createElement("input");
              messageInput.type = "text";
              messageInput.className = "usage-auto-resume-message";
              messageInput.dataset.settingText = "autoResumeMessage";
              messageInput.maxLength = MAX_AUTO_RESUME_MESSAGE_LENGTH;
              messageInput.value = currentAutoResume.message;
              messageInput.disabled = !usage.currentThreadId;
              messageInput.placeholder = AUTO_RESUME_DEFAULT_MESSAGE;
              messageInput.autocomplete = "off";
              messageInput.setAttribute("aria-label", t("autoResumeMessage"));
              field.append(fieldLabel, messageInput);
              children.push(field);
              const shared = document.createElement("label");
              shared.className = "usage-inline-toggle usage-shared-resume";
              const sharedLabel = document.createElement("span");
              sharedLabel.textContent = t("autoResumeSharedMessage");
              const sharedInput = document.createElement("input");
              sharedInput.type = "checkbox";
              sharedInput.dataset.setting = "autoResumeSharedMessage";
              sharedInput.checked = settings.autoResumeSharedMessage;
              sharedInput.setAttribute("aria-label", t("autoResumeSharedMessage"));
              const sharedTrack = document.createElement("span");
              sharedTrack.className = "usage-toggle-track";
              sharedTrack.setAttribute("aria-hidden", "true");
              shared.append(sharedLabel, sharedInput, sharedTrack);
              children.push(shared);
              continue;
            }
            const metricValueNode = document.createElement("span");
            metricValueNode.className = "usage-detail-value";
            if (metric.id === "executionTime") metricValueNode.dataset.durationValue = "true";
            if (metric.id === "contextUsage") metricValueNode.dataset.contextDetail = "true";
            const valueText = metric.value || "--";
            if (["primaryRemaining", "secondaryRemaining"].includes(metric.id)
              && finiteNumber(metric.resetsAt) && Number(metric.resetsAt) > 0) {
              const reset = document.createElement("span");
              reset.className = "usage-detail-reset";
              reset.textContent = t("resetsAt", { value: formatReset(metric.resetsAt) });
              metricValueNode.append(reset, document.createTextNode(` · ${valueText}`));
            } else metricValueNode.textContent = valueText;
            metricValueNode.title = metric.detail || metricValueNode.textContent;
            row.append(select, metricValueNode);
            children.push(row);
          }
          rows.replaceChildren(...children);
          return rows;
        };
        if (configurationOpen) {
          column.append(title, createConfigurationForm(source, t));
          return column;
        }
        column.append(title);
        if (source.id === "session") column.append(existingContextCard || createContextCard());
        column.append(createRows(source.metrics));
        if (source.accountType === "forecast") {
          const method = document.createElement("div");
          method.className = "usage-reset-method";
          method.textContent = t("resetMethod", { value: t(source.resetMethod === "banked"
            ? "resetMethodBanked" : source.resetMethod === "forced" ? "resetMethodForced" : "resetMethodUnknown") });
          method.title = t("resetMethodHint");
          column.append(method);
        }
        if (source.accountType === "forecast" && source.latestActivity) {
          const activity = document.createElement("article");
          activity.className = "usage-tibo-activity";
          const activityHead = document.createElement("div");
          activityHead.className = "usage-tibo-activity-head";
          const activityLabel = document.createElement("span");
          activityLabel.className = "usage-tibo-activity-label";
          activityLabel.textContent = t("latestFromTibo");
          const activityLink = document.createElement("a");
          activityLink.className = "usage-tibo-activity-link";
          activityLink.href = source.latestActivity.sourceUrl;
          activityLink.target = "_blank";
          activityLink.rel = "noreferrer";
          activityLink.textContent = t("openX");
          const activityText = document.createElement("div");
          activityText.className = "usage-tibo-activity-text";
          activityText.textContent = source.latestActivity.text;
          activityText.title = source.latestActivity.text;
          const activityTime = document.createElement("time");
          activityTime.className = "usage-tibo-activity-time";
          activityTime.dateTime = new Date(source.latestActivity.createdAt).toISOString();
          activityTime.textContent = t("publishedAt", { value: formatActivityTime(source.latestActivity.createdAt, t.language) });
          activityHead.append(activityLabel, activityLink);
          activity.append(activityHead, activityText, activityTime);
          column.append(activity);
        }
        if (source.id === "official") {
          const footer = document.createElement("div");
          footer.className = "usage-column-footer";
          const switches = document.createElement("div");
          switches.className = "usage-mode-switches";
          const styleSetting = document.createElement("label");
          styleSetting.className = "usage-style-setting";
          const styleLabel = document.createElement("span");
          styleLabel.textContent = t("summaryStyle");
          const styleSelect = document.createElement("select");
          styleSelect.dataset.setting = "summaryStyle";
          styleSelect.setAttribute("aria-label", t("summaryStyle"));
          for (const [value, textKey] of [["clear", "summaryStyleClear"], ["capsule", "summaryStyleCapsule"], ["stacked", "summaryStyleStacked"]]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = t(textKey);
            styleSelect.append(option);
          }
          styleSelect.value = settings.summaryStyle;
          styleSetting.append(styleLabel, styleSelect);
          switches.append(styleSetting);
          for (const [setting, labelText] of [
            ["minimalMode", t("minimalMode")],
            ["countdownVisualization", t("countdownVisualization")],
            ["refreshEvery30Seconds", t("refreshEvery30Seconds")],
            ["englishUi", t("englishUi")],
            ["contextReminders", t("contextReminders")],
            ["showApiColumns", t("showApiColumns")],
            ["showResetForecast", t("showResetForecast")],
          ]) {
            const toggle = document.createElement("label");
            toggle.className = "usage-mode-toggle";
            const toggleLabel = document.createElement("span");
            toggleLabel.textContent = labelText;
            const toggleInput = document.createElement("input");
            toggleInput.type = "checkbox";
            toggleInput.dataset.setting = setting;
            toggleInput.checked = Boolean(settings[setting]);
            toggleInput.setAttribute("aria-label", labelText);
            const track = document.createElement("span");
            track.className = "usage-toggle-track";
            track.setAttribute("aria-hidden", "true");
            toggle.append(toggleLabel, toggleInput, track);
            switches.append(toggle);
          }
          switches.hidden = host.dataset.settingsOpen !== "true";
          const meta = document.createElement("div");
          meta.className = "usage-column-meta";
          const settingsTrigger = document.createElement("button");
          settingsTrigger.type = "button";
          settingsTrigger.className = "usage-settings-trigger";
          settingsTrigger.dataset.toggleSettings = "true";
          settingsTrigger.textContent = t("settings");
          settingsTrigger.setAttribute("aria-expanded", String(host.dataset.settingsOpen === "true"));
          const maximum = document.createElement("span");
          maximum.textContent = settings.minimalMode
            ? t("minimalMaximum", { count: MAX_MINIMAL_SELECTED_METRICS })
            : t("maximum", { count: MAX_SELECTED_METRICS });
          const separator = document.createElement("span");
          separator.setAttribute("aria-hidden", "true");
          separator.textContent = "·";
          const countdown = document.createElement("span");
          countdown.className = "usage-refresh-countdown";
          countdown.textContent = t("refreshIn", { seconds: "--" });
          meta.append(settingsTrigger, maximum, separator, countdown);
          footer.append(switches, meta);
          column.append(footer);

          const brand = document.createElement("div");
          brand.className = "usage-column-brand";
          const product = document.createElement("span");
          product.className = "usage-brand-product";
          product.textContent = `${PRODUCT_NAME} v${VERSION}`;
          brand.append(product);
          column.append(brand);
        }
        return column;
      }));
    }
    updateCountdowns(host, usage);
    host.dataset.rendered = "true";
    const state = window[STATE_KEY];
    if (state?.host === host) state.ensure();
  };

  let preferredComposer = null;
  const ensure = () => {
    const state = window[STATE_KEY];
    if (preferredComposer && (!preferredComposer.isConnected || !isVisible(preferredComposer))) preferredComposer = null;
    const placement = findPlacement(HOST_ID, preferredComposer);
    if (!placement.composer) {
      clearPlacement();
      syncResizeTargets([]);
      document.getElementById(HOST_ID)?.remove();
      if (state) {
        state.host = null;
        state.health = { ok: false, reason: placement.reason, strategy: placement.strategy, checkedAt: Date.now() };
      }
      return null;
    }
    preferredComposer = placement.composer;
    let host = document.getElementById(HOST_ID);
    let created = false;
    if (!host?.shadowRoot) {
      host?.remove();
      host = document.createElement("span");
      host.id = HOST_ID;
      created = true;
      host.setAttribute("data-codex-usage-ui", "monitor");
      host.attachShadow({ mode: "open" }).innerHTML = `<style>${css}</style>${markup}`;
      const summary = host.shadowRoot.querySelector(".usage-summary");
      const toggleSummary = () => {
        const open = host.dataset.open !== "true";
        host.dataset.open = String(open);
        summary.setAttribute("aria-expanded", String(open));
        const popover = host.shadowRoot.querySelector(".usage-popover");
        if (popover) popover.hidden = !open;
        if (open) render(host, window[STATE_KEY]?.usage || window[USAGE_KEY]);
      };
      summary?.addEventListener("click", (event) => {
        if (event.target?.closest?.("[data-summary-setting]")) return;
        toggleSummary();
      });
      summary?.addEventListener("keydown", (event) => {
        if (event.target !== summary || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        toggleSummary();
      });
      host.shadowRoot.addEventListener("click", (event) => {
        const copy = event.target?.closest?.("[data-context-copy]");
        if (copy) {
          if (copy.dataset.copyPending === "true") return;
          const card = copy.closest(".usage-context-card");
          const t = createTranslator(loadSettings().englishUi ? "en" : "zh");
          const handoff = card.querySelector("[data-context-handoff]");
          const status = card.querySelector("[data-context-copy-status]");
          handoff.value = t("contextHandoffPrompt");
          copy.dataset.copyPending = "true";
          copy.setAttribute("aria-busy", "true");
          // Only this explicit click writes the clipboard. No files or chat
          // messages are created by the monitor.
          Promise.resolve().then(() => {
            if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
            return navigator.clipboard.writeText(handoff.value);
          }).then(() => {
            if (!card.isConnected) return;
            handoff.hidden = true;
            setText(status, t("contextCopied"));
          }).catch(() => {
            if (!card.isConnected || !loadSettings().contextReminders) return;
            handoff.hidden = false;
            setText(status, t("contextCopyFailed"));
            handoff.focus();
            handoff.select();
          }).finally(() => {
            delete copy.dataset.copyPending;
            copy.removeAttribute("aria-busy");
          });
          return;
        }
        const settingsTrigger = event.target?.closest?.("[data-toggle-settings]");
        if (settingsTrigger) {
          host.dataset.settingsOpen = String(host.dataset.settingsOpen !== "true");
          render(host, window[STATE_KEY]?.usage || window[USAGE_KEY], true);
          host.shadowRoot.querySelector("[data-toggle-settings]")?.focus();
          return;
        }
        const trigger = event.target?.closest?.("[data-configure-source]");
        if (trigger) {
          const state = window[STATE_KEY];
          if (!state?.configuration?.pending) {
            const sourceId = trigger.dataset.configureSource;
            state.configuration.openSourceId = state.configuration.openSourceId === sourceId ? null : sourceId;
            state.configuration.status = { sourceId, kind: "idle", message: "" };
            render(host, state.usage, true);
            if (state.configuration.openSourceId) {
              host.shadowRoot.querySelector(`[data-config-source="${sourceId}"] .usage-config-control`)?.focus();
            }
          }
          return;
        }
        const reveal = event.target?.closest?.("[data-reveal-secret]");
        if (reveal) {
          const input = host.shadowRoot.querySelector(`[data-config-field="${reveal.dataset.revealSecret}"]`);
          if (input instanceof HTMLInputElement) {
            input.type = input.type === "password" ? "text" : "password";
            const t = createTranslator(loadSettings().englishUi ? "en" : "zh");
            reveal.textContent = input.type === "password" ? (t.language === "en" ? "Show" : "显示") : (t.language === "en" ? "Hide" : "隐藏");
          }
        }
      });
      host.shadowRoot.addEventListener("input", (event) => {
        const control = event.target;
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
        const form = control.closest("[data-config-source]");
        if (!form || !control.dataset.configField) return;
        const state = window[STATE_KEY];
        if (!state?.configuration) return;
        const sourceId = form.dataset.configSource;
        const draft = configurationDraft(sourceId);
        draft[control.dataset.configField] = control.value;
        control.removeAttribute("aria-invalid");
        setText(form.querySelector(`[data-config-error="${control.dataset.configField}"]`), "");
      });
      host.shadowRoot.addEventListener("submit", (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.dataset.configSource) return;
        event.preventDefault();
        const state = window[STATE_KEY];
        if (!state?.configuration || state.configuration.pending) return;
        const sourceId = form.dataset.configSource;
        const draft = configurationDraft(sourceId);
        const t = createTranslator(loadSettings().englishUi ? "en" : "zh");
        const errors = validateConfiguration(sourceId, draft, t);
        for (const control of form.querySelectorAll("[data-config-field]")) {
          const message = errors[control.dataset.configField] || "";
          control.setAttribute("aria-invalid", String(Boolean(message)));
          setText(form.querySelector(`[data-config-error="${control.dataset.configField}"]`), message);
        }
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) {
          firstInvalid.closest("details")?.setAttribute("open", "");
          firstInvalid.focus();
          return;
        }
        if (typeof window[CONFIGURATION_BINDING] !== "function") {
          state.configuration.status = { sourceId, kind: "error", message: t("configurationUnavailable") };
          render(host, state.usage, true);
          return;
        }
        const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const type = sourceId === "api-account" ? "api-account" : "api-key";
        const request = type === "api-account"
          ? {
              requestId, type, baseUrl: draft.baseUrl.trim(), userId: draft.userId.trim(), token: draft.token,
              initialTokens: draft.initialTokens.trim(),
            }
          : {
              requestId, type, apiKey: draft.apiKey,
              provider: {
                id: /^[a-z0-9][a-z0-9_-]{0,31}$/.test(draft.id || "") ? draft.id : "custom",
                label: "API Key",
                baseUrl: draft.baseUrl.trim(), usagePath: draft.usagePath,
                statusPath: draft.statusPath, authHeader: draft.authHeader, authScheme: draft.authScheme,
                usageRoot: draft.usageRoot, statusRoot: draft.statusRoot, used: draft.used, limit: draft.limit,
                unlimited: draft.unlimited, expiresAt: draft.expiresAt, quotaPerUnit: draft.quotaPerUnit,
                currency: draft.currency, defaultQuotaPerUnit: Number(draft.defaultQuotaPerUnit),
                defaultCurrency: draft.defaultCurrency,
              },
            };
        state.configuration.pending = requestId;
        state.configuration.status = { sourceId, kind: "idle", message: t("savingConfiguration") };
        render(host, state.usage, true);
        try { window[CONFIGURATION_BINDING](JSON.stringify(request)); }
        catch {
          state.configuration.pending = null;
          state.configuration.status = { sourceId, kind: "error", message: t("configurationUnavailable") };
          render(host, state.usage, true);
        }
      });
      host.shadowRoot.addEventListener("change", (event) => {
        const input = event.target;
        if (input instanceof HTMLSelectElement && input.dataset.setting === "summaryStyle") {
          const settings = loadSettings();
          settings.summaryStyle = normalizeSummaryStyle(input.value);
          saveSettings(settings);
          const state = window[STATE_KEY];
          render(host, state?.usage || window[USAGE_KEY]);
          input.value = settings.summaryStyle;
          state?.ensure();
          return;
        }
        if (!(input instanceof HTMLInputElement)) return;
        if (input.dataset.settingText === "autoResumeMessage") {
          const settings = loadSettings();
          const usage = normalizeUsage(window[STATE_KEY]?.usage || window[USAGE_KEY]);
          if (!usage.currentThreadId) return;
          const current = autoResumeForThread(settings, usage.currentThreadId);
          const message = normalizeAutoResumeMessage(input.value);
          if (settings.autoResumeSharedMessage) settings.autoResumeMessage = message;
          else settings.autoResumeThreads[usage.currentThreadId] = { enabled: current.enabled, message };
          input.value = message;
          saveSettings(settings);
          return;
        }
        if (input.type !== "checkbox") return;
        const state = window[STATE_KEY];
        const usage = normalizeUsage(state?.usage || window[USAGE_KEY]);
        if (["minimalMode", "countdownVisualization", "refreshEvery30Seconds", "englishUi", "updateNotifications", "contextReminders", "autoResume", "autoResumeSharedMessage", "showApiColumns", "showResetForecast"].includes(input.dataset.setting)) {
          const settings = loadSettings();
          if (input.dataset.setting === "autoResume") {
            if (!usage.currentThreadId) return;
            settings.autoResumeThreads[usage.currentThreadId] = { enabled: input.checked,
              message: normalizeAutoResumeMessage(settings.autoResumeThreads[usage.currentThreadId]?.message ?? settings.autoResumeMessage) };
            settings.autoResume = false;
          } else if (input.dataset.setting === "autoResumeSharedMessage") {
            if (settings.autoResumeSharedMessage && !input.checked) {
              const message = normalizeAutoResumeMessage(settings.autoResumeMessage);
              for (const config of Object.values(settings.autoResumeThreads)) config.message = message;
              if (usage.currentThreadId && !settings.autoResumeThreads[usage.currentThreadId]) {
                settings.autoResumeThreads[usage.currentThreadId] = { enabled: false, message };
              }
            }
            settings.autoResumeSharedMessage = input.checked;
          } else settings[input.dataset.setting] = input.checked;
          if (input.dataset.setting === "showApiColumns" && !input.checked && state?.configuration) {
            state.configuration.openSourceId = null;
          }
          saveSettings(settings);
          render(host, usage);
          return;
        }
        if (!input.dataset.metric || !input.dataset.source) return;
        const rawSource = usage.sources[input.dataset.source]
          || (input.dataset.source === "api-key" ? Object.values(usage.sources).find((item) => item.accountType === "api-key") : null);
        if (!rawSource) return;
        const source = selectableSource(rawSource);
        const settings = loadSettings();
        const current = selectedMetrics(source, settings).map((item) => item.id);
        const selectedCount = Object.values(usage.sources)
          .map(selectableSource)
          .reduce((count, candidate) => count + selectedMetrics(candidate, settings).length, 0);
        if (input.checked && selectedCount >= selectedMetricLimit(settings)) {
          input.checked = false;
          return;
        }
        let next = input.checked
          ? [...new Set([...current, input.dataset.metric])]
          : current.filter((id) => id !== input.dataset.metric);
        settings.metrics[source.id] = next;
        const key = metricSelectionKey(source.id, input.dataset.metric);
        settings.metricOrder = (settings.metricOrder || []).filter((item) => item !== key);
        if (input.checked) settings.metricOrder.push(key);
        saveSettings(settings);
        render(host, usage);
      });
    }
    const portal = document.body || placement.composer.parentElement;
    const moved = host.parentElement !== portal;
    if (moved) portal.appendChild(host);
    const currentSettings = loadSettings();
    host.dataset.apiColumns = String(currentSettings.showApiColumns);
    host.dataset.resetForecast = String(currentSettings.showResetForecast);
    host.dataset.columnCount = String(2 + (currentSettings.showApiColumns ? 2 : 0) + (currentSettings.showResetForecast ? 1 : 0));
    const position = configurePosition(host, placement.composer, HOST_ID, fitSummary);
    syncResizeTargets([host, host.shadowRoot.querySelector(".usage-summary-items"), ...(position.observedNodes || [])]);
    host.dataset.placementStrategy = placement.strategy;
    host.dataset.status = position.ok ? "ready" : "degraded";
    if (state) {
      state.host = host;
      state.health = {
        ok: position.ok,
        reason: position.reason,
        strategy: placement.strategy,
        anchor: position.anchor,
        availableWidth: position.availableWidth,
        checkedAt: Date.now(),
      };
    }
    if (created || moved || host.dataset.rendered !== "true") render(host, state?.usage || window[USAGE_KEY]);
    return host;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, PLACEMENT_DEBOUNCE_MS);
  };
  const observer = new MutationObserver(scheduleEnsure);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleEnsure) : null;
  const resizeTargets = new Set();
  const syncResizeTargets = (nodes) => {
    if (!resizeObserver) return;
    const next = new Set(nodes.filter((node) => node?.isConnected));
    for (const node of resizeTargets) if (!next.has(node)) {
      resizeObserver.unobserve(node);
      resizeTargets.delete(node);
    }
    for (const node of next) if (!resizeTargets.has(node)) {
      resizeObserver.observe(node);
      resizeTargets.add(node);
    }
  };
  const observerTarget = document.documentElement || document;
  observer.observe(observerTarget, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "aria-label", "placeholder", "data-placeholder",
      "data-above-composer-conversation-id", "data-conversation-id", "data-thread-id"],
  });
  const timer = setInterval(() => {
    if (!document.hidden) ensure();
  }, LAYOUT_FALLBACK_INTERVAL_MS);
  const countdownTimer = setInterval(() => {
    if (document.hidden) return;
    const state = window[STATE_KEY];
    if (state?.host) updateCountdowns(state.host, state.usage);
  }, COUNTDOWN_INTERVAL_MS);
  const resizeHandler = scheduleEnsure;
  const visibilityHandler = () => {
    if (document.hidden) return;
    ensure();
    const state = window[STATE_KEY];
    if (state?.host) updateCountdowns(state.host, state.usage);
  };
  const outsideHandler = (event) => {
    const host = document.getElementById(HOST_ID);
    if (!host || host.dataset.open !== "true" || host.contains(event.target)) return;
    host.dataset.open = "false";
    host.shadowRoot?.querySelector(".usage-summary")?.setAttribute("aria-expanded", "false");
    const popover = host.shadowRoot?.querySelector(".usage-popover");
    if (popover) popover.hidden = true;
  };
  window.addEventListener("resize", resizeHandler, { passive: true });
  window.addEventListener("pointerdown", outsideHandler, true);
  document.addEventListener("visibilitychange", visibilityHandler);

  window[STATE_KEY] = {
    observer,
    resizeObserver,
    timer,
    countdownTimer,
    scheduler,
    resizeHandler,
    visibilityHandler,
    outsideHandler,
    host: null,
    health: { ok: false, reason: "initializing", strategy: "none", checkedAt: Date.now() },
    usage: normalizeUsage(previousUsage),
    configuration: {
      summary: normalizeConfigurationSummary(window[CONFIGURATION_KEY]),
      openSourceId: null,
      drafts: {},
      pending: null,
      status: { sourceId: null, kind: "idle", message: "" },
    },
    ensure,
    diagnose() { return { ...this.health }; },
    getSettings() { return loadSettings(); },
    updateUsage(value) {
      const usage = preserveMetricsWhileLoading(this.usage, normalizeUsage(value));
      this.usage = usage;
      window[USAGE_KEY] = usage;
      const host = ensure();
      if (host) render(host, usage);
      return true;
    },
    configurationResult(requestId, result) {
      if (!this.configuration.pending || requestId !== this.configuration.pending) return false;
      const sourceId = this.configuration.openSourceId;
      const t = createTranslator(loadSettings().englishUi ? "en" : "zh");
      this.configuration.pending = null;
      if (result?.ok) {
        this.configuration.summary = normalizeConfigurationSummary(result.configuration || this.configuration.summary);
        if (this.configuration.drafts[sourceId]) {
          this.configuration.drafts[sourceId].token = "";
          this.configuration.drafts[sourceId].apiKey = "";
        }
        this.configuration.status = { sourceId, kind: "success", message: t("configurationSaved") };
      } else {
        const detail = typeof result?.message === "string" ? result.message.slice(0, 240) : t("configurationFailed");
        this.configuration.status = { sourceId, kind: "error", message: detail };
      }
      const host = ensure();
      if (host) render(host, this.usage, true);
      return true;
    },
    cleanup() {
      for (const draft of Object.values(this.configuration?.drafts || {})) {
        if (draft && typeof draft === "object") { draft.token = ""; draft.apiKey = ""; }
      }
      observer.disconnect();
      resizeObserver?.disconnect();
      resizeTargets.clear();
      clearInterval(timer);
      clearInterval(countdownTimer);
      if (scheduler.timeout) clearTimeout(scheduler.timeout);
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("pointerdown", outsideHandler, true);
      document.removeEventListener("visibilitychange", visibilityHandler);
      document.getElementById(HOST_ID)?.remove();
      clearPlacement();
      delete window[USAGE_KEY];
      delete window[STATE_KEY];
      delete window.__CODEX_USAGE_MONITOR_MODULES__;
      return true;
    },
  };
  window[USAGE_KEY] = window[STATE_KEY].usage;
  const host = ensure();
  return {
    installed: Boolean(host),
    mode: "monitor-only",
    anchoredToApproval: Boolean(host && host.dataset.anchor === "approval"),
  };
})()
