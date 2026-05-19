"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface LinkedTableCellProps {
  href: string;
  children: ReactNode;
  className?: string;
  linkClassName?: string;
  focusable?: boolean;
  ariaLabel?: string;
  skipPageTransition?: boolean;
}

export function LinkedTableCell({
  href,
  children,
  className,
  linkClassName,
  focusable = false,
  ariaLabel,
  skipPageTransition = true,
}: LinkedTableCellProps) {
  return (
    <TableCell className={cn("p-0", className)}>
      <Link
        href={href}
        prefetch={false}
        tabIndex={focusable ? undefined : -1}
        aria-label={ariaLabel}
        data-skip-page-transition={skipPageTransition ? "" : undefined}
        className={cn(
          "block min-h-9 min-w-0 max-w-full px-2 py-2 text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          linkClassName,
        )}
      >
        {children}
      </Link>
    </TableCell>
  );
}
