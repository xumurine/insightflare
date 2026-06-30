import type { PropsWithChildren } from "react";
import * as React from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import type { Locale } from "@/lib/i18n/config";
import { NOTIFICATION_EMAIL_MESSAGES } from "@/lib/notifications/email-i18n";

import { emailTheme } from "./email-theme";

function createStyles() {
  return {
    body: {
      margin: "0",
      backgroundColor: emailTheme.colors.background,
      color: emailTheme.colors.foreground,
      fontFamily: emailTheme.fontFamily,
    },
    container: {
      width: "100%",
      maxWidth: "680px",
      margin: "0 auto",
      padding: "24px 16px 28px",
    },
    header: {
      margin: "0 0 16px",
      padding: "0 0 14px",
      borderBottom: `1px solid ${emailTheme.colors.border}`,
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
      margin: "16px 0 0",
      color: emailTheme.colors.mutedForeground,
      fontSize: "12px",
      lineHeight: "18px",
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
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandText}>
              {messages.common.brand}{" "}
              <span style={styles.brandVersion}>v1</span>
            </Text>
          </Section>
          <Section>{children}</Section>
          <Text style={styles.footer}>{messages.common.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
