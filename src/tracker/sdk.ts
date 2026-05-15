/* eslint-disable */
// InsightFlare browser tracker SDK
// Compiled at build time; config placeholders replaced at serve time via script-endpoint.

// ── Config placeholders (replaced at serve time) ──
const SITE_ID = "__IF_SITE_ID__";
const IS_EU_MODE = "__IF_IS_EU_MODE__";
const TRACK_QUERY_PARAMS = "__IF_TRACK_QUERY_PARAMS__";
const TRACK_HASH = "__IF_TRACK_HASH__";
const IGNORE_DO_NOT_TRACK = "__IF_IGNORE_DO_NOT_TRACK__";
const AUTO_TRACK_OUTBOUND_LINKS = "__IF_AUTO_TRACK_OUTBOUND_LINKS__";
const PERFORMANCE_SAMPLE_RATE = "__IF_PERFORMANCE_SAMPLE_RATE__";
const SESSION_WINDOW_MS = "__IF_SESSION_WINDOW_MS__";

// ── Static constants ──
const INSTALL_KEY = "__insightflare_tracker_v6__";
const VISITOR_KEY = "__insightflare_visitor_" + SITE_ID + "__";
const SESSION_KEY = "__insightflare_session_" + SITE_ID + "__";
const SESSION_ACTIVITY_KEY =
  "__insightflare_session_activity_" + SITE_ID + "__";
const ROUTE_SETTLE_DELAY_MS = 300;
const UA_CLIENT_HINT_TIMEOUT_MS = 200;
const UA_CLIENT_HINT_KEYS: string[] = [
  "fullVersionList",
  "platformVersion",
  "model",
  "formFactors",
];

// ── Build-time flags (replaced by esbuild define) ──
declare var BUILD_PERFORMANCE: boolean;

// ── State variables ──
let currentVisit: {
  id: string;
  startedAt: number;
  href: string;
  routeKey: string;
  referrerUrl: string;
  eventSequence: number;
} | null = null;
let pendingRouteChange: {
  href: string;
  referrerUrl: string;
  transitionAt: number;
  routeKey: string;
} | null = null;
let routeChangeTimer = 0;
let leaveSent = false;
let userIdentifiedId = "";
let userIdentifiedName = "";
let globalProperties: Record<string, unknown> = {};
let trackedOnce: Set<string> = new Set();
let debugEnabled = false;
let uaClientHints: unknown = null;
let uaClientHintsSettled = false;
let performanceVisitId = "";
let performanceSampled = false;
let performanceCollectionStarted = false;
let performanceObserverCleanups: Array<() => void> = [];
const interactionDurations = new Map<number, number>();
const performanceMetrics: {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number;
  inp: number;
} = {
  ttfb: null,
  fcp: null,
  lcp: null,
  cls: 0,
  inp: 0,
};

// ── Entry guard ──
const scriptEl = document.currentScript;
if (!scriptEl || !(scriptEl instanceof HTMLScriptElement) || !scriptEl.src) {
  throw new Error("InsightFlare: script element not found");
}

if (!(IGNORE_DO_NOT_TRACK as unknown as string)) {
  const dnt = String(navigator.doNotTrack || "")
    .trim()
    .toLowerCase();
  if (dnt === "1" || dnt === "yes") {
    throw new Error("InsightFlare: Do Not Track enabled");
  }
}

if ((window as any)[INSTALL_KEY]) {
  throw new Error("InsightFlare: already installed");
}

const scriptUrl = new URL(scriptEl.src);
const collectUrl = new URL("/collect", scriptUrl.origin).toString();
const visitorId = IS_EU_MODE ? "" : loadOrCreateVisitorId();
let sessionId = loadOrCreateSessionId(Date.now());

// ── Visitor / Session ──

function loadOrCreateVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, next);
  return next;
}

function loadOrCreateSessionId(now: number): string {
  const lastActivityRaw = Number(
    window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || "0",
  );
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (
    existing &&
    Number.isFinite(lastActivityRaw) &&
    now - lastActivityRaw <= (SESSION_WINDOW_MS as unknown as number)
  ) {
    window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
    return existing;
  }
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, next);
  window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
  return next;
}

function touchSession(now: number): string {
  sessionId = loadOrCreateSessionId(now);
  return sessionId;
}

// ── UA Client Hints ──

interface UaBrandVersion {
  brand: string;
  version: string;
}

interface UaClientHintsResult {
  brands?: UaBrandVersion[];
  fullVersionList?: UaBrandVersion[];
  mobile?: boolean;
  platform?: string;
  platformVersion?: string;
  model?: string;
  formFactors?: string[];
}

function normalizeUaBrandVersionList(input: unknown): UaBrandVersion[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const brand = String((item as any).brand || "")
        .trim()
        .slice(0, 80);
      const version = String((item as any).version || "")
        .trim()
        .slice(0, 80);
      if (!brand || !version) return null;
      return { brand, version } as UaBrandVersion;
    })
    .filter(Boolean) as UaBrandVersion[];
}

function normalizeUaStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((item: unknown) =>
      String(item || "")
        .trim()
        .slice(0, 40),
    )
    .filter(Boolean);
}

function normalizeUaClientHints(input: unknown): UaClientHintsResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as any;
  const hints: UaClientHintsResult = {};
  const brands = normalizeUaBrandVersionList(obj.brands);
  const fullVersionList = normalizeUaBrandVersionList(obj.fullVersionList);
  const formFactors = normalizeUaStringList(obj.formFactors);
  const platform = String(obj.platform || "")
    .trim()
    .slice(0, 80);
  const platformVersion = String(obj.platformVersion || "")
    .trim()
    .slice(0, 80);
  const model = String(obj.model || "")
    .trim()
    .slice(0, 120);
  if (brands.length > 0) hints.brands = brands;
  if (fullVersionList.length > 0) hints.fullVersionList = fullVersionList;
  if (typeof obj.mobile === "boolean") hints.mobile = obj.mobile;
  if (platform) hints.platform = platform;
  if (platformVersion) hints.platformVersion = platformVersion;
  if (model) hints.model = model;
  if (formFactors.length > 0) hints.formFactors = formFactors;
  return Object.keys(hints).length > 0 ? hints : null;
}

function readUaClientHints(): Promise<UaClientHintsResult | null> {
  const uaData = (navigator as any).userAgentData;
  if (!uaData || typeof uaData !== "object") return Promise.resolve(null);
  const lowEntropy: any = {
    brands: uaData.brands,
    mobile: uaData.mobile,
    platform: uaData.platform,
  };
  if (typeof uaData.getHighEntropyValues !== "function") {
    return Promise.resolve(normalizeUaClientHints(lowEntropy));
  }
  return uaData
    .getHighEntropyValues(UA_CLIENT_HINT_KEYS)
    .then((values: any) => normalizeUaClientHints({ ...lowEntropy, ...values }))
    .catch(() => normalizeUaClientHints(lowEntropy));
}

const uaClientHintsReady: Promise<UaClientHintsResult | null> =
  readUaClientHints()
    .then((hints) => {
      uaClientHints = hints;
      uaClientHintsSettled = true;
      return hints;
    })
    .catch(() => {
      uaClientHints = null;
      uaClientHintsSettled = true;
      return null;
    });

function withUaClientHints(payload: any): any {
  if (!uaClientHints) return payload;
  return {
    ...payload,
    uaClientHints,
  };
}

// ── Core utilities ──

function routeKey(href: string): string {
  const url = new URL(href, window.location.href);
  return [
    url.pathname || "/",
    (TRACK_QUERY_PARAMS as unknown as string) ? url.search || "" : "",
    (TRACK_HASH as unknown as string) ? url.hash || "" : "",
  ].join("|");
}

function pagePayloadBase(
  href: string,
  referrerUrl: string,
  startedAt: number,
  eventAt: number,
): any {
  const url = new URL(href, window.location.href);
  const currentSessionId = touchSession(eventAt);
  return {
    siteId: SITE_ID,
    visitId: currentVisit!.id,
    sessionId: currentSessionId,
    timestamp: eventAt,
    startedAt,
    pathname: url.pathname || "/",
    query: (TRACK_QUERY_PARAMS as unknown as string) ? url.search || "" : "",
    hash: (TRACK_HASH as unknown as string) ? url.hash || "" : "",
    hostname: url.hostname || "",
    title: document.title || "",
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screenWidth: (window.screen as any)?.width ?? null,
    screenHeight: (window.screen as any)?.height ?? null,
    referrerUrl: String(referrerUrl || ""),
    visitorId,
    utmSource: (TRACK_QUERY_PARAMS as unknown as string)
      ? url.searchParams.get("utm_source") || ""
      : "",
    utmMedium: (TRACK_QUERY_PARAMS as unknown as string)
      ? url.searchParams.get("utm_medium") || ""
      : "",
    utmCampaign: (TRACK_QUERY_PARAMS as unknown as string)
      ? url.searchParams.get("utm_campaign") || ""
      : "",
    utmTerm: (TRACK_QUERY_PARAMS as unknown as string)
      ? url.searchParams.get("utm_term") || ""
      : "",
    utmContent: (TRACK_QUERY_PARAMS as unknown as string)
      ? url.searchParams.get("utm_content") || ""
      : "",
    ...(userIdentifiedId
      ? { userId: userIdentifiedId, userName: userIdentifiedName }
      : {}),
  };
}

function send(payload: any, useBeacon: boolean): void {
  let body = "";
  try {
    body = JSON.stringify(withUaClientHints(payload));
  } catch {
    return;
  }
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(
      collectUrl,
      new Blob([body], { type: "application/json" }),
    );
    return;
  }

  fetch(collectUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    mode: "cors",
    credentials: "omit",
    keepalive: useBeacon,
  }).catch(() => {});
}

function sendWhenUaClientHintsReady(payload: any, useBeacon: boolean): void {
  if (useBeacon || uaClientHintsSettled) {
    send(payload, useBeacon);
    return;
  }

  let sent = false;
  const flush = () => {
    if (sent) return;
    sent = true;
    send(payload, useBeacon);
  };
  uaClientHintsReady.then(flush, flush);
  window.setTimeout(flush, UA_CLIENT_HINT_TIMEOUT_MS);
}

// ── Performance metrics ──

function roundMetric(value: number): number | null {
  if (!BUILD_PERFORMANCE) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

function shouldSamplePerformance(): boolean {
  if (!BUILD_PERFORMANCE) return false;
  return (
    (PERFORMANCE_SAMPLE_RATE as unknown as number) > 0 &&
    Math.random() * 100 < (PERFORMANCE_SAMPLE_RATE as unknown as number)
  );
}

function updatePerformanceMetric(
  metric: "ttfb" | "fcp" | "lcp" | "cls" | "inp",
  value: number,
): void {
  if (!BUILD_PERFORMANCE) return;
  const next = roundMetric(value);
  if (next === null) return;
  performanceMetrics[metric] = next;
}

function observePerformanceEntry(
  type: string,
  options: PerformanceObserverInit,
  onEntries: (entries: PerformanceEntryList) => void,
): void {
  if (!BUILD_PERFORMANCE) return;
  if (typeof PerformanceObserver !== "function") return;
  const supportedTypes = Array.isArray(PerformanceObserver.supportedEntryTypes)
    ? PerformanceObserver.supportedEntryTypes
    : [];
  if (supportedTypes.length > 0 && !supportedTypes.includes(type)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      onEntries(list.getEntries());
    });
    observer.observe(options);
    performanceObserverCleanups.push(() => observer.disconnect());
  } catch {
    // ignore unsupported entry types
  }
}

function startPerformanceCollection(visitId: string): void {
  if (!BUILD_PERFORMANCE) return;
  if (performanceCollectionStarted) return;
  performanceCollectionStarted = true;
  performanceVisitId = visitId;
  performanceSampled = shouldSamplePerformance();
  if (!performanceSampled) return;

  try {
    const navigationEntry = (performance as any).getEntriesByType(
      "navigation",
    )[0];
    if (navigationEntry) {
      updatePerformanceMetric("ttfb", navigationEntry.responseStart);
    }
  } catch {
    // ignore
  }

  observePerformanceEntry(
    "paint",
    { type: "paint", buffered: true },
    (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint") {
          updatePerformanceMetric("fcp", entry.startTime);
        }
      }
    },
  );

  observePerformanceEntry(
    "largest-contentful-paint",
    { type: "largest-contentful-paint", buffered: true },
    (entries) => {
      const latest = entries[entries.length - 1];
      if (latest) {
        updatePerformanceMetric("lcp", latest.startTime);
      }
    },
  );

  observePerformanceEntry(
    "layout-shift",
    { type: "layout-shift", buffered: true },
    (entries) => {
      for (const entry of entries as any[]) {
        if (entry && !entry.hadRecentInput) {
          performanceMetrics.cls =
            roundMetric((performanceMetrics.cls || 0) + (entry as any).value) ||
            0;
        }
      }
    },
  );

  observePerformanceEntry(
    "event",
    { type: "event", buffered: true, durationThreshold: 40 } as any,
    (entries) => {
      for (const entry of entries as any[]) {
        const interactionId = Number(entry.interactionId || 0);
        const duration = Number(entry.duration || 0);
        if (!Number.isFinite(duration) || duration < 0) continue;
        if (interactionId > 0) {
          const previous = interactionDurations.get(interactionId) || 0;
          const next = Math.max(previous, duration);
          interactionDurations.set(interactionId, next);
          updatePerformanceMetric(
            "inp",
            Math.max(performanceMetrics.inp || 0, next),
          );
          continue;
        }
        updatePerformanceMetric(
          "inp",
          Math.max(performanceMetrics.inp || 0, duration),
        );
      }
    },
  );
}

function stopPerformanceCollection(): void {
  if (!BUILD_PERFORMANCE) return;
  for (const cleanup of performanceObserverCleanups) {
    try {
      cleanup();
    } catch {
      // ignore
    }
  }
  performanceObserverCleanups = [];
}

function buildPerformancePayload(): {
  performanceVisitId: string;
  performance: {
    ttfb: number;
    fcp: number;
    lcp: number;
    cls: number;
    inp: number;
  };
} | null {
  if (!BUILD_PERFORMANCE) return null;
  if (!performanceSampled || !performanceVisitId) return null;
  return {
    performanceVisitId,
    performance: {
      ttfb: performanceMetrics.ttfb ?? 0,
      fcp: performanceMetrics.fcp ?? 0,
      lcp: performanceMetrics.lcp ?? 0,
      cls: performanceMetrics.cls ?? 0,
      inp: performanceMetrics.inp ?? 0,
    },
  };
}

// ── Visit lifecycle ──

function startVisit(
  href: string,
  referrerUrl: string,
  startedAt: number,
): void {
  leaveSent = false;
  currentVisit = {
    id: crypto.randomUUID(),
    startedAt,
    href,
    routeKey: routeKey(href),
    referrerUrl,
    eventSequence: 0,
  };

  if (BUILD_PERFORMANCE && !performanceVisitId) {
    startPerformanceCollection(currentVisit.id);
  }

  if (debugEnabled) {
    console.log(
      "[InsightFlare]",
      "pageview:",
      new URL(currentVisit.href, window.location.href).pathname || "/",
    );
  }
  sendWhenUaClientHintsReady(
    {
      ...pagePayloadBase(
        currentVisit.href,
        currentVisit.referrerUrl,
        currentVisit.startedAt,
        currentVisit.startedAt,
      ),
      kind: "pageview",
    },
    false,
  );
}

function sendLeave(): void {
  if (!currentVisit || leaveSent) return;
  leaveSent = true;
  const eventAt = Date.now();
  const url = new URL(currentVisit.href, window.location.href);
  const performancePayload = BUILD_PERFORMANCE
    ? buildPerformancePayload()
    : null;
  send(
    {
      kind: "leave",
      siteId: SITE_ID,
      visitId: currentVisit.id,
      sessionId,
      timestamp: eventAt,
      durationMs: Math.max(0, eventAt - currentVisit.startedAt),
      pathname: url.pathname || "/",
      hostname: url.hostname || "",
      ...(performancePayload || {}),
    },
    true,
  );
  if (BUILD_PERFORMANCE) stopPerformanceCollection();
}

function commitRouteChange(routeChange: {
  href: string;
  referrerUrl: string;
  transitionAt: number;
  routeKey: string;
}): void {
  pendingRouteChange = null;
  routeChangeTimer = 0;
  const nextKey = routeKey(routeChange.href);
  if (!currentVisit || nextKey === currentVisit.routeKey) return;
  startVisit(
    routeChange.href,
    routeChange.referrerUrl,
    routeChange.transitionAt,
  );
}

function flushPendingRouteChange(): void {
  if (!pendingRouteChange) return;
  if (routeChangeTimer) {
    clearTimeout(routeChangeTimer);
    routeChangeTimer = 0;
  }
  commitRouteChange(pendingRouteChange);
}

function scheduleRouteChange(nextHref: string, nextReferrerUrl: string): void {
  const nextKey = routeKey(nextHref);
  if (!currentVisit || nextKey === currentVisit.routeKey) return;
  pendingRouteChange = {
    href: nextHref,
    referrerUrl: nextReferrerUrl,
    transitionAt: Date.now(),
    routeKey: nextKey,
  };
  if (routeChangeTimer) {
    clearTimeout(routeChangeTimer);
  }
  routeChangeTimer = window.setTimeout(() => {
    if (pendingRouteChange) {
      commitRouteChange(pendingRouteChange);
    }
  }, ROUTE_SETTLE_DELAY_MS);
}

function wrapHistoryMethod(methodName: "pushState" | "replaceState"): void {
  const original = history[methodName] as
    | ((...args: any[]) => void)
    | undefined;
  if (!original) return;
  history[methodName] = function (this: any, ...args: any[]) {
    const result = original.apply(this, args);
    queueMicrotask(() => {
      scheduleRouteChange(
        window.location.href,
        currentVisit?.href || document.referrer || "",
      );
    });
    return result;
  } as any;
}

// ── Public API ──

function identify(userId: string, opts?: { name?: string }): void {
  if (!currentVisit) return;
  const id = String(userId || "")
    .trim()
    .slice(0, 255);
  if (!id) return;
  const name = String(
    (opts && typeof opts === "object" && typeof opts.name === "string"
      ? opts.name
      : "") || "",
  )
    .trim()
    .slice(0, 255);
  userIdentifiedId = id;
  userIdentifiedName = name;
  if (debugEnabled) {
    console.log(
      "[InsightFlare]",
      "identify:",
      JSON.stringify(id),
      name ? JSON.stringify(name) : "",
    );
  }
  flushPendingRouteChange();
  send(
    {
      ...pagePayloadBase(
        currentVisit.href,
        currentVisit.referrerUrl,
        currentVisit.startedAt,
        Date.now(),
      ),
      kind: "identify",
      userId: id,
      userName: name || "",
    },
    false,
  );
}

function setGlobalProperties(props: Record<string, unknown>): void {
  if (!props || typeof props !== "object" || Array.isArray(props)) return;
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    globalProperties[key] = props[key];
  }
}

function clearGlobalProperties(): void {
  globalProperties = {};
}

function trackOnce(eventName: string, eventData?: unknown): void {
  const normalizedName = String(eventName || "").trim();
  if (!normalizedName) return;
  if (trackedOnce.has(normalizedName)) return;
  trackedOnce.add(normalizedName);
  track(normalizedName, eventData);
}

function track(eventName: string, eventData?: unknown): void {
  const normalizedName = String(eventName || "").trim();
  if (!normalizedName || !currentVisit) return;
  if (debugEnabled) {
    console.log(
      "[InsightFlare]",
      "track:",
      JSON.stringify(normalizedName),
      JSON.stringify(
        Object.assign(
          {},
          globalProperties,
          eventData === undefined ? {} : eventData,
        ),
      ),
    );
  }
  flushPendingRouteChange();
  currentVisit.eventSequence = (currentVisit.eventSequence || 0) + 1;
  send(
    {
      ...pagePayloadBase(
        currentVisit.href,
        currentVisit.referrerUrl,
        currentVisit.startedAt,
        Date.now(),
      ),
      kind: "custom_event",
      eventId: crypto.randomUUID(),
      sequence: currentVisit.eventSequence,
      eventName: normalizedName,
      eventData: Object.assign(
        {},
        globalProperties,
        eventData === undefined ? {} : eventData,
      ),
    },
    false,
  );
}

// ── Auto-track (HTML attributes) ──

function initAutoTrack(): void {
  function extractEventData(el: Element): Record<string, unknown> {
    let data: Record<string, unknown> = {};
    const rawData = el.getAttribute("data-insightflare-event-data");
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = parsed;
        }
      } catch {
        // ignore invalid JSON
      }
    }
    const ds = (el as any).dataset;
    if (ds) {
      for (const key in ds) {
        if (!Object.prototype.hasOwnProperty.call(ds, key)) continue;
        if (key.indexOf("insightflareEvent") !== 0) continue;
        const suffix = key.slice(17);
        if (!suffix || suffix === "Trigger" || suffix === "Data") continue;
        const dataKey = suffix.charAt(0).toLowerCase() + suffix.slice(1);
        data[dataKey] = ds[key];
      }
    }
    return data;
  }

  let visibilityObserver: IntersectionObserver | null = null;
  function observeVisibility(root: ParentNode): void {
    if (typeof IntersectionObserver !== "function") return;
    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver((entries) => {
        for (let i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          const el = entries[i].target;
          const eventName = el.getAttribute("data-insightflare-event");
          if (eventName) track(eventName, extractEventData(el));
          visibilityObserver!.unobserve(el);
        }
      });
    }
    const candidates = (root || document).querySelectorAll(
      '[data-insightflare-event][data-insightflare-event-trigger="enterviewport"]',
    );
    for (let i = 0; i < candidates.length; i++) {
      visibilityObserver.observe(candidates[i]);
    }
  }

  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element).closest("[data-insightflare-event]");
      if (!el) return;
      const trigger =
        el.getAttribute("data-insightflare-event-trigger") || "click";
      if (trigger !== "click") return;
      const eventName = el.getAttribute("data-insightflare-event");
      if (!eventName) return;
      track(eventName, extractEventData(el));
    },
    true,
  );

  if (AUTO_TRACK_OUTBOUND_LINKS as unknown as string) {
    const currentHostname = window.location.hostname.toLowerCase();
    document.addEventListener(
      "click",
      (e) => {
        const anchor = (e.target as Element).closest("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (!href) return;
        let url: URL;
        try {
          url = new URL(href, window.location.href);
        } catch {
          return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        const targetHostname = url.hostname.toLowerCase();
        if (!targetHostname || targetHostname === currentHostname) return;
        track("outbound_click", {
          url: url.href,
          domain: targetHostname,
        });
      },
      true,
    );
  }

  observeVisibility(document);

  document.addEventListener(
    "submit",
    (e) => {
      const form = (e.target as Element).closest(
        '[data-insightflare-event][data-insightflare-event-trigger="submit"]',
      );
      if (!form) return;
      const eventName = form.getAttribute("data-insightflare-event");
      if (!eventName) return;
      track(eventName, extractEventData(form));
    },
    true,
  );

  if (typeof MutationObserver === "function") {
    new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const addedNodes = mutations[i].addedNodes;
        for (let j = 0; j < addedNodes.length; j++) {
          if (addedNodes[j].nodeType === 1) {
            observeVisibility(addedNodes[j] as ParentNode);
          }
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

function debug(): void {
  debugEnabled = true;
}

// ── Initialization ──

startVisit(window.location.href, document.referrer || "", Date.now());

wrapHistoryMethod("pushState");
wrapHistoryMethod("replaceState");
window.addEventListener("popstate", () => {
  scheduleRouteChange(
    window.location.href,
    currentVisit?.href || document.referrer || "",
  );
});
window.addEventListener("hashchange", () => {
  scheduleRouteChange(
    window.location.href,
    currentVisit?.href || document.referrer || "",
  );
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushPendingRouteChange();
    sendLeave();
  }
});
window.addEventListener("pagehide", () => {
  flushPendingRouteChange();
  sendLeave();
});

initAutoTrack();

// ── Window exposure ──
const api = {
  version: "6",
  siteId: SITE_ID,
  track,
  identify,
  setGlobalProperties,
  clearGlobalProperties,
  trackOnce,
  debug,
};
(window as any)[INSTALL_KEY] = api;
(window as any).insightflare = api;
