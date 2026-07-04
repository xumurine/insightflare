import type { DemoCustomEventFact } from "@/lib/realtime/mock/events-facts";
import {
  demoEventRecordPayload,
  demoJsonTypeLabel,
} from "@/lib/realtime/mock/events-payload";
import type {
  DemoEventPayloadFilterRule,
  DemoQueryFilters,
} from "@/lib/realtime/mock/types";

function demoPayloadValue(
  value: unknown,
): DemoEventPayloadFilterRule["value"] | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  return undefined;
}

function demoPayloadFilterValueType(
  value: DemoEventPayloadFilterRule["value"],
): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function collectDemoPayloadValuesAtPath(
  value: unknown,
  targetPath: string,
): DemoEventPayloadFilterRule["value"][] {
  const values: DemoEventPayloadFilterRule["value"][] = [];
  const walk = (current: unknown, pathSegments: string[]) => {
    const path = `/${pathSegments.join("/")}`;
    const normalizedPath = path === "/" ? "" : path;
    if (normalizedPath === targetPath) {
      const payloadValue = demoPayloadValue(current);
      if (
        payloadValue === null ||
        typeof payloadValue === "string" ||
        typeof payloadValue === "number" ||
        typeof payloadValue === "boolean"
      ) {
        values.push(payloadValue);
      }
    }

    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, [...pathSegments, "*"]));
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        walk(child, [...pathSegments, key]);
      }
    }
  };

  walk(value, []);
  return values;
}

function demoPayloadValuesEqual(
  left: DemoEventPayloadFilterRule["value"],
  right: DemoEventPayloadFilterRule["value"],
): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left) === Number(right);
  }
  return left === right;
}

function matchesDemoPayloadFilter(
  event: DemoCustomEventFact,
  rule: DemoEventPayloadFilterRule,
): boolean {
  const expectedType = demoPayloadFilterValueType(rule.value);
  return collectDemoPayloadValuesAtPath(
    demoEventRecordPayload(event),
    rule.path,
  ).some((value) => {
    if (demoJsonTypeLabel(value) !== expectedType) return false;
    const matches = demoPayloadValuesEqual(value, rule.value);
    return rule.operator === "ne" ? !matches : matches;
  });
}

export function filterDemoCustomEventsByPayload(
  events: DemoCustomEventFact[],
  filters: DemoQueryFilters,
): DemoCustomEventFact[] {
  const rules = filters.eventPayloadFilters ?? [];
  if (rules.length === 0) return events;
  return events.filter((event) =>
    rules.every((rule) => matchesDemoPayloadFilter(event, rule)),
  );
}
