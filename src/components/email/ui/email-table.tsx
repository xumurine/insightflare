import * as React from "react";
import { Text } from "react-email";

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
      }}
    >
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td
              style={{
                padding: "9px 0",
                borderBottom: "1px solid #f3f4f6",
                color: "#6b7280",
                fontSize: "13px",
                lineHeight: "18px",
              }}
            >
              {row.label}
            </td>
            <td
              style={{
                padding: "9px 0",
                borderBottom: "1px solid #f3f4f6",
                color: "#111827",
                fontSize: "13px",
                fontWeight: "600",
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
  return (
    <>
      <Text
        style={{
          margin: "18px 0 8px",
          color: "#111827",
          fontSize: "14px",
          fontWeight: "700",
          lineHeight: "20px",
        }}
      >
        {title}
      </Text>
      {rows.length > 0 ? <EmailTable rows={rows} /> : <Text>{empty}</Text>}
    </>
  );
}
