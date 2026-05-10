interface BuildTrackerScriptOptions {
  siteId: string;
  isEUMode: boolean;
  trackQueryParams: boolean;
  trackHash: boolean;
  ignoreDoNotTrack: boolean;
  performanceSampleRate: number;
  sessionWindowMinutes: number;
}

export function buildTrackerScript(options: BuildTrackerScriptOptions): string {
  const siteIdLiteral = JSON.stringify(options.siteId);
  const isEUModeLiteral = options.isEUMode ? "true" : "false";
  const trackQueryParamsLiteral = options.trackQueryParams ? "true" : "false";
  const trackHashLiteral = options.trackHash ? "true" : "false";
  const ignoreDoNotTrackLiteral = options.ignoreDoNotTrack ? "true" : "false";
  const performanceSampleRateLiteral = String(
    Math.max(0, Math.min(100, Number(options.performanceSampleRate) || 0)),
  );
  const sessionWindowMsLiteral = String(
    Math.max(1, Math.floor(options.sessionWindowMinutes)) * 60 * 1000,
  );

  return `(() => {
  "use strict";

  const SITE_ID = ${siteIdLiteral};
  const IS_EU_MODE = ${isEUModeLiteral};
  const TRACK_QUERY_PARAMS = ${trackQueryParamsLiteral};
  const TRACK_HASH = ${trackHashLiteral};
  const IGNORE_DO_NOT_TRACK = ${ignoreDoNotTrackLiteral};
  const PERFORMANCE_SAMPLE_RATE = ${performanceSampleRateLiteral};
  const INSTALL_KEY = "__insightflare_tracker_v6__";
  const VISITOR_KEY = "__insightflare_visitor_" + SITE_ID + "__";
  const SESSION_KEY = "__insightflare_session_" + SITE_ID + "__";
  const SESSION_ACTIVITY_KEY = "__insightflare_session_activity_" + SITE_ID + "__";
  const ROUTE_SETTLE_DELAY_MS = 300;
  const SESSION_WINDOW_MS = ${sessionWindowMsLiteral};
  const UA_CLIENT_HINT_TIMEOUT_MS = 200;
  const UA_CLIENT_HINT_KEYS = ["fullVersionList", "platformVersion", "model", "formFactors"];
  const scriptEl = document.currentScript;
  if (!scriptEl || !(scriptEl instanceof HTMLScriptElement) || !scriptEl.src) return;

  if (!IGNORE_DO_NOT_TRACK) {
    const dnt = String(navigator.doNotTrack || "").trim().toLowerCase();
    if (dnt === "1" || dnt === "yes") return;
  }

  if (window[INSTALL_KEY]) return;

  const scriptUrl = new URL(scriptEl.src);
  const collectUrl = new URL("/collect", scriptUrl.origin).toString();
  const visitorId = IS_EU_MODE ? "" : loadOrCreateVisitorId();
  let sessionId = loadOrCreateSessionId(Date.now());

  function loadOrCreateVisitorId() {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, next);
    return next;
  }

  function loadOrCreateSessionId(now) {
    const lastActivityRaw = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || "0");
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && Number.isFinite(lastActivityRaw) && now - lastActivityRaw <= SESSION_WINDOW_MS) {
      window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
      return existing;
    }
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, next);
    window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
    return next;
  }

  function touchSession(now) {
    sessionId = loadOrCreateSessionId(now);
    return sessionId;
  }

  function normalizeUaBrandVersionList(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, 8).map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const brand = String(item.brand || "").trim().slice(0, 80);
      const version = String(item.version || "").trim().slice(0, 80);
      if (!brand || !version) return null;
      return { brand, version };
    }).filter(Boolean);
  }

  function normalizeUaStringList(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, 8).map((item) => String(item || "").trim().slice(0, 40)).filter(Boolean);
  }

  function normalizeUaClientHints(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const hints = {};
    const brands = normalizeUaBrandVersionList(input.brands);
    const fullVersionList = normalizeUaBrandVersionList(input.fullVersionList);
    const formFactors = normalizeUaStringList(input.formFactors);
    const platform = String(input.platform || "").trim().slice(0, 80);
    const platformVersion = String(input.platformVersion || "").trim().slice(0, 80);
    const model = String(input.model || "").trim().slice(0, 120);
    if (brands.length > 0) hints.brands = brands;
    if (fullVersionList.length > 0) hints.fullVersionList = fullVersionList;
    if (typeof input.mobile === "boolean") hints.mobile = input.mobile;
    if (platform) hints.platform = platform;
    if (platformVersion) hints.platformVersion = platformVersion;
    if (model) hints.model = model;
    if (formFactors.length > 0) hints.formFactors = formFactors;
    return Object.keys(hints).length > 0 ? hints : null;
  }

  function readUaClientHints() {
    const uaData = navigator.userAgentData;
    if (!uaData || typeof uaData !== "object") return Promise.resolve(null);
    const lowEntropy = {
      brands: uaData.brands,
      mobile: uaData.mobile,
      platform: uaData.platform,
    };
    if (typeof uaData.getHighEntropyValues !== "function") {
      return Promise.resolve(normalizeUaClientHints(lowEntropy));
    }
    return uaData.getHighEntropyValues(UA_CLIENT_HINT_KEYS)
      .then((values) => normalizeUaClientHints({ ...lowEntropy, ...values }))
      .catch(() => normalizeUaClientHints(lowEntropy));
  }

  function withUaClientHints(payload) {
    if (!uaClientHints) return payload;
    return {
      ...payload,
      uaClientHints,
    };
  }

  function routeKey(href) {
    const url = new URL(href, window.location.href);
    return [
      url.pathname || "/",
      TRACK_QUERY_PARAMS ? url.search || "" : "",
      TRACK_HASH ? url.hash || "" : "",
    ].join("|");
  }

  function pagePayloadBase(href, referrerUrl, startedAt, eventAt) {
    const url = new URL(href, window.location.href);
    const currentSessionId = touchSession(eventAt);
    return {
      siteId: SITE_ID,
      visitId: currentVisit.id,
      sessionId: currentSessionId,
      timestamp: eventAt,
      startedAt,
      pathname: url.pathname || "/",
      query: TRACK_QUERY_PARAMS ? url.search || "" : "",
      hash: TRACK_HASH ? url.hash || "" : "",
      hostname: url.hostname || "",
      title: document.title || "",
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screenWidth: window.screen?.width ?? null,
      screenHeight: window.screen?.height ?? null,
      referrerUrl: String(referrerUrl || ""),
      visitorId,
      utmSource: TRACK_QUERY_PARAMS ? url.searchParams.get("utm_source") || "" : "",
      utmMedium: TRACK_QUERY_PARAMS ? url.searchParams.get("utm_medium") || "" : "",
      utmCampaign: TRACK_QUERY_PARAMS ? url.searchParams.get("utm_campaign") || "" : "",
      utmTerm: TRACK_QUERY_PARAMS ? url.searchParams.get("utm_term") || "" : "",
      utmContent: TRACK_QUERY_PARAMS ? url.searchParams.get("utm_content") || "" : ""
    };
  }

  function send(payload, useBeacon) {
    let body = "";
    try {
      body = JSON.stringify(withUaClientHints(payload));
    } catch {
      return;
    }
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(collectUrl, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(collectUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      mode: "cors",
      credentials: "omit",
      keepalive: useBeacon
    }).catch(() => {});
  }

  function sendWhenUaClientHintsReady(payload, useBeacon) {
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

  function roundMetric(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 1000) / 1000;
  }

  function shouldSamplePerformance() {
    return PERFORMANCE_SAMPLE_RATE > 0 && Math.random() * 100 < PERFORMANCE_SAMPLE_RATE;
  }

  function updatePerformanceMetric(metric, value) {
    const next = roundMetric(value);
    if (next === null) return;
    performanceMetrics[metric] = next;
  }

  function observePerformanceEntry(type, options, onEntries) {
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
    } catch {}
  }

  function startPerformanceCollection(visitId) {
    if (performanceCollectionStarted) return;
    performanceCollectionStarted = true;
    performanceVisitId = visitId;
    performanceSampled = shouldSamplePerformance();
    if (!performanceSampled) return;

    try {
      const navigationEntry = performance.getEntriesByType("navigation")[0];
      if (navigationEntry) {
        updatePerformanceMetric("ttfb", navigationEntry.responseStart);
      }
    } catch {}

    observePerformanceEntry("paint", { type: "paint", buffered: true }, (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint") {
          updatePerformanceMetric("fcp", entry.startTime);
        }
      }
    });

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
        for (const entry of entries) {
          if (entry && !entry.hadRecentInput) {
            performanceMetrics.cls = roundMetric((performanceMetrics.cls || 0) + entry.value) || 0;
          }
        }
      },
    );

    observePerformanceEntry(
      "event",
      { type: "event", buffered: true, durationThreshold: 40 },
      (entries) => {
        for (const entry of entries) {
          const interactionId = Number(entry.interactionId || 0);
          const duration = Number(entry.duration || 0);
          if (!Number.isFinite(duration) || duration < 0) continue;
          if (interactionId > 0) {
            const previous = interactionDurations.get(interactionId) || 0;
            const next = Math.max(previous, duration);
            interactionDurations.set(interactionId, next);
            updatePerformanceMetric("inp", Math.max(performanceMetrics.inp || 0, next));
            continue;
          }
          updatePerformanceMetric("inp", Math.max(performanceMetrics.inp || 0, duration));
        }
      },
    );
  }

  function stopPerformanceCollection() {
    for (const cleanup of performanceObserverCleanups) {
      try {
        cleanup();
      } catch {}
    }
    performanceObserverCleanups = [];
  }

  function buildPerformancePayload() {
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

  function startVisit(href, referrerUrl, startedAt) {
    leaveSent = false;
    currentVisit = {
      id: crypto.randomUUID(),
      startedAt,
      href,
      routeKey: routeKey(href),
      referrerUrl,
      eventSequence: 0,
    };

    if (!performanceVisitId) {
      startPerformanceCollection(currentVisit.id);
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

  function sendLeave() {
    if (!currentVisit || leaveSent) return;
    leaveSent = true;
    const eventAt = Date.now();
    const url = new URL(currentVisit.href, window.location.href);
    const performancePayload = buildPerformancePayload();
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
    stopPerformanceCollection();
  }

  function commitRouteChange(routeChange) {
    pendingRouteChange = null;
    routeChangeTimer = 0;
    const nextKey = routeKey(routeChange.href);
    if (!currentVisit || nextKey === currentVisit.routeKey) return;
    startVisit(routeChange.href, routeChange.referrerUrl, routeChange.transitionAt);
  }

  function flushPendingRouteChange() {
    if (!pendingRouteChange) return;
    if (routeChangeTimer) {
      clearTimeout(routeChangeTimer);
      routeChangeTimer = 0;
    }
    commitRouteChange(pendingRouteChange);
  }

  function scheduleRouteChange(nextHref, nextReferrerUrl) {
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

  function wrapHistoryMethod(methodName) {
    const original = history[methodName];
    history[methodName] = function(...args) {
      const result = original.apply(this, args);
      queueMicrotask(() => {
        scheduleRouteChange(window.location.href, currentVisit?.href || document.referrer || "");
      });
      return result;
    };
  }

  function track(eventName, eventData) {
    const normalizedName = String(eventName || "").trim();
    if (!normalizedName || !currentVisit) return;
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
        eventData: eventData === undefined ? {} : eventData,
      },
      false,
    );
  }

  let currentVisit = null;
  let pendingRouteChange = null;
  let routeChangeTimer = 0;
  let leaveSent = false;
  let uaClientHints = null;
  let uaClientHintsSettled = false;
  let performanceVisitId = "";
  let performanceSampled = false;
  let performanceCollectionStarted = false;
  let performanceObserverCleanups = [];
  const interactionDurations = new Map();
  const performanceMetrics = {
    ttfb: null,
    fcp: null,
    lcp: null,
    cls: 0,
    inp: 0,
  };
  const uaClientHintsReady = readUaClientHints()
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

  startVisit(window.location.href, document.referrer || "", Date.now());

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => {
    scheduleRouteChange(window.location.href, currentVisit?.href || document.referrer || "");
  });
  window.addEventListener("hashchange", () => {
    scheduleRouteChange(window.location.href, currentVisit?.href || document.referrer || "");
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

  window[INSTALL_KEY] = {
    version: "6",
    siteId: SITE_ID,
    track
  };
  window.insightflare = {
    track
  };
})();`;
}
