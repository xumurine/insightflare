import * as React from "react";
import { Text } from "react-email";

import type { NotificationSeverity } from "@/lib/notifications/message-types";

const severityStyles = {
  info: { color: "#1d4ed8", backgroundColor: "#eff6ff", border: "#bfdbfe" },
  success: { color: "#047857", backgroundColor: "#ecfdf5", border: "#a7f3d0" },
  warning: { color: "#b45309", backgroundColor: "#fffbeb", border: "#fde68a" },
  critical: {
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    border: "#fecaca",
  },
} satisfies Record<
  NotificationSeverity,
  { color: string; backgroundColor: string; border: string }
>;

export function EmailBadge({
  children,
  severity,
}: {
  children: string;
  severity: NotificationSeverity;
}) {
  const colors = severityStyles[severity];
  return (
    <Text
      style={{
        display: "inline-block",
        margin: "0 0 14px",
        padding: "4px 8px",
        border: `1px solid ${colors.border}`,
        borderRadius: "999px",
        backgroundColor: colors.backgroundColor,
        color: colors.color,
        fontSize: "12px",
        fontWeight: "700",
        lineHeight: "16px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}
