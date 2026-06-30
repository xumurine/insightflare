import * as React from "react";
import { Button } from "react-email";

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Button
      href={href}
      style={{
        display: "inline-block",
        marginTop: "16px",
        padding: "10px 14px",
        borderRadius: "6px",
        backgroundColor: "#111827",
        color: "#ffffff",
        fontSize: "14px",
        fontWeight: "700",
        textDecoration: "none",
      }}
    >
      {children}
    </Button>
  );
}
