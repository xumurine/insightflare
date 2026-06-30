import type { PropsWithChildren } from "react";
import * as React from "react";
import { Section } from "react-email";

const style = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "20px",
} satisfies React.CSSProperties;

export function EmailCard({ children }: PropsWithChildren) {
  return <Section style={style}>{children}</Section>;
}
