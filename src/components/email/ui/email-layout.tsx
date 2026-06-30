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

const styles = {
  body: {
    margin: "0",
    backgroundColor: "#f4f6f8",
    color: "#111827",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    width: "100%",
    maxWidth: "640px",
    margin: "0 auto",
    padding: "32px 16px",
  },
  brand: {
    margin: "0 0 16px",
    color: "#111827",
    fontSize: "15px",
    fontWeight: "700",
  },
  footer: {
    margin: "18px 0 0",
    color: "#6b7280",
    fontSize: "12px",
    lineHeight: "18px",
  },
} satisfies Record<string, React.CSSProperties>;

export interface EmailLayoutProps extends PropsWithChildren {
  locale: Locale;
  preview: string;
}

export function EmailLayout({ children, locale, preview }: EmailLayoutProps) {
  const messages = NOTIFICATION_EMAIL_MESSAGES[locale];
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{messages.common.brand}</Text>
          <Section>{children}</Section>
          <Text style={styles.footer}>{messages.common.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
