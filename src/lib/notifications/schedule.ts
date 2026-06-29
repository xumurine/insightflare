import { safeParseRecord } from "./json";

export type NotificationScheduleConfig =
  | { kind: "daily"; time: string; timezone: string }
  | { kind: "interval"; everyMinutes: number };

const DEFAULT_TIMEZONE = "UTC";
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 60 * 24 * 30;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function cleanTimezone(value: unknown): string {
  const candidate =
    typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(
      new Date(),
    );
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function normalizeNotificationSchedule(
  input: unknown,
): NotificationScheduleConfig {
  const raw = safeParseRecord(input);
  if (raw.kind === "daily") {
    const time =
      typeof raw.time === "string" && TIME_RE.test(raw.time)
        ? raw.time
        : "08:00";
    return {
      kind: "daily",
      time,
      timezone: cleanTimezone(raw.timezone),
    };
  }
  if (raw.kind === "interval") {
    const everyMinutes = Math.trunc(Number(raw.everyMinutes ?? 60));
    return {
      kind: "interval",
      everyMinutes: Math.max(
        MIN_INTERVAL_MINUTES,
        Math.min(
          MAX_INTERVAL_MINUTES,
          Number.isFinite(everyMinutes) ? everyMinutes : 60,
        ),
      ),
    };
  }
  return { kind: "interval", everyMinutes: 60 };
}

function partsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.get("hour") ?? 0);
  return {
    year: Number(parts.get("year") ?? 1970),
    month: Number(parts.get("month") ?? 1),
    day: Number(parts.get("day") ?? 1),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.get("minute") ?? 0),
    second: Number(parts.get("second") ?? 0),
  };
}

function timezoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = partsInTimezone(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - utcMs;
}

function zonedTimeToUtcMs(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}): number {
  const localAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
  );
  const firstGuess = localAsUtc - timezoneOffsetMs(localAsUtc, input.timeZone);
  const corrected = localAsUtc - timezoneOffsetMs(firstGuess, input.timeZone);
  return corrected;
}

function nextDailyRunAtMs(
  schedule: Extract<NotificationScheduleConfig, { kind: "daily" }>,
  fromMs: number,
): number {
  const match = TIME_RE.exec(schedule.time);
  const targetHour = Number(match?.[1] ?? 8);
  const targetMinute = Number(match?.[2] ?? 0);
  const localNow = partsInTimezone(new Date(fromMs), schedule.timezone);
  let candidate = zonedTimeToUtcMs({
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour: targetHour,
    minute: targetMinute,
    timeZone: schedule.timezone,
  });
  if (candidate <= fromMs) {
    candidate = zonedTimeToUtcMs({
      year: localNow.year,
      month: localNow.month,
      day: localNow.day + 1,
      hour: targetHour,
      minute: targetMinute,
      timeZone: schedule.timezone,
    });
  }
  return candidate;
}

function nextIntervalRunAtMs(
  schedule: Extract<NotificationScheduleConfig, { kind: "interval" }>,
  fromMs: number,
): number {
  if (schedule.everyMinutes === 60) {
    return (
      Math.floor(fromMs / (60 * MINUTE_MS)) * 60 * MINUTE_MS + 60 * MINUTE_MS
    );
  }
  const intervalMs = schedule.everyMinutes * MINUTE_MS;
  return Math.ceil((fromMs + 1) / intervalMs) * intervalMs;
}

export function computeNextNotificationRunAt(
  scheduleInput: unknown,
  fromEpochSeconds: number,
): number {
  const schedule = normalizeNotificationSchedule(scheduleInput);
  const fromMs = Math.max(0, Math.trunc(fromEpochSeconds)) * 1000;
  const nextMs =
    schedule.kind === "daily"
      ? nextDailyRunAtMs(schedule, fromMs)
      : nextIntervalRunAtMs(schedule, fromMs);
  return Math.floor(Math.max(fromMs + MINUTE_MS, nextMs) / 1000);
}

export function notificationRuleExpiresAtSeconds(input: {
  type: string;
  severity: string;
  createdAtSeconds: number;
}): number {
  const days =
    input.type === "test"
      ? 30
      : input.severity === "warning" || input.severity === "critical"
        ? 180
        : 120;
  return input.createdAtSeconds + Math.floor((days * DAY_MS) / 1000);
}
