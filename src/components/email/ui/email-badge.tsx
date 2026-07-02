import * as React from "react";

import type { NotificationSeverity } from "@/lib/notifications/message-types";

import { emailTableResetStyle, emailTheme } from "./email-theme";

function severityStyles() {
  return {
    info: {
      color: emailTheme.colors.info,
      backgroundColor: emailTheme.colors.infoSoft,
      border: emailTheme.colors.infoBorder,
    },
    success: {
      color: emailTheme.colors.success,
      backgroundColor: emailTheme.colors.successSoft,
      border: emailTheme.colors.successBorder,
    },
    warning: {
      color: emailTheme.colors.warning,
      backgroundColor: emailTheme.colors.warningSoft,
      border: emailTheme.colors.warningBorder,
    },
    critical: {
      color: emailTheme.colors.destructive,
      backgroundColor: emailTheme.colors.destructiveSoft,
      border: emailTheme.colors.destructiveBorder,
    },
  } satisfies Record<
    NotificationSeverity,
    { color: string; backgroundColor: string; border: string }
  >;
}

export function EmailBadge({
  children,
  severity,
}: {
  children: string;
  severity: NotificationSeverity;
}) {
  const colors = severityStyles()[severity];
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{
        margin: "0 0 12px",
        ...emailTableResetStyle,
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              padding: "3px 8px",
              border: `1px solid ${colors.border}`,
              borderRadius: emailTheme.radius,
              backgroundColor: colors.backgroundColor,
              color: colors.color,
              fontSize: "12px",
              fontWeight: "500",
              lineHeight: "18px",
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
