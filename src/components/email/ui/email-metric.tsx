import * as React from "react";
import { Section, Text } from "react-email";

import { emailTheme } from "./email-theme";

export function EmailMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const cardStyle = {
    backgroundColor: emailTheme.colors.card,
    padding: "14px 12px",
  } satisfies React.CSSProperties;
  return (
    <Section style={cardStyle}>
      <Text
        style={{
          margin: "0 0 6px",
          color: emailTheme.colors.mutedForeground,
          fontSize: "11px",
          fontWeight: "500",
          lineHeight: "16px",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: "0",
          color: emailTheme.colors.foreground,
          fontSize: "20px",
          fontWeight: "600",
          lineHeight: "26px",
        }}
      >
        {value}
      </Text>
    </Section>
  );
}

export function EmailMetricGrid({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{
        width: "100%",
        margin: "16px 0",
        border: `1px solid ${emailTheme.colors.border}`,
        borderCollapse: "collapse",
      }}
    >
      <tbody>
        <tr>
          {items.map((child, index) => (
            <td
              key={index}
              style={{
                width: `${100 / Math.max(1, items.length)}%`,
                borderLeft:
                  index === 0 ? "0" : `1px solid ${emailTheme.colors.border}`,
                verticalAlign: "top",
              }}
            >
              {child}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
