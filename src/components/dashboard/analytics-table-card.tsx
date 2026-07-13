import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AnalyticsTableCardProps {
  children: ReactNode;
  className?: string;
}

/** Shared shell for wide, horizontally scrollable analytics tables. */
export function AnalyticsTableCard({
  children,
  className,
}: AnalyticsTableCardProps) {
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}
