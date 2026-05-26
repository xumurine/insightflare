import type { TrackerClientPayload } from "./types";

export function toUnixSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

export function errorToMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error);
}

export function logDoTrace(
  event: string,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function compactClientForLog(
  client: TrackerClientPayload | undefined,
): Record<string, unknown> {
  if (!client) return {};
  return {
    kind: client.kind || "",
    siteId: client.siteId || "",
    visitId: client.visitId || "",
    sessionId: client.sessionId || "",
    eventId: client.eventId || "",
    eventName: client.eventName || "",
    pathname: client.pathname || "",
    hostname: client.hostname || "",
    timestamp: client.timestamp ?? null,
  };
}
