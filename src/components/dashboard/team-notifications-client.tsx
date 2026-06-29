"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiCheckboxCircleLine,
  RiMailSendLine,
  RiNotification3Line,
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
  fetchNotificationEmailConfig,
  fetchNotificationRules,
  type NotificationRuleData,
  sendNotificationTest,
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

export function TeamNotificationsClient({
  locale,
  messages,
  teamId,
  currentUserId,
}: TeamNotificationsClientProps) {
  const copy = messages.teamManagement.notifications;
  const [rules, setRules] = useState<NotificationRuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);

  const enabledCount = useMemo(
    () => rules.filter((rule) => rule.enabled).length,
    [rules],
  );

  async function loadRules() {
    setLoading(true);
    try {
      const [nextRules, emailConfig] = await Promise.all([
        fetchNotificationRules({ teamId }),
        fetchNotificationEmailConfig(),
      ]);
      setRules(nextRules);
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

  async function handleCreateTestRule() {
    if (creating) return;
    setCreating(true);
    try {
      const rule = await createNotificationRule({
        teamId,
        name: copy.testRuleName,
        type: "test",
        schedule: { kind: "interval", everyMinutes: 60 },
        recipient: { mode: "creator" },
      });
      setRules((current) => [rule, ...current]);
      toast.success(copy.testRuleCreated);
    } catch {
      toast.error(copy.createTestRuleFailed);
    } finally {
      setCreating(false);
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
      <PageHeading title={copy.title} subtitle={copy.subtitle} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{copy.rulesTitle}</CardTitle>
              <CardDescription>
                {formatI18nTemplate(copy.enabledCount, {
                  count: enabledCount,
                })}
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateTestRule}
              disabled={creating}
            >
              {creating ? <Spinner className="size-4" /> : <RiAddLine />}
              <span>{copy.createTestRule}</span>
            </Button>
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
                    <TableHead>{copy.columns.schedule}</TableHead>
                    <TableHead>{copy.columns.nextRun}</TableHead>
                    <TableHead>{copy.columns.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>{ruleTypeLabel(copy, rule.type)}</TableCell>
                      <TableCell>{scheduleLabel(copy, rule)}</TableCell>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
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
    </div>
  );
}
