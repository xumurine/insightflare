"use client";

import { useEffect, useMemo, useState } from "react";
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
import { shortDateTime } from "@/lib/dashboard/format";
import { supportedTimeZones } from "@/lib/dashboard/time-zone";
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

type RuleFormType = "report" | "threshold" | "health";
type RecipientMode = "creator" | "team_admins" | "all_team_members";
type ScheduleKind = "daily" | "interval";

interface RuleFormState {
  id: string;
  name: string;
  type: RuleFormType;
  siteId: string;
  enabled: boolean;
  recipientMode: RecipientMode;
  scheduleKind: ScheduleKind;
  time: string;
  timezone: string;
  everyMinutes: string;
  metric: "views" | "visitors" | "sessions";
  window: "last_1h" | "last_24h" | "yesterday";
  operator: ">" | ">=" | "<" | "<=";
  value: string;
  cooldownMinutes: string;
  hours: string;
}

const EMPTY_FORM: RuleFormState = {
  id: "",
  name: "",
  type: "report",
  siteId: "",
  enabled: true,
  recipientMode: "team_admins",
  scheduleKind: "daily",
  time: "08:00",
  timezone: "UTC",
  everyMinutes: "60",
  metric: "visitors",
  window: "last_1h",
  operator: ">=",
  value: "1000",
  cooldownMinutes: "360",
  hours: "12",
};

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
  if (rule.schedule.kind === "interval") {
    return formatI18nTemplate(copy.scheduleInterval, {
      minutes: String(rule.schedule.everyMinutes ?? 60),
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
  const type =
    rule.type === "health" || rule.type === "threshold" ? rule.type : "report";
  const scheduleKind = rule.schedule.kind === "daily" ? "daily" : "interval";
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
    time: String(rule.schedule.time ?? "08:00"),
    timezone: String(rule.schedule.timezone ?? "UTC"),
    everyMinutes: String(rule.schedule.everyMinutes ?? 60),
    metric:
      rule.condition.metric === "views" || rule.condition.metric === "sessions"
        ? rule.condition.metric
        : "visitors",
    window:
      rule.condition.window === "last_24h" ||
      rule.condition.window === "yesterday"
        ? rule.condition.window
        : "last_1h",
    operator:
      rule.condition.operator === ">" ||
      rule.condition.operator === "<" ||
      rule.condition.operator === "<="
        ? rule.condition.operator
        : ">=",
    value: String(rule.condition.value ?? "1000"),
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
    form.scheduleKind === "daily"
      ? { kind: "daily", time: form.time || "08:00", timezone: form.timezone }
      : {
          kind: "interval",
          everyMinutes: Math.trunc(Number(form.everyMinutes || 60)),
        };
  const condition =
    form.type === "report"
      ? { reportType: "daily" }
      : form.type === "threshold"
        ? {
            metric: form.metric,
            window: form.window,
            operator: form.operator,
            value: Number(form.value || 0),
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

function RuleFormFields({
  copy,
  form,
  sites,
  onChange,
}: {
  copy: AppMessages["teamManagement"]["notifications"];
  form: RuleFormState;
  sites: SiteData[];
  onChange: (patch: Partial<RuleFormState>) => void;
}) {
  const timeZones = useMemo(() => supportedTimeZones(), []);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel>{copy.ruleTypeLabel}</FieldLabel>
          <Select
            value={form.type}
            onValueChange={(value) => {
              if (
                value === "report" ||
                value === "threshold" ||
                value === "health"
              ) {
                onChange({
                  type: value,
                  scheduleKind: value === "report" ? "daily" : "interval",
                });
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="report">{copy.ruleTypes.report}</SelectItem>
              <SelectItem value="threshold">
                {copy.ruleTypes.threshold}
              </SelectItem>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel>{copy.scheduleLabel}</FieldLabel>
          <Select
            value={form.scheduleKind}
            onValueChange={(value) => {
              if (value === "daily" || value === "interval") {
                onChange({ scheduleKind: value });
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{copy.scheduleKinds.daily}</SelectItem>
              <SelectItem value="interval">
                {copy.scheduleKinds.interval}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {form.scheduleKind === "daily" ? (
          <>
            <Field>
              <FieldLabel>{copy.timeLabel}</FieldLabel>
              <Input
                type="time"
                value={form.time}
                onChange={(event) => onChange({ time: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{copy.timezoneLabel}</FieldLabel>
              <Select
                value={form.timezone}
                onValueChange={(timezone) => onChange({ timezone })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {timeZones.map((timeZone) => (
                    <SelectItem key={timeZone} value={timeZone}>
                      {timeZone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {form.type === "threshold" ? (
        <div className="grid gap-4 sm:grid-cols-5">
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
            <FieldLabel>{copy.windowLabel}</FieldLabel>
            <Select
              value={form.window}
              onValueChange={(value) => {
                if (
                  value === "last_1h" ||
                  value === "last_24h" ||
                  value === "yesterday"
                ) {
                  onChange({ window: value });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_1h">{copy.windows.last_1h}</SelectItem>
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
              value={form.operator}
              onValueChange={(value) => {
                if (
                  value === ">" ||
                  value === ">=" ||
                  value === "<" ||
                  value === "<="
                ) {
                  onChange({ operator: value });
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
            <FieldLabel>{copy.valueLabel}</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.value}
              onChange={(event) => onChange({ value: event.target.value })}
            />
          </Field>
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
          </Field>
        </div>
      ) : null}

      {form.type === "health" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>{copy.noDataHoursLabel}</FieldLabel>
            <Input
              type="number"
              min={1}
              value={form.hours}
              onChange={(event) => onChange({ hours: event.target.value })}
            />
          </Field>
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
      ) : null}
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
            <Button type="button" size="sm" variant="outline" asChild>
              <Link
                href={`/${locale}/app/${teamSlug}/notifications/email-preview`}
              >
                <RiMailSendLine />
                <span>{copy.emailPreview}</span>
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setTestDialogOpen(true)}
            >
              <RiMailSendLine />
              <span>{copy.sendTestNotification}</span>
            </Button>
            <Button
              type="button"
              size="sm"
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
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Spinner className="mr-2 size-4" />
                {copy.loadingRules}
              </div>
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <RiNotification3Line className="size-8 text-muted-foreground/70" />
                <p>{copy.empty}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.columns.name}</TableHead>
                    <TableHead>{copy.columns.type}</TableHead>
                    <TableHead>{copy.columns.site}</TableHead>
                    <TableHead>{copy.columns.recipient}</TableHead>
                    <TableHead>{copy.columns.schedule}</TableHead>
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
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>{ruleTypeLabel(copy, rule.type)}</TableCell>
                      <TableCell>{siteLabel(siteById, rule.siteId)}</TableCell>
                      <TableCell>
                        {recipientLabel(
                          copy,
                          String(rule.recipient.mode ?? ""),
                        )}
                      </TableCell>
                      <TableCell>{scheduleLabel(copy, rule)}</TableCell>
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
                                time: formatRunAt(locale, rule.cooldownUntil),
                              })}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.enabled ? "default" : "secondary"}>
                          {rule.enabled
                            ? copy.status.enabled
                            : copy.status.disabled}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="outline"
                            title={copy.preview}
                            disabled={previewingId === rule.id}
                            onClick={() => void handlePreview(rule)}
                          >
                            {previewingId === rule.id ? (
                              <Spinner className="size-3" />
                            ) : (
                              <RiEyeLine />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="outline"
                            title={copy.runNow}
                            disabled={runningId === rule.id}
                            onClick={() => void handleRunNow(rule)}
                          >
                            {runningId === rule.id ? (
                              <Spinner className="size-3" />
                            ) : (
                              <RiPlayCircleLine />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="outline"
                            title={copy.edit}
                            onClick={() => openEdit(rule)}
                          >
                            <RiEditLine />
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="outline"
                            title={rule.enabled ? copy.disable : copy.enable}
                            onClick={() => void toggleRule(rule)}
                          >
                            {rule.enabled ? (
                              <RiPauseCircleLine />
                            ) : (
                              <RiPlayCircleLine />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="destructive"
                            title={copy.delete}
                            onClick={() => void removeRule(rule)}
                          >
                            <RiDeleteBinLine />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
            <Button type="button" onClick={handleSendTest} disabled={testing}>
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
