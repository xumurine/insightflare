import * as React from "react";

import { emailTheme } from "./email-theme";

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        marginTop: "16px",
        padding: "8px 10px",
        borderRadius: emailTheme.radius,
        backgroundColor: emailTheme.colors.primary,
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: "500",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}
