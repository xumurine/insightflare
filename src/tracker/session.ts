interface SessionManager {
  visitorId: string;
  getSessionId(): string;
  touch(now: number): string;
}

function loadOrCreateVisitorId(visitorKey: string): string {
  const existing = window.localStorage.getItem(visitorKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(visitorKey, next);
  return next;
}

function loadOrCreateSessionId(
  sessionKey: string,
  sessionActivityKey: string,
  sessionWindowMs: number,
  now: number,
): string {
  const lastActivityRaw = Number(
    window.sessionStorage.getItem(sessionActivityKey) || "0",
  );
  const existing = window.sessionStorage.getItem(sessionKey);
  if (
    existing &&
    Number.isFinite(lastActivityRaw) &&
    now - lastActivityRaw <= sessionWindowMs
  ) {
    window.sessionStorage.setItem(sessionActivityKey, String(now));
    return existing;
  }
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey, next);
  window.sessionStorage.setItem(sessionActivityKey, String(now));
  return next;
}

export function createSessionManager(options: {
  visitorKey: string;
  sessionKey: string;
  sessionActivityKey: string;
  sessionWindowMs: number;
  isEuMode: boolean;
  now: number;
}): SessionManager {
  let sessionId = loadOrCreateSessionId(
    options.sessionKey,
    options.sessionActivityKey,
    options.sessionWindowMs,
    options.now,
  );

  return {
    visitorId: options.isEuMode
      ? ""
      : loadOrCreateVisitorId(options.visitorKey),
    getSessionId() {
      return sessionId;
    },
    touch(now: number) {
      sessionId = loadOrCreateSessionId(
        options.sessionKey,
        options.sessionActivityKey,
        options.sessionWindowMs,
        now,
      );
      return sessionId;
    },
  };
}
