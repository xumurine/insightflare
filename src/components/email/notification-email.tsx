import * as React from "react";
import { Heading, Text } from "react-email";

import { EmailBadge } from "@/components/email/ui/email-badge";
import { EmailCard } from "@/components/email/ui/email-card";
import { EmailLayout } from "@/components/email/ui/email-layout";
import {
  EmailMetricCard,
  EmailMetricGrid,
} from "@/components/email/ui/email-metric";
import {
  EmailListTable,
  EmailTable,
  type EmailTableRow,
} from "@/components/email/ui/email-table";
import {
  createEmailTextStyles,
  emailTheme,
} from "@/components/email/ui/email-theme";
import type { Locale } from "@/lib/i18n/config";
import type { NotificationContent } from "@/lib/notifications/content";
import {
  notificationMetricLabel,
  notificationWindowLabel,
} from "@/lib/notifications/content";
import {
  formatNotificationDateTime,
  formatNotificationNumber,
} from "@/lib/notifications/email-format";
import { NOTIFICATION_EMAIL_MESSAGES } from "@/lib/notifications/email-i18n";
import type { NotificationMessage } from "@/lib/notifications/message-store";

export interface NotificationEmailProps {
  locale: Locale;
  content: NotificationContent;
  message: NotificationMessage;
  timeZone?: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatLastSeen(
  value: unknown,
  locale: Locale,
  timeZone?: string | null,
): string {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  return (
    formatNotificationDateTime(value, locale, timeZone) || messages.common.never
  );
}

function Intro({ content }: { content: NotificationContent }) {
  const textStyles = createEmailTextStyles();
  return (
    <div
      style={{
        margin: "0 0 16px",
        padding: "0 0 14px",
        borderBottom: `1px solid ${emailTheme.colors.border}`,
      }}
    >
      <Heading as="h1" style={textStyles.heading}>
        {content.title}
      </Heading>
      <Text style={textStyles.body}>{content.summary}</Text>
    </div>
  );
}

function ReportEmail({ locale, message }: NotificationEmailProps) {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  const range = record(message.data.range);
  const metrics = record(message.data.metrics);
  const topPages = rows(message.data.topPages);
  const topReferrers = rows(message.data.topReferrers);
  const pageRows: EmailTableRow[] = topPages.map((page, index) => ({
    label: `${index + 1}. ${textValue(page.path, "/")}`,
    value: `${formatNotificationNumber(page.views, locale)} ${messages.common.viewsUnit}`,
  }));
  const referrerRows: EmailTableRow[] = topReferrers.map((referrer, index) => ({
    label: `${index + 1}. ${textValue(referrer.referrer, messages.common.direct)}`,
    value: `${formatNotificationNumber(referrer.visits, locale)} ${messages.common.visits}`,
  }));

  return (
    <>
      <EmailTable
        rows={[
          {
            label: messages.common.date,
            value: textValue(range.label),
          },
        ]}
      />
      <EmailMetricGrid>
        <EmailMetricCard
          label={messages.common.views}
          value={formatNotificationNumber(metrics.views, locale)}
        />
        <EmailMetricCard
          label={messages.common.visitors}
          value={formatNotificationNumber(metrics.visitors, locale)}
        />
        <EmailMetricCard
          label={messages.common.sessions}
          value={formatNotificationNumber(metrics.sessions, locale)}
        />
      </EmailMetricGrid>
      <EmailListTable
        title={messages.common.topPages}
        rows={pageRows}
        empty={messages.common.noPageData}
      />
      <EmailListTable
        title={messages.common.topReferrers}
        rows={referrerRows}
        empty={messages.common.noReferrerData}
      />
    </>
  );
}

function ThresholdEmail({ locale, message }: NotificationEmailProps) {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  const operator = textValue(message.data.operator, ">=");
  return (
    <>
      <EmailBadge severity="warning">
        {messages.common.severity.warning}
      </EmailBadge>
      <EmailTable
        rows={[
          {
            label: messages.common.metric,
            value: notificationMetricLabel(locale, message.data.metric),
          },
          {
            label: messages.common.window,
            value: notificationWindowLabel(locale, message.data.window),
          },
          {
            label: messages.common.currentValue,
            value: formatNotificationNumber(message.data.value, locale),
          },
          {
            label: messages.common.threshold,
            value: `${operator} ${formatNotificationNumber(message.data.target, locale)}`,
          },
        ]}
      />
    </>
  );
}

function HealthEmail({
  locale,
  content,
  message,
  timeZone,
}: NotificationEmailProps) {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  return (
    <>
      <EmailBadge severity="critical">
        {messages.common.severity.critical}
      </EmailBadge>
      <EmailTable
        rows={[
          {
            label: messages.common.lastSeen,
            value: formatLastSeen(message.data.lastSeenAt, locale, timeZone),
          },
        ]}
      />
      <Text
        style={{
          margin: "16px 0 0",
          padding: "12px",
          border: `1px solid ${emailTheme.colors.destructiveBorder}`,
          borderRadius: emailTheme.radius,
          backgroundColor: emailTheme.colors.destructiveSoft,
          color: "#525252",
          fontSize: "14px",
          lineHeight: "22px",
        }}
      >
        {content.summary}
      </Text>
    </>
  );
}

function FallbackEmail({ content }: { content: NotificationContent }) {
  return (
    <Text
      style={{
        margin: "0",
        color: "#404040",
        fontSize: "14px",
        lineHeight: "22px",
        whiteSpace: "pre-line",
      }}
    >
      {content.bodyText}
    </Text>
  );
}

export function NotificationEmail(props: NotificationEmailProps) {
  const { locale, content, message } = props;
  return (
    <EmailLayout locale={locale} preview={content.summary}>
      <EmailCard>
        <Intro content={content} />
        {message.type === "report" ? <ReportEmail {...props} /> : null}
        {message.type === "threshold" ? <ThresholdEmail {...props} /> : null}
        {message.type === "health" ? <HealthEmail {...props} /> : null}
        {message.type !== "report" &&
        message.type !== "threshold" &&
        message.type !== "health" ? (
          <FallbackEmail content={content} />
        ) : null}
      </EmailCard>
    </EmailLayout>
  );
}
