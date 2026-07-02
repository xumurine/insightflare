import * as React from "react";

import {
  createEmailTextStyles,
  emailBreakTextStyle,
  emailNoWrapStyle,
  emailTableResetStyle,
  emailTheme,
} from "./email-theme";

export interface EmailTableRow {
  label: string;
  value: string;
}

export interface EmailTableProps {
  rows: EmailTableRow[];
  valueWidth?: string;
  valueNoWrap?: boolean;
}

export function EmailTable({
  rows,
  valueWidth,
  valueNoWrap = false,
}: EmailTableProps) {
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      width="100%"
      style={{
        width: "100%",
        margin: "12px 0 0",
        borderTop: `1px solid ${emailTheme.colors.border}`,
        tableLayout: "fixed",
        ...emailTableResetStyle,
      }}
    >
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td
              style={{
                padding: "9px 8px",
                borderBottom: `1px solid ${emailTheme.colors.border}`,
                color: emailTheme.colors.mutedForeground,
                fontSize: "12px",
                lineHeight: "18px",
                verticalAlign: "top",
                ...emailBreakTextStyle,
              }}
            >
              {row.label}
            </td>
            <td
              style={{
                width: valueWidth,
                padding: "9px 8px",
                borderBottom: `1px solid ${emailTheme.colors.border}`,
                color: emailTheme.colors.foreground,
                fontSize: "12px",
                fontWeight: "500",
                lineHeight: "18px",
                textAlign: "right",
                verticalAlign: "top",
                ...(valueNoWrap ? emailNoWrapStyle : emailBreakTextStyle),
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
      <p style={textStyles.sectionTitle}>{title}</p>
      {rows.length > 0 ? (
        <EmailTable rows={rows} valueWidth="116px" valueNoWrap />
      ) : (
        <table
          role="presentation"
          cellPadding="0"
          cellSpacing="0"
          width="100%"
          style={{
            width: "100%",
            margin: "8px 0 0",
            ...emailTableResetStyle,
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: "12px",
                  border: `1px solid ${emailTheme.colors.border}`,
                  borderRadius: emailTheme.radius,
                  backgroundColor: emailTheme.colors.card,
                  color: emailTheme.colors.mutedForeground,
                  fontSize: "12px",
                  lineHeight: "20px",
                  ...emailBreakTextStyle,
                }}
              >
                {empty}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}
