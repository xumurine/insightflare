import type { ScheduledTaskDefinitionInfo } from "@/lib/scheduled-tasks";

export const SCHEDULED_TASKS: ScheduledTaskDefinitionInfo[] = [
  {
    key: "visit_hourly_rollup",
    name: "Hourly visit aggregation",
    description:
      "Aggregates closed visit rows into hourly rollups for dashboard counters and trends.",
    schedule: "Every hour",
    trigger: "cron",
    enabled: true,
  },
  {
    key: "email_digest",
    name: "Scheduled email delivery",
    description:
      "Reserved for scheduled team reports and alert digests. Not enabled yet.",
    schedule: "Not configured",
    trigger: "cron",
    enabled: false,
  },
];

export function getScheduledTaskDefinition(
  key: string,
): ScheduledTaskDefinitionInfo | null {
  return SCHEDULED_TASKS.find((task) => task.key === key) ?? null;
}
