import type { PropsWithChildren } from "react";
import * as React from "react";

import { emailTableResetStyle, emailTheme } from "./email-theme";

export function EmailCard({ children }: PropsWithChildren) {
  const cardTableStyle = {
    width: "100%",
    backgroundColor: emailTheme.colors.card,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: emailTheme.radius,
    ...emailTableResetStyle,
  } satisfies React.CSSProperties;
  const cardCellStyle = {
    padding: "16px",
  } satisfies React.CSSProperties;
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      width="100%"
      style={cardTableStyle}
    >
      <tbody>
        <tr>
          <td style={cardCellStyle}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}
