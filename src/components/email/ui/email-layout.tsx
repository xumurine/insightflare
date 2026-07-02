import type { PropsWithChildren } from "react";
import * as React from "react";

import type { Locale } from "@/lib/i18n/config";
import { NOTIFICATION_EMAIL_MESSAGES } from "@/lib/notifications/email-i18n";

import { emailTableResetStyle, emailTheme } from "./email-theme";

function createStyles() {
  return {
    body: {
      margin: "0",
      padding: "0",
      backgroundColor: emailTheme.colors.background,
      color: emailTheme.colors.foreground,
      fontFamily: emailTheme.fontFamily,
      WebkitTextSizeAdjust: "100%",
    },
    outerTable: {
      width: "100%",
      backgroundColor: emailTheme.colors.background,
      ...emailTableResetStyle,
    },
    outerCell: {
      padding: "24px 12px 28px",
      backgroundColor: emailTheme.colors.background,
    },
    containerTable: {
      width: "100%",
      maxWidth: "640px",
      backgroundColor: emailTheme.colors.background,
      ...emailTableResetStyle,
    },
    headerCell: {
      padding: "0 0 14px",
      borderBottom: `1px solid ${emailTheme.colors.border}`,
    },
    contentCell: {
      padding: "16px 0 0",
    },
    footerCell: {
      padding: "16px 0 0",
    },
    brandText: {
      margin: "0",
      color: emailTheme.colors.primary,
      fontSize: "20px",
      fontWeight: "500",
      lineHeight: "28px",
    },
    brandVersion: {
      color: emailTheme.colors.mutedForeground,
    },
    footer: {
      margin: "0",
      color: emailTheme.colors.mutedForeground,
      fontSize: "12px",
      lineHeight: "18px",
    },
    preview: {
      display: "none",
      overflow: "hidden",
      maxHeight: "0",
      maxWidth: "0",
      opacity: 0,
      color: "transparent",
      lineHeight: "1px",
    },
  } satisfies Record<string, React.CSSProperties>;
}

export interface EmailLayoutProps extends PropsWithChildren {
  locale: Locale;
  preview: string;
}

export function EmailLayout({ children, locale, preview }: EmailLayoutProps) {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  const styles = createStyles();
  return (
    <html lang={locale}>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>{messages.common.brand}</title>
      </head>
      <body style={styles.body}>
        <div style={styles.preview}>{preview}</div>
        <table
          role="presentation"
          cellPadding="0"
          cellSpacing="0"
          width="100%"
          style={styles.outerTable}
        >
          <tbody>
            <tr>
              <td align="center" style={styles.outerCell}>
                <table
                  role="presentation"
                  cellPadding="0"
                  cellSpacing="0"
                  width="100%"
                  style={styles.containerTable}
                >
                  <tbody>
                    <tr>
                      <td style={styles.headerCell}>
                        <p style={styles.brandText}>
                          {messages.common.brand}{" "}
                          <span style={styles.brandVersion}>v1</span>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.contentCell}>{children}</td>
                    </tr>
                    <tr>
                      <td style={styles.footerCell}>
                        <p style={styles.footer}>{messages.common.footer}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
