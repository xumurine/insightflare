"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiCheckboxCircleLine,
  RiDeleteBinLine,
  RiEditLine,
  RiMailSendLine,
  RiNotification3Line,
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
import {
  createNotificationRule,
  deleteNotificationRule,
  fetchAdminSites,
  fetchNotificationEmailConfig,
  fetchNotificationRules,
  type NotificationRuleData,
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

function recipientLabel(mode: string): string {
  if (mode === "creator") return "Creator";
  if (mode === "all_team_members") return "All members";
  if (mode === "users") return "Selected users";
  return "Team admins";
}

function siteLabel(siteById: Map<string, SiteData>, siteId: string | null) {
  if (!siteId) return "-";
  const site = siteById.get(siteId);
  return site ? `${site.name} (${site.domain})` : siteId;
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

function defaultName(type: RuleFormType, site?: SiteData) {
  const prefix = site?.name || "Site";
  if (type === "report") return `${prefix} daily report`;
  if (type === "threshold") return `${prefix} traffic threshold`;
  return `${prefix} health check`;
}

function buildRulePayload(form: RuleFormState, sites: SiteData[]) {
  const site = sites.find((item) => item.id === form.siteId);
  const name = form.name.trim() || defaultName(form.type, site);
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
  form,
  sites,
  onChange,
}: {
  form: RuleFormState;
  sites: SiteData[];
  onChange: (patch: Partial<RuleFormState>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            value={form.name}
            maxLength={160}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Site</FieldLabel>
          <Select
            value={form.siteId}
            onValueChange={(siteId) => onChange({ siteId })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose site" />
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
          <FieldLabel>Rule type</FieldLabel>
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
              <SelectItem value="report">Daily report</SelectItem>
              <SelectItem value="threshold">Threshold</SelectItem>
              <SelectItem value="health">Health</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Recipient</FieldLabel>
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
              <SelectItem value="team_admins">Team admins</SelectItem>
              <SelectItem value="creator">Creator</SelectItem>
              <SelectItem value="all_team_members">All members</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Enabled</FieldLabel>
          <div className="flex h-8 items-center gap-2">
            <Checkbox
              checked={form.enabled}
              onCheckedChange={(checked) => onChange({ enabled: !!checked })}
            />
            <span className="text-xs text-muted-foreground">Run this rule</span>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel>Schedule</FieldLabel>
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
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="interval">Interval</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {form.scheduleKind === "daily" ? (
          <>
            <Field>
              <FieldLabel>Time</FieldLabel>
              <Input
                type="time"
                value={form.time}
                onChange={(event) => onChange({ time: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Timezone</FieldLabel>
              <Input
                value={form.timezone}
                onChange={(event) => onChange({ timezone: event.target.value })}
              />
            </Field>
          </>
        ) : (
          <Field>
            <FieldLabel>Interval</FieldLabel>
            <Select
              value={form.everyMinutes}
              onValueChange={(everyMinutes) => onChange({ everyMinutes })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">Every hour</SelectItem>
                <SelectItem value="360">Every 6 hours</SelectItem>
                <SelectItem value="720">Every 12 hours</SelectItem>
                <SelectItem value="1440">Every day</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {form.type === "threshold" ? (
        <div className="grid gap-4 sm:grid-cols-5">
          <Field>
            <FieldLabel>Metric</FieldLabel>
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
                <SelectItem value="views">Views</SelectItem>
                <SelectItem value="visitors">Visitors</SelectItem>
                <SelectItem value="sessions">Sessions</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Window</FieldLabel>
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
                <SelectItem value="last_1h">Last 1h</SelectItem>
                <SelectItem value="last_24h">Last 24h</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Operator</FieldLabel>
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
            <FieldLabel>Value</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.value}
              onChange={(event) => onChange({ value: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Cooldown</FieldLabel>
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
            <FieldLabel>No data hours</FieldLabel>
            <Input
              type="number"
              min={1}
              value={form.hours}
              onChange={(event) => onChange({ hours: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Cooldown</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.cooldownMinutes}
              onChange={(event) =>
                onChange({ cooldownMinutes: event.target.value })
              }
            />
            <FieldDescription>
              Minutes between repeated alerts.
            </FieldDescription>
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
  currentUserId,
}: TeamNotificationsClientProps) {
  const copy = messages.teamManagement.notifications;
  const [rules, setRules] = useState<NotificationRuleData[]>([]);
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);

  const siteById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  );
  const enabledCount = useMemo(
    () => rules.filter((rule) => rule.enabled).length,
    [rules],
  );

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
    const firstSite = sites[0];
    setForm({
      ...EMPTY_FORM,
      type,
      siteId: firstSite?.id ?? "",
      name: defaultName(type, firstSite),
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
      toast.error("Please choose a site.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildRulePayload(form, sites);
      const saved = form.id
        ? await updateNotificationRule({ ruleId: form.id, teamId, ...payload })
        : await createNotificationRule({ teamId, ...payload });
      setRules((current) =>
        form.id
          ? current.map((rule) => (rule.id === saved.id ? saved : rule))
          : [saved, ...current],
      );
      setDialogOpen(false);
      toast.success(form.id ? "Rule updated." : "Rule created.");
    } catch {
      toast.error(
        form.id ? "Failed to update rule." : "Failed to create rule.",
      );
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
      toast.error("Failed to update rule.");
    }
  }

  async function removeRule(rule: NotificationRuleData) {
    if (!window.confirm(`Delete "${rule.name}"?`)) return;
    try {
      await deleteNotificationRule({ ruleId: rule.id });
      setRules((current) => current.filter((item) => item.id !== rule.id));
      toast.success("Rule deleted.");
    } catch {
      toast.error("Failed to delete rule.");
    }
  }

  async function handleSendTest() {
    if (testing) return;
    setTesting(true);
    try {
      await sendNotificationTest({ teamId, userId: currentUserId });
      toast.success(copy.testNotificationSent);
    } catch {
      toast.error(copy.sendTestNotificationFailed);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendTest}
              disabled={testing}
            >
              {testing ? <Spinner className="size-4" /> : <RiMailSendLine />}
              <span>{copy.sendTestNotification}</span>
            </Button>
            <Button type="button" size="sm" onClick={() => openCreate()}>
              <RiAddLine />
              <span>Create rule</span>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
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
                    <TableHead>Site</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>{copy.columns.schedule}</TableHead>
                    <TableHead>Last checked</TableHead>
                    <TableHead>Last triggered</TableHead>
                    <TableHead>{copy.columns.nextRun}</TableHead>
                    <TableHead>{copy.columns.status}</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>{ruleTypeLabel(copy, rule.type)}</TableCell>
                      <TableCell>{siteLabel(siteById, rule.siteId)}</TableCell>
                      <TableCell>
                        {recipientLabel(String(rule.recipient.mode ?? ""))}
                      </TableCell>
                      <TableCell>{scheduleLabel(copy, rule)}</TableCell>
                      <TableCell>
                        {formatRunAt(locale, rule.lastCheckedAt)}
                      </TableCell>
                      <TableCell>
                        {formatRunAt(locale, rule.lastTriggeredAt)}
                      </TableCell>
                      <TableCell>
                        {formatRunAt(locale, rule.nextRunAt)}
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
                            title="Edit"
                            onClick={() => openEdit(rule)}
                          >
                            <RiEditLine />
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="outline"
                            title={rule.enabled ? "Disable" : "Enable"}
                            onClick={() => void toggleRule(rule)}
                          >
                            <RiPlayCircleLine />
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="destructive"
                            title="Delete"
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

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{copy.deliveryTestTitle}</CardTitle>
            <CardDescription>{copy.deliveryTestDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <RiCheckboxCircleLine className="size-4 text-emerald-600" />
                {copy.inAppTestHint}
              </div>
              <div className="flex items-center gap-2">
                <RiMailSendLine className="size-4" />
                {emailConfigured
                  ? copy.emailTestConfiguredHint
                  : copy.emailTestUnconfiguredHint}
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={handleSendTest}
              disabled={testing}
            >
              {testing ? <Spinner className="size-4" /> : <RiMailSendLine />}
              <span>{copy.sendTestNotification}</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(820px,calc(100vh-2rem))] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit rule" : "Create rule"}</DialogTitle>
            <DialogDescription>
              Configure a basic notification rule for this team.
            </DialogDescription>
          </DialogHeader>
          <RuleFormFields
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
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveRule()}
              disabled={saving}
            >
              {saving ? <Spinner className="size-4" /> : <RiSave3Line />}
              <span>{form.id ? "Save rule" : "Create rule"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
