import type { PropsWithChildren } from "react";
import * as React from "react";
import { Section } from "react-email";

import { emailTheme } from "./email-theme";

export function EmailCard({ children }: PropsWithChildren) {
  const style = {
    backgroundColor: emailTheme.colors.card,
    border: `1px solid ${emailTheme.colors.border}`,
    borderRadius: emailTheme.radius,
    padding: "16px",
  } satisfies React.CSSProperties;
  return <Section style={style}>{children}</Section>;
}
