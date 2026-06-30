"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RiAddLine,
  RiCheckboxCircleLine,
  RiDeleteBinLine,
  RiEditLine,
  RiEyeLine,
  RiMailSendLine,
  RiNotification3Line,
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiSave3Line,
} from "@remixicon/react";
import { toast } from "sonner";

import { PageHeading } from "@/components/dashboard/page-heading";
import { TableActionButton } from "@/components/dashboard/table-action-button";
import { AutoResizer } from "@/components/ui/auto-resizer";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { intlLocale, shortDateTime } from "@/lib/dashboard/format";
import {
  buildTimeZoneOptions,
  supportedTimeZones,
} from "@/lib/dashboard/time-zone";
import {
  createNotificationRule,
  deleteNotificationRule,
  fetchAdminSites,
  fetchNotificationEmailConfig,
  fetchNotificationRules,
  type NotificationRuleData,
  type NotificationRuleEvaluationData,
  previewNotificationRule,
  runNotificationRuleNow,
  sendNotificationTest,
  type SiteData,
  updateNotificationRule,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";

interface TeamNotificationsClientProps {
  locale: Locale;
  messages: AppMessages;
  teamId: string;
  teamSlug: string;
  currentUserId: string;
}

type RuleFormType = "report" | "milestone" | "threshold" | "change" | "health";
type RecipientMode = "creator" | "team_admins" | "all_team_members";
type ScheduleKind =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "interval";
type ReportType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type ConditionCombinator = "all" | "any";
type ChangeMode = "absolute" | "percent";
type MetricName = "views" | "visitors" | "sessions";
type MetricWindow = "last_1h" | "last_24h" | "yesterday";
type ThresholdOperator = ">" | ">=" | "<" | "<=";

interface MetricConditionForm {
  id: string;
  metric: MetricName;
  window: MetricWindow;
  operator: ThresholdOperator;
  value: string;
  changeMode: ChangeMode;
}

interface RuleFormState {
  id: string;
  name: string;
  type: RuleFormType;
  siteId: string;
  enabled: boolean;
  recipientMode: RecipientMode;
  scheduleKind: ScheduleKind;
  reportType: ReportType;
  time: string;
  timezone: string;
  dayOfWeek: string;
  dayOfMonth: string;
  month: string;
  everyMinutes: string;
  combinator: ConditionCombinator;
  conditions: MetricConditionForm[];
  metric: MetricName;
  milestoneStep: string;
  cooldownMinutes: string;
  hours: string;
}

function defaultMetricCondition(id = "condition-1"): MetricConditionForm {
  return {
    id,
    metric: "visitors",
    window: "last_1h",
    operator: ">=",
    value: "1000",
    changeMode: "percent",
  };
}

const EMPTY_FORM: RuleFormState = {
  id: "",
  name: "",
  type: "report",
  siteId: "",
  enabled: true,
  recipientMode: "team_admins",
  scheduleKind: "daily",
  reportType: "daily",
  time: "08:00",
  timezone: "UTC",
  dayOfWeek: "1",
  dayOfMonth: "1",
  month: "1",
  everyMinutes: "60",
  combinator: "all",
  conditions: [defaultMetricCondition()],
  metric: "visitors",
  milestoneStep: "1000",
  cooldownMinutes: "360",
  hours: "12",
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

const REPORT_TYPES: ReportType[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];
const WEEK_DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;

function isRuleFormType(value: string): value is RuleFormType {
  return (
    value === "report" ||
    value === "milestone" ||
    value === "threshold" ||
    value === "change" ||
    value === "health"
  );
}

function isScheduleKind(value: unknown): value is ScheduleKind {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "yearly" ||
    value === "interval"
  );
}

function isReportType(value: unknown): value is ReportType {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "yearly"
  );
}

function firstCondition(
  condition: Record<string, unknown>,
): Record<string, unknown> {
  const candidates = [condition.conditions, condition.all, condition.any].find(
    Array.isArray,
  );
  const first = Array.isArray(candidates) ? candidates[0] : null;
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : condition;
}

function conditionRecords(
  condition: Record<string, unknown>,
): Record<string, unknown>[] {
  const candidates = [condition.conditions, condition.all, condition.any].find(
    Array.isArray,
  );
  if (!Array.isArray(candidates)) return [condition];
  return candidates.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

function metricConditionFromRecord(
  condition: Record<string, unknown>,
  index: number,
): MetricConditionForm {
  return {
    id: `condition-${index + 1}`,
    metric:
      condition.metric === "views" || condition.metric === "sessions"
        ? condition.metric
        : "visitors",
    window:
      condition.window === "last_24h" || condition.window === "yesterday"
        ? condition.window
        : "last_1h",
    operator:
      condition.operator === ">" ||
      condition.operator === "<" ||
      condition.operator === "<="
        ? condition.operator
        : ">=",
    value: String(condition.value ?? "1000"),
    changeMode: condition.mode === "absolute" ? "absolute" : "percent",
  };
}

function nextConditionId(conditions: MetricConditionForm[]): string {
  return `condition-${Date.now()}-${conditions.length + 1}`;
}

function formatRunAt(locale: Locale, value: number | null): string {
  if (!value) return "-";
  return shortDateTime(locale, value * 1000);
}

function isCoolingDown(
  rule: NotificationRuleData,
  nowSeconds: number,
): boolean {
  return Boolean(rule.cooldownUntil && rule.cooldownUntil > nowSeconds);
}

function nextRunLabel(
  copy: AppMessages["teamManagement"]["notifications"],
  locale: Locale,
  rule: NotificationRuleData,
  nowSeconds: number,
): string {
  if (!rule.enabled) return copy.nextRunStates.disabled;
  if (isCoolingDown(rule, nowSeconds)) return copy.nextRunStates.coolingDown;
  if (rule.nextRunAt && rule.nextRunAt <= nowSeconds) {
    return copy.nextRunStates.dueNow;
  }
  return formatRunAt(locale, rule.nextRunAt);
}

function scheduleLabel(
  copy: AppMessages["teamManagement"]["notifications"],
  rule: NotificationRuleData,
): string {
  if (rule.schedule.kind === "daily") {
    return formatI18nTemplate(copy.scheduleDaily, {
      time: String(rule.schedule.time ?? "08:00"),
    });
  }
  if (rule.schedule.kind === "weekly") {
    const dayIndex = Number(rule.schedule.dayOfWeek ?? 1);
    return formatI18nTemplate(copy.scheduleWeekly, {
      day: copy.weekDays[Math.max(0, Math.min(6, dayIndex))] ?? "",
      time: String(rule.schedule.time ?? "08:00"),
    });
  }
  if (rule.schedule.kind === "monthly") {
    return formatI18nTemplate(copy.scheduleMonthly, {
      day: String(rule.schedule.dayOfMonth ?? 1),
      time: String(rule.schedule.time ?? "08:00"),
    });
  }
  if (rule.schedule.kind === "quarterly") {
    return formatI18nTemplate(copy.scheduleQuarterly, {
      day: String(rule.schedule.dayOfMonth ?? 1),
      time: String(rule.schedule.time ?? "08:00"),
    });
  }
  if (rule.schedule.kind === "yearly") {
    return formatI18nTemplate(copy.scheduleYearly, {
      month: String(rule.schedule.month ?? 1),
      day: String(rule.schedule.dayOfMonth ?? 1),
      time: String(rule.schedule.time ?? "08:00"),
    });
  }
  if (rule.schedule.kind === "interval") {
    return formatI18nTemplate(copy.scheduleInterval, {
      minutes: String(rule.schedule.everyMinutes ?? 60),
    });
  }
  return copy.scheduleCustom;
}

function conditionLabel(
  copy: AppMessages["teamManagement"]["notifications"],
  rule: NotificationRuleData,
): string {
  const primaryCondition = firstCondition(rule.condition);
  if (rule.type === "report") {
    const reportType = isReportType(rule.condition.reportType)
      ? rule.condition.reportType
      : "daily";
    return formatI18nTemplate(copy.conditionReport, {
      period: copy.scheduleKinds[reportType],
    });
  }
  if (rule.type === "milestone") {
    const metric =
      primaryCondition.metric === "views" ||
      primaryCondition.metric === "sessions"
        ? primaryCondition.metric
        : "visitors";
    const step = String(
      rule.condition.step ??
        rule.condition.every ??
        rule.condition.value ??
        "-",
    );
    return formatI18nTemplate(copy.conditionMilestone, {
      metric: copy.metrics[metric],
      step,
    });
  }
  if (rule.type === "threshold" || rule.type === "change") {
    const metric =
      primaryCondition.metric === "views" ||
      primaryCondition.metric === "sessions"
        ? primaryCondition.metric
        : "visitors";
    const window =
      primaryCondition.window === "last_24h" ||
      primaryCondition.window === "yesterday"
        ? primaryCondition.window
        : "last_1h";
    const value = String(primaryCondition.value ?? "-");
    const operator =
      primaryCondition.operator === ">" ||
      primaryCondition.operator === "<" ||
      primaryCondition.operator === "<="
        ? primaryCondition.operator
        : ">=";
    const template =
      rule.type === "change" ? copy.conditionChange : copy.conditionThreshold;
    return formatI18nTemplate(template, {
      metric: copy.metrics[metric],
      window: copy.windows[window],
      operator,
      value,
    });
  }
  if (rule.type === "health") {
    return formatI18nTemplate(copy.conditionHealth, {
      hours: String(rule.condition.hours ?? "-"),
    });
  }
  return copy.scheduleCustom;
}

function ruleTypeLabel(
  copy: AppMessages["teamManagement"]["notifications"],
  type: string,
): string {
  if (type in copy.ruleTypes) {
    return copy.ruleTypes[type as keyof typeof copy.ruleTypes];
  }
  return type;
}

function recipientLabel(
  copy: AppMessages["teamManagement"]["notifications"],
  mode: string,
): string {
  if (mode in copy.recipientModes) {
    return copy.recipientModes[mode as keyof typeof copy.recipientModes];
  }
  return copy.recipientModes.team_admins;
}

function siteLabel(siteById: Map<string, SiteData>, siteId: string | null) {
  if (!siteId) return "-";
  const site = siteById.get(siteId);
  return site ? `${site.name} (${site.domain})` : siteId;
}

function previewSummary(result: NotificationRuleEvaluationData | null): string {
  if (!result) return "";
  if (result.status === "triggered") return result.message.summary;
  if (result.status === "checked") return result.summary;
  return result.reason;
}

function jsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function inferFormFromRule(rule: NotificationRuleData): RuleFormState {
  const type = isRuleFormType(rule.type) ? rule.type : "report";
  const scheduleKind = isScheduleKind(rule.schedule.kind)
    ? rule.schedule.kind
    : "interval";
  const primaryCondition = firstCondition(rule.condition);
  const conditions = conditionRecords(rule.condition).map(
    metricConditionFromRecord,
  );
  const reportType = isReportType(rule.condition.reportType)
    ? rule.condition.reportType
    : scheduleKind !== "interval" && isReportType(scheduleKind)
      ? scheduleKind
      : "daily";
  return {
    ...EMPTY_FORM,
    id: rule.id,
    name: rule.name,
    type,
    siteId: rule.siteId ?? "",
    enabled: rule.enabled,
    recipientMode:
      rule.recipient.mode === "creator" ||
      rule.recipient.mode === "all_team_members"
        ? rule.recipient.mode
        : "team_admins",
    scheduleKind,
    reportType,
    time: String(rule.schedule.time ?? "08:00"),
    timezone: String(rule.schedule.timezone ?? "UTC"),
    dayOfWeek: String(rule.schedule.dayOfWeek ?? "1"),
    dayOfMonth: String(rule.schedule.dayOfMonth ?? "1"),
    month: String(rule.schedule.month ?? "1"),
    everyMinutes: String(rule.schedule.everyMinutes ?? 60),
    combinator: Array.isArray(rule.condition.any) ? "any" : "all",
    conditions: conditions.length > 0 ? conditions : [defaultMetricCondition()],
    metric:
      primaryCondition.metric === "views" ||
      primaryCondition.metric === "sessions"
        ? primaryCondition.metric
        : "visitors",
    milestoneStep: String(
      rule.condition.step ??
        rule.condition.every ??
        rule.condition.value ??
        "1000",
    ),
    cooldownMinutes: String(rule.condition.cooldownMinutes ?? "360"),
    hours: String(rule.condition.hours ?? "12"),
  };
}

function defaultName(
  copy: AppMessages["teamManagement"]["notifications"],
  type: RuleFormType,
  site?: SiteData,
) {
  const siteName = site?.name || copy.siteLabel;
  return formatI18nTemplate(copy.defaultNames[type], { site: siteName });
}

function buildRulePayload(
  copy: AppMessages["teamManagement"]["notifications"],
  form: RuleFormState,
  sites: SiteData[],
) {
  const site = sites.find((item) => item.id === form.siteId);
  const name = form.name.trim() || defaultName(copy, form.type, site);
  const schedule =
    form.scheduleKind === "interval"
      ? {
          kind: "interval",
          everyMinutes: Math.trunc(Number(form.everyMinutes || 60)),
        }
      : {
          kind: form.scheduleKind,
          time: form.time || "08:00",
          timezone: form.timezone,
          ...(form.scheduleKind === "weekly"
            ? { dayOfWeek: Math.trunc(Number(form.dayOfWeek || 1)) }
            : {}),
          ...(form.scheduleKind === "monthly" ||
          form.scheduleKind === "quarterly"
            ? { dayOfMonth: Math.trunc(Number(form.dayOfMonth || 1)) }
            : {}),
          ...(form.scheduleKind === "yearly"
            ? {
                month: Math.trunc(Number(form.month || 1)),
                dayOfMonth: Math.trunc(Number(form.dayOfMonth || 1)),
              }
            : {}),
        };
  const metricConditions = form.conditions.map((condition) => ({
    metric: condition.metric,
    window: condition.window,
    operator: condition.operator,
    value: Number(condition.value || 0),
  }));
  const condition =
    form.type === "report"
      ? { reportType: form.reportType }
      : form.type === "milestone"
        ? {
            metric: form.metric,
            step: Number(form.milestoneStep || 0),
          }
        : form.type === "threshold"
          ? {
              [form.combinator]: metricConditions,
              cooldownMinutes: Number(form.cooldownMinutes || 0),
            }
          : form.type === "change"
            ? {
                [form.combinator]: form.conditions.map((condition) => ({
                  metric: condition.metric,
                  window: condition.window,
                  operator: condition.operator,
                  value: Number(condition.value || 0),
                  mode: condition.changeMode,
                  compareTo: "previous_period",
                })),
                cooldownMinutes: Number(form.cooldownMinutes || 0),
              }
            : {
                check: "no_data",
                hours: Number(form.hours || 0),
                cooldownMinutes: Number(form.cooldownMinutes || 0),
              };
  return {
    name,
    siteId: form.siteId || null,
    type: form.type,
    enabled: form.enabled,
    schedule,
    condition,
    recipient: { mode: form.recipientMode },
  };
}

function metricConditionText(
  copy: AppMessages["teamManagement"]["notifications"],
  condition: MetricConditionForm,
  type: RuleFormType,
): string {
  const metric = copy.metrics[condition.metric];
  const window = copy.windows[condition.window];
  const value = condition.value || "0";
  if (type === "change") {
    return formatI18nTemplate(copy.summaryConditionChange, {
      window,
      metric,
      operator: condition.operator,
      value,
      mode:
        condition.changeMode === "percent"
          ? copy.changeModePercent
          : copy.changeModeAbsolute,
    });
  }
  return formatI18nTemplate(copy.summaryConditionThreshold, {
    window,
    metric,
    operator: condition.operator,
    value,
  });
}

function ruleSummaryLines(
  copy: AppMessages["teamManagement"]["notifications"],
  form: RuleFormState,
): string[] {
  if (form.type === "threshold" || form.type === "change") {
    return form.conditions.map((condition) =>
      metricConditionText(copy, condition, form.type),
    );
  }
  if (form.type === "report") {
    return [
      formatI18nTemplate(copy.summaryReportCondition, {
        period: copy.scheduleKinds[form.reportType],
      }),
    ];
  }
  if (form.type === "milestone") {
    return [
      formatI18nTemplate(copy.summaryMilestoneCondition, {
        metric: copy.metrics[form.metric],
        step: form.milestoneStep || "0",
      }),
    ];
  }
  return [
    formatI18nTemplate(copy.summaryHealthCondition, {
      hours: form.hours || "0",
    }),
  ];
}

function ruleSummaryTitle(
  copy: AppMessages["teamManagement"]["notifications"],
  form: RuleFormState,
): string {
  if (form.type === "threshold" || form.type === "change") {
    return formatI18nTemplate(copy.summaryWhenConditions, {
      combinator: form.combinator === "any" ? copy.matchAny : copy.matchAll,
      type: copy.ruleTypes[form.type],
    });
  }
  return formatI18nTemplate(copy.summaryWhenSingleCondition, {
    type: copy.ruleTypes[form.type],
  });
}

function RuleFormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <hr className="border-border" />
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function RuleFormFields({
  copy,
  locale,
  form,
  sites,
  onChange,
}: {
  copy: AppMessages["teamManagement"]["notifications"];
  locale: Locale;
  form: RuleFormState;
  sites: SiteData[];
  onChange: (patch: Partial<RuleFormState>) => void;
}) {
  const timeZones = useMemo(() => supportedTimeZones(), []);
  const timeZoneOptionTimestamp = useMemo(() => Date.now(), []);
  const timeZoneOptions = useMemo(
    () =>
      buildTimeZoneOptions({
        locale: intlLocale(locale),
        supported: timeZones,
        selected: form.timezone,
        active: form.timezone,
        timestampMs: timeZoneOptionTimestamp,
      }),
    [form.timezone, locale, timeZoneOptionTimestamp, timeZones],
  );

  function updateCondition(id: string, patch: Partial<MetricConditionForm>) {
    onChange({
      conditions: form.conditions.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    });
  }

  function addCondition() {
    onChange({
      conditions: [
        ...form.conditions,
        defaultMetricCondition(nextConditionId(form.conditions)),
      ],
    });
  }

  function removeCondition(id: string) {
    if (form.conditions.length <= 1) return;
    onChange({
      conditions: form.conditions.filter((condition) => condition.id !== id),
    });
  }

  const summaryLines = ruleSummaryLines(copy, form);

  return (
    <div className="space-y-5">
      <RuleFormSection title={copy.ruleInfoSection}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>{copy.nameLabel}</FieldLabel>
            <Input
              value={form.name}
              maxLength={160}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{copy.siteLabel}</FieldLabel>
            <Select
              value={form.siteId}
              onValueChange={(siteId) => onChange({ siteId })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={copy.chooseSite} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{copy.ruleTypeLabel}</FieldLabel>
            <Select
              value={form.type}
              onValueChange={(value) => {
                if (isRuleFormType(value)) {
                  onChange({
                    type: value,
                    scheduleKind: value === "report" ? "daily" : "interval",
                    reportType: value === "report" ? "daily" : form.reportType,
                  });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="report">{copy.ruleTypes.report}</SelectItem>
                <SelectItem value="milestone">
                  {copy.ruleTypes.milestone}
                </SelectItem>
                <SelectItem value="threshold">
                  {copy.ruleTypes.threshold}
                </SelectItem>
                <SelectItem value="change">{copy.ruleTypes.change}</SelectItem>
                <SelectItem value="health">{copy.ruleTypes.health}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{copy.recipientLabel}</FieldLabel>
            <Select
              value={form.recipientMode}
              onValueChange={(value) => {
                if (
                  value === "creator" ||
                  value === "team_admins" ||
                  value === "all_team_members"
                ) {
                  onChange({ recipientMode: value });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_admins">
                  {copy.recipientModes.team_admins}
                </SelectItem>
                <SelectItem value="creator">
                  {copy.recipientModes.creator}
                </SelectItem>
                <SelectItem value="all_team_members">
                  {copy.recipientModes.all_team_members}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{copy.enabledLabel}</FieldLabel>
            <div className="flex h-8 items-center gap-2">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(checked) => onChange({ enabled: !!checked })}
              />
              <span className="text-xs text-muted-foreground">
                {copy.enabledHint}
              </span>
            </div>
          </Field>
        </div>
      </RuleFormSection>

      <RuleFormSection title={copy.scheduleSection}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel>{copy.scheduleLabel}</FieldLabel>
            <Select
              value={form.scheduleKind}
              onValueChange={(value) => {
                if (isScheduleKind(value)) {
                  onChange({
                    scheduleKind: value,
                    reportType: isReportType(value) ? value : form.reportType,
                  });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">
                  {copy.scheduleKinds.daily}
                </SelectItem>
                <SelectItem value="weekly">
                  {copy.scheduleKinds.weekly}
                </SelectItem>
                <SelectItem value="monthly">
                  {copy.scheduleKinds.monthly}
                </SelectItem>
                <SelectItem value="quarterly">
                  {copy.scheduleKinds.quarterly}
                </SelectItem>
                <SelectItem value="yearly">
                  {copy.scheduleKinds.yearly}
                </SelectItem>
                <SelectItem value="interval">
                  {copy.scheduleKinds.interval}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.scheduleKind !== "interval" ? (
            <>
              <Field>
                <FieldLabel>{copy.timeLabel}</FieldLabel>
                <Select
                  value={form.time}
                  onValueChange={(time) => onChange({ time })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="md:col-span-1">
                <FieldLabel>{copy.timezoneLabel}</FieldLabel>
                <Select
                  value={form.timezone}
                  onValueChange={(timezone) => onChange({ timezone })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {timeZoneOptions.map((timeZone) => (
                      <SelectItem key={timeZone.value} value={timeZone.value}>
                        {timeZone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {form.scheduleKind === "weekly" ? (
                <Field>
                  <FieldLabel>{copy.dayLabel}</FieldLabel>
                  <Select
                    value={form.dayOfWeek}
                    onValueChange={(dayOfWeek) => onChange({ dayOfWeek })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEK_DAY_INDEXES.map((index) => (
                        <SelectItem key={index} value={String(index)}>
                          {copy.weekDays[index]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              {form.scheduleKind === "monthly" ||
              form.scheduleKind === "quarterly" ||
              form.scheduleKind === "yearly" ? (
                <Field>
                  <FieldLabel>{copy.dayOfMonthLabel}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dayOfMonth}
                    onChange={(event) =>
                      onChange({ dayOfMonth: event.target.value })
                    }
                  />
                </Field>
              ) : null}
              {form.scheduleKind === "yearly" ? (
                <Field>
                  <FieldLabel>{copy.monthLabel}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={form.month}
                    onChange={(event) =>
                      onChange({ month: event.target.value })
                    }
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <Field>
              <FieldLabel>{copy.intervalLabel}</FieldLabel>
              <Select
                value={form.everyMinutes}
                onValueChange={(everyMinutes) => onChange({ everyMinutes })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">
                    {copy.intervalOptions.every30Minutes}
                  </SelectItem>
                  <SelectItem value="60">
                    {copy.intervalOptions.everyHour}
                  </SelectItem>
                  <SelectItem value="360">
                    {copy.intervalOptions.every6Hours}
                  </SelectItem>
                  <SelectItem value="720">
                    {copy.intervalOptions.every12Hours}
                  </SelectItem>
                  <SelectItem value="1440">
                    {copy.intervalOptions.everyDay}
                  </SelectItem>
                  <SelectItem value="10080">
                    {copy.intervalOptions.every7Days}
                  </SelectItem>
                  <SelectItem value="43200">
                    {copy.intervalOptions.every30Days}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
      </RuleFormSection>

      <RuleFormSection title={copy.conditionSection}>
        {form.type === "report" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>{copy.reportPeriodLabel}</FieldLabel>
              <Select
                value={form.reportType}
                onValueChange={(value) => {
                  if (isReportType(value)) {
                    onChange({ reportType: value, scheduleKind: value });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {copy.scheduleKinds[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        {form.type === "milestone" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>{copy.metricLabel}</FieldLabel>
              <Select
                value={form.metric}
                onValueChange={(value) => {
                  if (
                    value === "views" ||
                    value === "visitors" ||
                    value === "sessions"
                  ) {
                    onChange({ metric: value });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="views">{copy.metrics.views}</SelectItem>
                  <SelectItem value="visitors">
                    {copy.metrics.visitors}
                  </SelectItem>
                  <SelectItem value="sessions">
                    {copy.metrics.sessions}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{copy.milestoneEveryLabel}</FieldLabel>
              <Input
                type="number"
                min={1}
                value={form.milestoneStep}
                onChange={(event) =>
                  onChange({ milestoneStep: event.target.value })
                }
              />
            </Field>
          </div>
        ) : null}

        {form.type === "threshold" || form.type === "change" ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>{copy.matchLabel}</FieldLabel>
                <Select
                  value={form.combinator}
                  onValueChange={(value) => {
                    if (value === "all" || value === "any") {
                      onChange({ combinator: value });
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.matchAll}</SelectItem>
                    <SelectItem value="any">{copy.matchAny}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="space-y-3">
              {form.conditions.map((condition, index) => (
                <div
                  key={condition.id}
                  className="grid gap-3 border-l border-border pl-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
                >
                  <div className="text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-6">
                    {formatI18nTemplate(copy.conditionItemTitle, {
                      index: String(index + 1),
                    })}
                  </div>
                  <Field>
                    <FieldLabel>{copy.metricLabel}</FieldLabel>
                    <Select
                      value={condition.metric}
                      onValueChange={(value) => {
                        if (
                          value === "views" ||
                          value === "visitors" ||
                          value === "sessions"
                        ) {
                          updateCondition(condition.id, { metric: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="views">
                          {copy.metrics.views}
                        </SelectItem>
                        <SelectItem value="visitors">
                          {copy.metrics.visitors}
                        </SelectItem>
                        <SelectItem value="sessions">
                          {copy.metrics.sessions}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>{copy.windowLabel}</FieldLabel>
                    <Select
                      value={condition.window}
                      onValueChange={(value) => {
                        if (
                          value === "last_1h" ||
                          value === "last_24h" ||
                          value === "yesterday"
                        ) {
                          updateCondition(condition.id, { window: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_1h">
                          {copy.windows.last_1h}
                        </SelectItem>
                        <SelectItem value="last_24h">
                          {copy.windows.last_24h}
                        </SelectItem>
                        <SelectItem value="yesterday">
                          {copy.windows.yesterday}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>{copy.operatorLabel}</FieldLabel>
                    <Select
                      value={condition.operator}
                      onValueChange={(value) => {
                        if (
                          value === ">" ||
                          value === ">=" ||
                          value === "<" ||
                          value === "<="
                        ) {
                          updateCondition(condition.id, { operator: value });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value=">=">&gt;=</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value="<=">&lt;=</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>
                      {form.type === "change"
                        ? copy.changeValueLabel
                        : copy.valueLabel}
                    </FieldLabel>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(event) =>
                        updateCondition(condition.id, {
                          value: event.target.value,
                        })
                      }
                    />
                  </Field>
                  {form.type === "change" ? (
                    <Field>
                      <FieldLabel>{copy.changeModeLabel}</FieldLabel>
                      <Select
                        value={condition.changeMode}
                        onValueChange={(value) => {
                          if (value === "absolute" || value === "percent") {
                            updateCondition(condition.id, {
                              changeMode: value,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">
                            {copy.changeModePercent}
                          </SelectItem>
                          <SelectItem value="absolute">
                            {copy.changeModeAbsolute}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  <div className="flex items-end sm:col-span-2 lg:col-span-1 lg:w-20">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full px-2"
                      disabled={form.conditions.length <= 1}
                      onClick={() => removeCondition(condition.id)}
                      aria-label={copy.removeCondition}
                    >
                      <RiDeleteBinLine className="size-4" />
                      <span className="lg:sr-only">{copy.removeCondition}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addCondition}>
              <RiAddLine />
              <span>{copy.addCondition}</span>
            </Button>
          </div>
        ) : null}

        {form.type === "health" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>{copy.noDataHoursLabel}</FieldLabel>
              <Input
                type="number"
                min={1}
                value={form.hours}
                onChange={(event) => onChange({ hours: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </RuleFormSection>

      <RuleFormSection title={copy.deliverySection}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel>{copy.cooldownLabel}</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.cooldownMinutes}
              onChange={(event) =>
                onChange({ cooldownMinutes: event.target.value })
              }
            />
            <FieldDescription>{copy.cooldownDescription}</FieldDescription>
          </Field>
        </div>
      </RuleFormSection>

      <RuleFormSection title={copy.summarySection}>
        <div className="space-y-2 text-sm">
          <p>{ruleSummaryTitle(copy, form)}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {summaryLines.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      </RuleFormSection>
    </div>
  );
}

export function TeamNotificationsClient({
  locale,
  messages,
  teamId,
  teamSlug,
  currentUserId,
}: TeamNotificationsClientProps) {
  const copy = messages.teamManagement.notifications;
  const [rules, setRules] = useState<NotificationRuleData[]>([]);
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewingId, setPreviewingId] = useState("");
  const [runningId, setRunningId] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<NotificationRuleEvaluationData | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const siteById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  );
  const enabledCount = useMemo(
    () => rules.filter((rule) => rule.enabled).length,
    [rules],
  );
  const canCreateRule = sites.length > 0;

  async function loadRules() {
    setLoading(true);
    try {
      const [nextRules, nextSites, emailConfig] = await Promise.all([
        fetchNotificationRules({ teamId }),
        fetchAdminSites(teamId),
        fetchNotificationEmailConfig(),
      ]);
      setRules(nextRules);
      setSites(nextSites);
      setEmailConfigured(
        emailConfig.enabled &&
          emailConfig.provider === "resend" &&
          Boolean(emailConfig.fromEmail) &&
          emailConfig.resend.configured,
      );
    } catch {
      toast.error(copy.loadRulesFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, [teamId]);

  function openCreate(type: RuleFormType = "report") {
    if (!canCreateRule) return;
    const firstSite = sites[0];
    setForm({
      ...EMPTY_FORM,
      type,
      siteId: firstSite?.id ?? "",
      name: defaultName(copy, type, firstSite),
      scheduleKind: type === "report" ? "daily" : "interval",
    });
    setDialogOpen(true);
  }

  function openEdit(rule: NotificationRuleData) {
    setForm(inferFormFromRule(rule));
    setDialogOpen(true);
  }

  async function saveRule() {
    if (saving) return;
    if (!form.siteId) {
      toast.error(copy.pleaseChooseSite);
      return;
    }
    setSaving(true);
    try {
      const payload = buildRulePayload(copy, form, sites);
      const saved = form.id
        ? await updateNotificationRule({ ruleId: form.id, teamId, ...payload })
        : await createNotificationRule({ teamId, ...payload });
      setRules((current) =>
        form.id
          ? current.map((rule) => (rule.id === saved.id ? saved : rule))
          : [saved, ...current],
      );
      setDialogOpen(false);
      toast.success(form.id ? copy.ruleUpdated : copy.ruleCreated);
    } catch {
      toast.error(form.id ? copy.updateRuleFailed : copy.createRuleFailed);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: NotificationRuleData) {
    try {
      const updated = await updateNotificationRule({
        ruleId: rule.id,
        enabled: !rule.enabled,
      });
      setRules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      toast.error(copy.updateRuleFailed);
    }
  }

  async function removeRule(rule: NotificationRuleData) {
    if (
      !window.confirm(
        formatI18nTemplate(copy.deleteConfirm, { name: rule.name }),
      )
    )
      return;
    try {
      await deleteNotificationRule({ ruleId: rule.id });
      setRules((current) => current.filter((item) => item.id !== rule.id));
      toast.success(copy.ruleDeleted);
    } catch {
      toast.error(copy.deleteRuleFailed);
    }
  }

  async function handleSendTest() {
    if (testing) return;
    setTesting(true);
    try {
      await sendNotificationTest({ teamId, userId: currentUserId });
      toast.success(copy.testNotificationSent);
      setTestDialogOpen(false);
    } catch {
      toast.error(copy.sendTestNotificationFailed);
    } finally {
      setTesting(false);
    }
  }

  async function handlePreview(rule: NotificationRuleData) {
    if (previewingId) return;
    setPreviewingId(rule.id);
    try {
      const result = await previewNotificationRule({ ruleId: rule.id });
      setPreviewResult(result);
      setPreviewDialogOpen(true);
    } catch {
      toast.error(copy.previewFailed);
    } finally {
      setPreviewingId("");
    }
  }

  async function handleRunNow(rule: NotificationRuleData) {
    if (runningId) return;
    setRunningId(rule.id);
    try {
      const result = await runNotificationRuleNow({ ruleId: rule.id });
      toast.success(
        formatI18nTemplate(copy.runResultToast, {
          messages: result.messageCount,
          sent: Number(result.summary.emailSent ?? 0),
          failed: Number(result.summary.emailFailed ?? 0),
        }),
      );
      await loadRules();
    } catch {
      toast.error(copy.runFailed);
    } finally {
      setRunningId("");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <Button type="button" variant="outline" asChild>
              <Link
                href={`/${locale}/app/${teamSlug}/notifications/email-preview`}
              >
                <RiMailSendLine />
                <span>{copy.emailPreview}</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTestDialogOpen(true)}
            >
              <RiMailSendLine />
              <span>{copy.sendTestNotification}</span>
            </Button>
            <Button
              type="button"
              onClick={() => openCreate()}
              disabled={!canCreateRule}
              title={!canCreateRule ? copy.noSitesForRules : copy.createRule}
            >
              <RiAddLine />
              <span>{copy.createRule}</span>
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{copy.rulesTitle}</CardTitle>
            <CardDescription>
              {formatI18nTemplate(copy.enabledCount, {
                count: enabledCount,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canCreateRule ? (
              <div className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {copy.noSitesForRules}
              </div>
            ) : null}
            <AutoResizer initial>
              <AutoTransition
                transitionKey={
                  loading ? "loading" : rules.length === 0 ? "empty" : "data"
                }
                initial={false}
                duration={0.18}
                type="fade"
                presenceMode="wait"
              >
                {loading ? (
                  <div
                    key="loading"
                    className="flex h-40 items-center justify-center text-sm text-muted-foreground"
                  >
                    <Spinner className="mr-2 size-4" />
                    {copy.loadingRules}
                  </div>
                ) : rules.length === 0 ? (
                  <div
                    key="empty"
                    className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    <RiNotification3Line className="size-8 text-muted-foreground/70" />
                    <p>{copy.empty}</p>
                  </div>
                ) : (
                  <Table key="data">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{copy.columns.name}</TableHead>
                        <TableHead>{copy.columns.type}</TableHead>
                        <TableHead>{copy.columns.site}</TableHead>
                        <TableHead>{copy.columns.recipient}</TableHead>
                        <TableHead>{copy.columns.schedule}</TableHead>
                        <TableHead>{copy.columns.condition}</TableHead>
                        <TableHead>{copy.lastChecked}</TableHead>
                        <TableHead>{copy.lastTriggered}</TableHead>
                        <TableHead>{copy.columns.nextRun}</TableHead>
                        <TableHead>{copy.columns.status}</TableHead>
                        <TableHead>{copy.actions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">
                            {rule.name}
                          </TableCell>
                          <TableCell>
                            {ruleTypeLabel(copy, rule.type)}
                          </TableCell>
                          <TableCell>
                            {siteLabel(siteById, rule.siteId)}
                          </TableCell>
                          <TableCell>
                            {recipientLabel(
                              copy,
                              String(rule.recipient.mode ?? ""),
                            )}
                          </TableCell>
                          <TableCell>{scheduleLabel(copy, rule)}</TableCell>
                          <TableCell>{conditionLabel(copy, rule)}</TableCell>
                          <TableCell>
                            {formatRunAt(locale, rule.lastCheckedAt)}
                          </TableCell>
                          <TableCell>
                            {formatRunAt(locale, rule.lastTriggeredAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>
                                {nextRunLabel(copy, locale, rule, nowSeconds)}
                              </span>
                              {isCoolingDown(rule, nowSeconds) ? (
                                <Badge variant="secondary">
                                  {formatI18nTemplate(copy.coolingDownUntil, {
                                    time: formatRunAt(
                                      locale,
                                      rule.cooldownUntil,
                                    ),
                                  })}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={rule.enabled ? "default" : "secondary"}
                            >
                              {rule.enabled
                                ? copy.status.enabled
                                : copy.status.disabled}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <TableActionButton
                                label={copy.preview}
                                disabled={previewingId === rule.id}
                                onClick={() => void handlePreview(rule)}
                                transitionKey={
                                  previewingId === rule.id
                                    ? "previewing"
                                    : "preview"
                                }
                              >
                                {previewingId === rule.id ? (
                                  <Spinner className="size-3" />
                                ) : (
                                  <RiEyeLine className="size-4" />
                                )}
                              </TableActionButton>
                              <TableActionButton
                                label={copy.runNow}
                                disabled={runningId === rule.id}
                                onClick={() => void handleRunNow(rule)}
                                transitionKey={
                                  runningId === rule.id ? "running" : "run"
                                }
                              >
                                {runningId === rule.id ? (
                                  <Spinner className="size-3" />
                                ) : (
                                  <RiPlayCircleLine className="size-4" />
                                )}
                              </TableActionButton>
                              <TableActionButton
                                label={copy.edit}
                                onClick={() => openEdit(rule)}
                              >
                                <RiEditLine className="size-4" />
                              </TableActionButton>
                              <TableActionButton
                                label={
                                  rule.enabled ? copy.disable : copy.enable
                                }
                                onClick={() => void toggleRule(rule)}
                                transitionKey={
                                  rule.enabled ? "enabled" : "disabled"
                                }
                              >
                                {rule.enabled ? (
                                  <RiPauseCircleLine className="size-4" />
                                ) : (
                                  <RiPlayCircleLine className="size-4" />
                                )}
                              </TableActionButton>
                              <TableActionButton
                                label={copy.delete}
                                tone="destructive"
                                onClick={() => void removeRule(rule)}
                              >
                                <RiDeleteBinLine className="size-4" />
                              </TableActionButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </AutoTransition>
            </AutoResizer>
          </CardContent>
        </Card>
      </div>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.deliveryTestTitle}</DialogTitle>
            <DialogDescription>
              {copy.deliveryTestDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <RiCheckboxCircleLine className="size-4 text-emerald-600" />
              {copy.inAppTestHint}
            </div>
            <div
              className={`flex items-center gap-2${emailConfigured ? " text-foreground" : ""}`}
            >
              <RiMailSendLine
                className={`size-4${emailConfigured ? " text-emerald-600" : ""}`}
              />
              {emailConfigured
                ? copy.emailTestConfiguredHint
                : copy.emailTestUnconfiguredHint}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTestDialogOpen(false)}
              disabled={testing}
            >
              {messages.teamSelect.cancel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSendTest}
              disabled={testing}
            >
              {testing ? <Spinner className="size-4" /> : <RiMailSendLine />}
              <span>{copy.sendTestNotification}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.previewDialogTitle}</DialogTitle>
            <DialogDescription>
              {copy.previewDialogDescription}
            </DialogDescription>
          </DialogHeader>
          {previewResult ? (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {copy.previewFields.status}
                  </p>
                  <Badge variant="outline">{previewResult.status}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {copy.previewFields.summary}
                  </p>
                  <p className="break-words">{previewSummary(previewResult)}</p>
                </div>
              </div>
              {previewResult.status === "triggered" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {copy.previewFields.title}
                    </p>
                    <p className="font-medium">{previewResult.message.title}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {copy.previewFields.bodyText}
                    </p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-5">
                      {previewResult.message.bodyText}
                    </pre>
                  </div>
                </>
              ) : null}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {copy.previewFields.data}
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
                  {jsonBlock(previewResult.data)}
                </pre>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewDialogOpen(false)}
            >
              {messages.teamSelect.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(820px,calc(100vh-2rem))] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? copy.editRule : copy.createRule}
            </DialogTitle>
            <DialogDescription>{copy.dialogDescription}</DialogDescription>
          </DialogHeader>
          <RuleFormFields
            copy={copy}
            locale={locale}
            form={form}
            sites={sites}
            onChange={(patch) =>
              setForm((current) => ({
                ...current,
                ...patch,
              }))
            }
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {messages.teamSelect.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => void saveRule()}
              disabled={saving}
            >
              {saving ? <Spinner className="size-4" /> : <RiSave3Line />}
              <span>{form.id ? copy.saveRule : copy.createRule}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
