import type { Env } from "@/lib/edge/types";
import { clampString } from "@/lib/edge/utils";

import type {
  NotificationMessageType,
  NotificationSeverity,
} from "./message-types";
import {
  loadDailyReportData,
  loadMetricValue,
  loadSiteLastSeenAt,
  type NotificationMetric,
  type NotificationMetricWindow,
} from "./report-data";
import type { NotificationRule } from "./rule-store";

export interface NotificationMessageDraft {
  type: NotificationMessageType;
  severity: NotificationSeverity;
  requiresAttention: boolean;
  title: string;
  summary: string;
  bodyText: string;
  bodyHtml?: string;
  data?: Record<string, unknown>;
}

export type NotificationRuleEvaluationResult =
  | {
      status: "skipped";
      reason: string;
      data?: Record<string, unknown>;
    }
  | {
      status: "checked";
      triggered: false;
      summary: string;
      data?: Record<string, unknown>;
    }
  | {
      status: "triggered";
      message: NotificationMessageDraft;
      cooldownUntil?: number | null;
      data?: Record<string, unknown>;
    };

type ThresholdOperator = ">" | ">=" | "<" | "<=";

const METRICS = new Set<NotificationMetric>(["views", "visitors", "sessions"]);
const WINDOWS = new Set<NotificationMetricWindow>([
  "last_1h",
  "last_24h",
  "yesterday",
]);
const OPERATORS = new Set<ThresholdOperator>([">", ">=", "<", "<="]);

function numberWithCommas(value: number): string {
  return Math.trunc(value).toLocaleString("en-US");
}

function conditionString(
  condition: Record<string, unknown>,
  key: string,
): string {
  const value = condition[key];
  return typeof value === "string" ? value.trim() : "";
}

function conditionNumber(
  condition: Record<string, unknown>,
  key: string,
): number | null {
  const value = Number(condition[key]);
  if (!Number.isFinite(value)) return null;
  return value;
}

function cooldownUntilFor(
  condition: Record<string, unknown>,
  now: number,
): number | null {
  const minutes = conditionNumber(condition, "cooldownMinutes");
  if (!minutes || minutes <= 0) return null;
  return now + Math.trunc(minutes) * 60;
}

function siteDisplayName(input: { siteName: string; siteDomain: string }) {
  return input.siteDomain || input.siteName || "Site";
}

function testRule(): NotificationRuleEvaluationResult {
  return {
    status: "triggered",
    message: {
      type: "test",
      severity: "info",
      requiresAttention: false,
      title: "InsightFlare notification test",
      summary: "This is a test notification from InsightFlare.",
      bodyText:
        "This is a test notification from InsightFlare. If email is configured and enabled, this message also verifies Resend delivery.",
      data: {
        source: "rule_test",
      },
    },
  };
}

function reportBody(input: Awaited<ReturnType<typeof loadDailyReportData>>) {
  if (!input) return "";
  const pageLines =
    input.topPages.length > 0
      ? input.topPages
          .map(
            (page, index) =>
              `${index + 1}. ${page.path} - ${numberWithCommas(page.views)} views`,
          )
          .join("\n")
      : "No page data.";
  const referrerLines =
    input.topReferrers.length > 0
      ? input.topReferrers
          .map(
            (referrer, index) =>
              `${index + 1}. ${referrer.referrer} - ${numberWithCommas(referrer.visits)} visits`,
          )
          .join("\n")
      : "No referrer data.";
  return `${siteDisplayName(input)} daily traffic report

Date: ${input.range.label}

Core metrics:
- Views: ${numberWithCommas(input.metrics.views)}
- Visitors: ${numberWithCommas(input.metrics.visitors)}
- Sessions: ${numberWithCommas(input.metrics.sessions)}

Top Pages:
${pageLines}

Top Referrers:
${referrerLines}`;
}

async function evaluateDailyReportRule(
  env: Env,
  rule: NotificationRule,
  now: number,
): Promise<NotificationRuleEvaluationResult> {
  if (!rule.siteId) {
    return { status: "skipped", reason: "missing_site_id" };
  }
  if (conditionString(rule.condition, "reportType") !== "daily") {
    return { status: "skipped", reason: "unsupported_report_type" };
  }
  const data = await loadDailyReportData(env, {
    siteId: rule.siteId,
    now,
    timezone:
      typeof rule.schedule === "object" && rule.schedule.kind === "daily"
        ? rule.schedule.timezone
        : undefined,
  });
  if (!data) return { status: "skipped", reason: "site_not_found" };
  const displayName = siteDisplayName(data);
  return {
    status: "triggered",
    message: {
      type: "report",
      severity: "info",
      requiresAttention: false,
      title: `${displayName} daily traffic report`,
      summary: `${data.range.label}: ${numberWithCommas(data.metrics.visitors)} visitors and ${numberWithCommas(data.metrics.views)} views.`,
      bodyText: reportBody(data),
      data: {
        ruleId: rule.id,
        siteId: rule.siteId,
        siteName: data.siteName,
        siteDomain: data.siteDomain,
        type: "report",
        reportType: "daily",
        range: data.range,
        metrics: data.metrics,
        topPages: data.topPages,
        topReferrers: data.topReferrers,
      },
    },
    data: {
      range: data.range,
      metrics: data.metrics,
    },
  };
}

export function compareThreshold(
  value: number,
  operator: ThresholdOperator,
  target: number,
): boolean {
  if (operator === ">") return value > target;
  if (operator === ">=") return value >= target;
  if (operator === "<") return value < target;
  return value <= target;
}

async function getSiteDisplay(
  env: Env,
  siteId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT name, domain FROM sites WHERE id = ? LIMIT 1",
  )
    .bind(siteId)
    .first<{ name: string; domain: string }>();
  if (!row) return null;
  return row.domain || row.name || "Site";
}

async function evaluateThresholdRule(
  env: Env,
  rule: NotificationRule,
  now: number,
): Promise<NotificationRuleEvaluationResult> {
  if (!rule.siteId) return { status: "skipped", reason: "missing_site_id" };
  const metric = conditionString(
    rule.condition,
    "metric",
  ) as NotificationMetric;
  if (!METRICS.has(metric))
    return { status: "skipped", reason: "invalid_metric" };
  const window = conditionString(
    rule.condition,
    "window",
  ) as NotificationMetricWindow;
  if (!WINDOWS.has(window))
    return { status: "skipped", reason: "invalid_window" };
  const operator = conditionString(
    rule.condition,
    "operator",
  ) as ThresholdOperator;
  if (!OPERATORS.has(operator)) {
    return { status: "skipped", reason: "invalid_operator" };
  }
  const target = conditionNumber(rule.condition, "value");
  if (target === null) return { status: "skipped", reason: "invalid_value" };
  const site = await getSiteDisplay(env, rule.siteId);
  if (!site) return { status: "skipped", reason: "site_not_found" };
  const result = await loadMetricValue(env, {
    siteId: rule.siteId,
    metric,
    window,
    now,
  });
  const triggered = compareThreshold(result.value, operator, target);
  const data = {
    ruleId: rule.id,
    siteId: rule.siteId,
    siteName: site,
    siteDomain: site,
    metric,
    window,
    value: result.value,
    operator,
    target,
    triggered,
    range: result.range,
  };
  if (!triggered) {
    return {
      status: "checked",
      triggered: false,
      summary: `${metric} ${numberWithCommas(result.value)} did not match ${operator} ${numberWithCommas(target)}.`,
      data,
    };
  }
  return {
    status: "triggered",
    cooldownUntil: cooldownUntilFor(rule.condition, now),
    data,
    message: {
      type: "threshold",
      severity: "warning",
      requiresAttention: true,
      title: `${site} traffic threshold reached`,
      summary: `${window.replaceAll("_", " ")} ${metric} is ${numberWithCommas(result.value)}, matching threshold ${operator} ${numberWithCommas(target)}.`,
      bodyText: `${site} traffic threshold reached

Metric: ${metric}
Window: ${window.replaceAll("_", " ")}
Current value: ${numberWithCommas(result.value)}
Threshold: ${operator} ${numberWithCommas(target)}`,
      data,
    },
  };
}

async function evaluateHealthRule(
  env: Env,
  rule: NotificationRule,
  now: number,
): Promise<NotificationRuleEvaluationResult> {
  if (!rule.siteId) return { status: "skipped", reason: "missing_site_id" };
  if (conditionString(rule.condition, "check") !== "no_data") {
    return { status: "skipped", reason: "unsupported_health_check" };
  }
  const hours = conditionNumber(rule.condition, "hours");
  if (!hours || hours <= 0)
    return { status: "skipped", reason: "invalid_hours" };
  const site = await getSiteDisplay(env, rule.siteId);
  if (!site) return { status: "skipped", reason: "site_not_found" };
  const lastSeenAt = await loadSiteLastSeenAt(env, rule.siteId);
  const thresholdSeconds = Math.trunc(hours) * 3600;
  const triggered = lastSeenAt === null || now - lastSeenAt >= thresholdSeconds;
  const data = {
    ruleId: rule.id,
    siteId: rule.siteId,
    siteName: site,
    siteDomain: site,
    check: "no_data",
    hours,
    lastSeenAt,
    triggered,
  };
  if (!triggered) {
    return {
      status: "checked",
      triggered: false,
      summary: `${site} received data recently.`,
      data,
    };
  }
  const summary =
    lastSeenAt === null
      ? "No historical traffic data was found. Check that the tracking script is installed."
      : "Please check whether the tracking script is installed correctly or whether the site still has traffic.";
  return {
    status: "triggered",
    cooldownUntil: cooldownUntilFor(rule.condition, now),
    data,
    message: {
      type: "health",
      severity: "critical",
      requiresAttention: true,
      title: `${site} has not received data for ${Math.trunc(hours)} hours`,
      summary,
      bodyText: `${site} has not received data for ${Math.trunc(hours)} hours.

${summary}

Last seen: ${lastSeenAt ? new Date(lastSeenAt * 1000).toISOString() : "never"}`,
      data,
    },
  };
}

export async function evaluateNotificationRule(
  env: Env,
  rule: NotificationRule,
  now: number,
): Promise<NotificationRuleEvaluationResult> {
  if (rule.type === "test") return testRule();
  if (rule.type === "report") return evaluateDailyReportRule(env, rule, now);
  if (rule.type === "threshold") return evaluateThresholdRule(env, rule, now);
  if (rule.type === "health") return evaluateHealthRule(env, rule, now);
  return {
    status: "skipped",
    reason: `unsupported_rule_type:${clampString(rule.type, 60)}`,
  };
}
