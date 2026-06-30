import * as React from "react";
import { Text } from "react-email";

import { createEmailTextStyles, emailTheme } from "./email-theme";

export interface EmailTableRow {
  label: string;
  value: string;
}

export function EmailTable({ rows }: { rows: EmailTableRow[] }) {
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        margin: "12px 0 0",
        borderTop: `1px solid ${emailTheme.colors.border}`,
      }}
    >
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td
              style={{
                width: "42%",
                padding: "9px 8px",
                borderBottom: `1px solid ${emailTheme.colors.border}`,
                color: emailTheme.colors.mutedForeground,
                fontSize: "12px",
                lineHeight: "18px",
              }}
            >
              {row.label}
            </td>
            <td
              style={{
                padding: "9px 8px",
                borderBottom: `1px solid ${emailTheme.colors.border}`,
                color: emailTheme.colors.foreground,
                fontSize: "12px",
                fontWeight: "500",
                lineHeight: "18px",
                textAlign: "right",
              }}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EmailListTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: EmailTableRow[];
  empty: string;
}) {
  const textStyles = createEmailTextStyles();
  return (
    <>
      <Text style={textStyles.sectionTitle}>{title}</Text>
      {rows.length > 0 ? (
        <EmailTable rows={rows} />
      ) : (
        <Text
          style={{
            margin: "8px 0 0",
            padding: "12px",
            border: `1px solid ${emailTheme.colors.border}`,
            borderRadius: emailTheme.radius,
            backgroundColor: emailTheme.colors.card,
            color: emailTheme.colors.mutedForeground,
            fontSize: "12px",
            lineHeight: "20px",
          }}
        >
          {empty}
        </Text>
      )}
    </>
  );
}
