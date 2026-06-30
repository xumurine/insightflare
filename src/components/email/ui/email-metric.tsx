import type { PropsWithChildren } from "react";
import * as React from "react";
import { Column, Row, Section, Text } from "react-email";

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "12px",
} satisfies React.CSSProperties;

export function EmailMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Section style={cardStyle}>
      <Text
        style={{
          margin: "0 0 6px",
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: "16px",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: "0",
          color: "#111827",
          fontSize: "20px",
          fontWeight: "700",
          lineHeight: "26px",
        }}
      >
        {value}
      </Text>
    </Section>
  );
}

export function EmailMetricGrid({ children }: PropsWithChildren) {
  return (
    <Row style={{ margin: "16px 0" }}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <Column
              key={index}
              style={{ width: "33.333%", paddingRight: "8px" }}
            >
              {child}
            </Column>
          ))
        : children}
    </Row>
  );
}
