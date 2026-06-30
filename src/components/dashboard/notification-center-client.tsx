"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type RemixiconComponentType,
  RiAlertLine,
  RiCheckDoubleLine,
  RiCheckLine,
  RiFileList3Line,
  RiInboxLine,
  RiMailUnreadLine,
  RiNotification3Line,
  RiRefreshLine,
  RiSettings3Line,
} from "@remixicon/react";
import { toast } from "sonner";

import { PageHeading } from "@/components/dashboard/page-heading";
import { AutoResizer } from "@/components/ui/auto-resizer";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/lib/dashboard/format";
import {
  fetchNotificationMessages,
  markAllNotificationMessagesRead,
  markNotificationMessageRead,
  type NotificationMessageData,
} from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatI18nTemplate } from "@/lib/i18n/template";

interface NotificationCenterClientProps {
  locale: Locale;
  messages: AppMessages;
  teamId?: string;
}

type NotificationTab = "all" | "unread" | "attention" | "report";
type NotificationCenterCopy = AppMessages["notificationCenter"];

const NOTIFICATION_TABS: readonly NotificationTab[] = [
  "all",
  "unread",
  "attention",
  "report",
];

const MESSAGE_TYPE_FILTERS = [
  "all",
  "report",
  "threshold",
  "health",
  "test",
] as const;
const SEVERITY_FILTERS = [
  "all",
  "info",
  "success",
  "warning",
  "critical",
] as const;

function severityVariant(
  severity: string,
): "default" | "secondary" | "destructive" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
  return "default";
}

function dictionaryLabel<T extends Record<string, string>>(
  labels: T,
  value: string,
): string {
  if (value in labels) return labels[value as keyof T];
  return value;
}

function isUnread(item: NotificationMessageData): boolean {
  return item.readAt === null;
}

function isReport(item: NotificationMessageData): boolean {
  return item.type === "report";
}

function jsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function durationValue(value: unknown): string {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return "-";
  return `${Math.trunc(duration)} ms`;
}

function countForTab(
  messagesList: NotificationMessageData[],
  tab: NotificationTab,
): number {
  if (tab === "all") return messagesList.length;
  if (tab === "unread") return messagesList.filter(isUnread).length;
  if (tab === "attention") {
    return messagesList.filter(
      (item) => item.requiresAttention && isUnread(item),
    ).length;
  }
  return messagesList.filter(isReport).length;
}

function tabIcon(tab: NotificationTab): RemixiconComponentType {
  if (tab === "unread") return RiMailUnreadLine;
  if (tab === "attention") return RiAlertLine;
  if (tab === "report") return RiFileList3Line;
  return RiInboxLine;
}

function NotificationMetricTab({
  active,
  description,
  icon: Icon,
  label,
  loading,
  value,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: RemixiconComponentType;
  label: string;
  loading: boolean;
  value: number;
  onClick: () => void;
}) {
  const contentKey = loading ? "loading" : String(value);

  return (
    <button
      type="button"
      className="min-w-0 bg-card p-4 text-left"
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
          <Icon className="size-[11px]" />
        </span>
        <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
          {label}
        </p>
      </div>
      <AutoResizer initial className="mt-3">
        <AutoTransition
          transitionKey={contentKey}
          initial={false}
          duration={0.2}
          type="fade"
          presenceMode="wait"
        >
          {loading ? (
            <div key="loading" className="flex h-7 items-center">
              <Spinner className="size-5" />
            </div>
          ) : (
            <p
              key={value}
              className="min-w-0 truncate font-mono text-xl leading-7 font-semibold text-foreground tabular-nums"
            >
              {value}
            </p>
          )}
        </AutoTransition>
      </AutoResizer>
      <p className="mt-3 min-w-0 truncate text-[11px] leading-[14px] text-muted-foreground">
        {description}
      </p>
    </button>
  );
}

function NotificationSectionHeading({
  actions,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="break-words text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="max-w-prose break-words text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function NotificationMessageList({
  copy,
  empty,
  expandedId,
  items,
  locale,
  onRead,
  onToggleDetail,
  updatingId,
}: {
  copy: NotificationCenterCopy;
  empty: string;
  expandedId: string;
  items: NotificationMessageData[];
  locale: Locale;
  onRead: (messageId: string) => void;
  onToggleDetail: (messageId: string) => void;
  updatingId: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <RiNotification3Line className="size-8 text-muted-foreground/70" />
          <p>{empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <h2 className="truncate text-sm font-semibold">{item.title}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>{shortDateTime(locale, item.createdAt * 1000)}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityVariant(item.severity)}>
                      {dictionaryLabel(copy.severities, item.severity)}
                    </Badge>
                    <Badge variant="outline">
                      {dictionaryLabel(copy.messageTypes, item.type)}
                    </Badge>
                    <Badge variant="outline">
                      {dictionaryLabel(
                        copy.deliveryStatuses,
                        item.deliveryStatus,
                      )}
                    </Badge>
                    {item.requiresAttention ? (
                      <Badge variant="secondary">{copy.attention}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              {item.readAt === null ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={updatingId === item.id}
                    onClick={() => onRead(item.id)}
                  >
                    {updatingId === item.id ? (
                      <Spinner className="size-4" />
                    ) : (
                      <RiCheckLine />
                    )}
                    <span>{copy.markRead}</span>
                  </Button>
                </div>
              ) : null}
            </div>
            {item.summary ? (
              <div className="border-t pt-4">
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                  {item.summary}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end border-t pt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onToggleDetail(item.id)}
              >
                <span>
                  {expandedId === item.id ? copy.hideDetails : copy.showDetails}
                </span>
              </Button>
            </div>
            {expandedId === item.id ? (
              <NotificationMessageDetails
                copy={copy}
                item={item}
                locale={locale}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DetailField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words">{children}</p>
    </div>
  );
}

function NotificationMessageDetails({
  copy,
  item,
  locale,
}: {
  copy: NotificationCenterCopy;
  item: NotificationMessageData;
  locale: Locale;
}) {
  const emailResult = recordValue(item.deliveryResults.email);
  return (
    <div className="grid gap-4 rounded-md border bg-muted/30 p-4 text-sm md:grid-cols-2">
      <div className="space-y-1 md:col-span-2">
        <p className="text-xs text-muted-foreground">
          {copy.detailFields.bodyText}
        </p>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5">
          {item.bodyText || item.summary}
        </pre>
      </div>
      <DetailField label={copy.detailFields.type}>
        {dictionaryLabel(copy.messageTypes, item.type)}
      </DetailField>
      <DetailField label={copy.detailFields.severity}>
        {dictionaryLabel(copy.severities, item.severity)}
      </DetailField>
      <DetailField label={copy.detailFields.site}>
        {item.siteId ?? "-"}
      </DetailField>
      <DetailField label={copy.detailFields.ruleId}>
        {item.ruleId ?? "-"}
      </DetailField>
      <DetailField label={copy.detailFields.runId}>
        {item.runId ?? "-"}
      </DetailField>
      <DetailField label={copy.detailFields.batchId}>
        {item.batchId ?? "-"}
      </DetailField>
      <DetailField label={copy.detailFields.deliveryStatus}>
        {dictionaryLabel(copy.deliveryStatuses, item.deliveryStatus)}
      </DetailField>
      <DetailField label={copy.detailFields.locale}>
        {displayValue(item.data.locale)}
      </DetailField>
      <DetailField label={copy.detailFields.createdAt}>
        {shortDateTime(locale, item.createdAt * 1000)}
      </DetailField>
      <DetailField label={copy.detailFields.triggeredAt}>
        {item.triggeredAt
          ? shortDateTime(locale, item.triggeredAt * 1000)
          : "-"}
      </DetailField>
      <DetailField label={copy.detailFields.sentAt}>
        {item.sentAt ? shortDateTime(locale, item.sentAt * 1000) : "-"}
      </DetailField>
      <DetailField label={copy.detailFields.failedAt}>
        {item.failedAt ? shortDateTime(locale, item.failedAt * 1000) : "-"}
      </DetailField>
      <div className="space-y-3 md:col-span-2">
        <p className="text-xs font-medium text-muted-foreground">
          {copy.detailFields.deliveryDetails}
        </p>
        <div className="grid gap-4 rounded-md bg-background p-3 md:grid-cols-2">
          <DetailField label={copy.detailFields.emailStatus}>
            {displayValue(emailResult.status)}
          </DetailField>
          <DetailField label={copy.detailFields.emailReason}>
            {displayValue(emailResult.reason)}
          </DetailField>
          <DetailField label={copy.detailFields.provider}>
            {displayValue(emailResult.provider)}
          </DetailField>
          <DetailField label={copy.detailFields.providerMessageId}>
            {displayValue(emailResult.messageId)}
          </DetailField>
          <DetailField label={copy.detailFields.duration}>
            {durationValue(emailResult.durationMs)}
          </DetailField>
        </div>
      </div>
      <div className="space-y-1 md:col-span-2">
        <p className="text-xs text-muted-foreground">
          {copy.detailFields.deliveryResults}
        </p>
        <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs leading-5">
          {jsonBlock(item.deliveryResults)}
        </pre>
      </div>
    </div>
  );
}

export function NotificationCenterClient({
  locale,
  messages,
  teamId,
}: NotificationCenterClientProps) {
  const copy = messages.notificationCenter;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ruleIdFilter = searchParams.get("ruleId")?.trim() || "";
  const [messagesList, setMessagesList] = useState<NotificationMessageData[]>(
    [],
  );
  const [unreadAttentionCount, setUnreadAttentionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  const filteredMessages = useMemo(() => {
    return messagesList.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (severityFilter !== "all" && item.severity !== severityFilter) {
        return false;
      }
      if (activeTab === "unread") return isUnread(item);
      if (activeTab === "attention") {
        return item.requiresAttention && isUnread(item);
      }
      if (activeTab === "report") return isReport(item);
      return true;
    });
  }, [activeTab, messagesList, severityFilter, typeFilter]);

  const importantMessages = useMemo(
    () => filteredMessages.filter((item) => !isReport(item)),
    [filteredMessages],
  );
  const reportMessages = useMemo(
    () => filteredMessages.filter(isReport),
    [filteredMessages],
  );
  const unreadCount = useMemo(
    () => messagesList.filter(isUnread).length,
    [messagesList],
  );

  const bodyState = loading
    ? "loading"
    : filteredMessages.length === 0
      ? `empty:${activeTab}`
      : `${activeTab}:${filteredMessages.map((item) => item.id).join(":")}`;

  async function loadMessages() {
    setLoading(true);
    try {
      const data = await fetchNotificationMessages({
        teamId,
        ruleId: ruleIdFilter || undefined,
        limit: 80,
      });
      setMessagesList(data.messages);
      setUnreadAttentionCount(data.unreadAttentionCount);
    } catch {
      toast.error(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [ruleIdFilter, teamId]);

  function clearRuleFilter() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("ruleId");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function handleRead(messageId: string) {
    const target = messagesList.find((item) => item.id === messageId);
    setUpdatingId(messageId);
    try {
      const updated = await markNotificationMessageRead({ messageId });
      setMessagesList((current) =>
        current.map((item) =>
          item.id === messageId && updated ? updated : item,
        ),
      );
      if (target?.requiresAttention && target.readAt === null) {
        setUnreadAttentionCount((count) => Math.max(0, count - 1));
      }
    } catch {
      toast.error(copy.markReadFailed);
    } finally {
      setUpdatingId("");
    }
  }

  async function handleReadAll() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationMessagesRead({ teamId });
      await loadMessages();
      toast.success(copy.markAllReadSuccess);
    } catch {
      toast.error(copy.markAllReadFailed);
    } finally {
      setMarkingAll(false);
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
              onClick={handleReadAll}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll ? (
                <Spinner className="size-4" />
              ) : (
                <RiCheckDoubleLine />
              )}
              <span>{copy.markAllRead}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadMessages()}
            >
              {loading ? <Spinner className="size-4" /> : <RiRefreshLine />}
              <span>{loading ? messages.common.loading : copy.refresh}</span>
            </Button>
          </>
        }
      />

      <Card className="py-0">
        <CardContent className="p-0">
          <div className="grid gap-px overflow-hidden bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
            {NOTIFICATION_TABS.map((tab) => (
              <NotificationMetricTab
                key={tab}
                active={activeTab === tab}
                description={copy.tabDescriptions[tab]}
                icon={tabIcon(tab)}
                label={copy.tabs[tab]}
                loading={loading}
                value={
                  tab === "attention"
                    ? unreadAttentionCount
                    : countForTab(messagesList, tab)
                }
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_220px_220px] md:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RiSettings3Line className="size-4 text-muted-foreground" />
              {copy.filtersTitle}
            </div>
            <p className="text-xs text-muted-foreground">
              {copy.filtersDescription}
            </p>
          </div>
          <Field>
            <FieldLabel>{copy.typeFilterLabel}</FieldLabel>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPE_FILTERS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "all"
                      ? copy.allTypes
                      : dictionaryLabel(copy.messageTypes, type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{copy.severityFilterLabel}</FieldLabel>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_FILTERS.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {severity === "all"
                      ? copy.allSeverities
                      : dictionaryLabel(copy.severities, severity)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {ruleIdFilter ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{copy.ruleFilterActive}</p>
              <p className="break-all text-xs text-muted-foreground">
                {ruleIdFilter}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearRuleFilter}
            >
              {copy.ruleFilterClear}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AutoResizer initial>
        <AutoTransition
          transitionKey={bodyState}
          initial={false}
          duration={0.18}
          type="fade"
          presenceMode="wait"
        >
          {loading ? (
            <Card key="loading">
              <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Spinner className="mr-2 size-4" />
                {copy.loading}
              </CardContent>
            </Card>
          ) : filteredMessages.length === 0 ? (
            <Card key="empty">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <RiNotification3Line className="size-8 text-muted-foreground/70" />
                <p>{copy.empty}</p>
              </CardContent>
            </Card>
          ) : (
            <div key="messages" className="space-y-8">
              <section className="space-y-3">
                <NotificationSectionHeading
                  title={copy.sections.importantTitle}
                  subtitle={formatI18nTemplate(
                    copy.sections.importantDescription,
                    {
                      count: unreadAttentionCount,
                    },
                  )}
                />
                <NotificationMessageList
                  copy={copy}
                  empty={copy.sections.importantEmpty}
                  items={importantMessages}
                  locale={locale}
                  expandedId={expandedId}
                  updatingId={updatingId}
                  onRead={(messageId) => void handleRead(messageId)}
                  onToggleDetail={(messageId) =>
                    setExpandedId((current) =>
                      current === messageId ? "" : messageId,
                    )
                  }
                />
              </section>
              <section className="space-y-3">
                <NotificationSectionHeading
                  title={copy.sections.reportsTitle}
                  subtitle={copy.sections.reportsDescription}
                />
                <NotificationMessageList
                  copy={copy}
                  empty={copy.sections.reportsEmpty}
                  items={reportMessages}
                  locale={locale}
                  expandedId={expandedId}
                  updatingId={updatingId}
                  onRead={(messageId) => void handleRead(messageId)}
                  onToggleDetail={(messageId) =>
                    setExpandedId((current) =>
                      current === messageId ? "" : messageId,
                    )
                  }
                />
              </section>
            </div>
          )}
        </AutoTransition>
      </AutoResizer>
    </div>
  );
}
