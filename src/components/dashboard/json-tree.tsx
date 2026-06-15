"use client";

import { type ReactNode, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { toast } from "sonner";

import { AutoResizer } from "@/components/ui/auto-resizer";
import { AutoTransition } from "@/components/ui/auto-transition";
import { cn } from "@/lib/utils";

export interface JsonTreeLabels {
  expandField: string;
  collapseField: string;
  copyValue: string;
  copiedValue: string;
  copyValueFailed: string;
}

interface JsonTreeProps {
  value: unknown;
  labels: JsonTreeLabels;
  depth?: number;
  label?: ReactNode;
}

const FIELD_TREE_CHILD_TRANSITION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};
const JSON_TREE_INDENT_REM = 1.25;
const JSON_TREE_GUIDE_OFFSET_REM = 0.58;
const JSON_TREE_ROW_CLASS =
  "flex min-w-max items-center gap-1.5 py-0.5 whitespace-nowrap";

function formatScalarValueForDisplay(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function formatScalarValueForClipboard(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function ScalarValue({
  value,
  labels,
}: {
  value: unknown;
  labels: JsonTreeLabels;
}) {
  const displayValue = formatScalarValueForDisplay(value);
  const clipboardValue = formatScalarValueForClipboard(value);
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(clipboardValue);
      toast.success(labels.copiedValue);
    } catch {
      toast.error(labels.copyValueFailed);
    }
  };

  if (value === null) {
    return (
      <button
        type="button"
        className="inline-flex cursor-copy rounded-none px-0.5 text-muted-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        onClick={() => {
          void copyValue();
        }}
        title={labels.copyValue}
        aria-label={labels.copyValue}
      >
        {displayValue}
      </button>
    );
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return (
      <button
        type="button"
        className="inline-flex cursor-copy rounded-none px-0.5 font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        onClick={() => {
          void copyValue();
        }}
        title={labels.copyValue}
        aria-label={labels.copyValue}
      >
        {displayValue}
      </button>
    );
  }
  return null;
}

function jsonTreeIndentStyle(depth: number) {
  return { paddingLeft: `${depth * JSON_TREE_INDENT_REM}rem` };
}

function jsonTreeGuideStyle(depth: number) {
  return {
    left: `${depth * JSON_TREE_INDENT_REM - JSON_TREE_GUIDE_OFFSET_REM}rem`,
  };
}

export function JsonTree({ value, depth = 0, labels, label }: JsonTreeProps) {
  const [expanded, setExpanded] = useState(true);

  if (value === null || typeof value !== "object") {
    return (
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <ScalarValue value={value} labels={labels} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  const itemCount = entries.length;
  const openToken = isArray ? "[" : "{";
  const closeToken = isArray ? "]" : "}";

  if (itemCount === 0) {
    return (
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <span className="text-muted-foreground">{`${openToken}${closeToken}`}</span>
      </div>
    );
  }

  const toggle = () => setExpanded((current) => !current);

  return (
    <div className="min-w-max space-y-1">
      <div className={JSON_TREE_ROW_CLASS} style={jsonTreeIndentStyle(depth)}>
        {label ? (
          <span className="shrink-0 text-muted-foreground">{label}</span>
        ) : null}
        <span className="text-muted-foreground">{openToken}</span>
        <span className="font-medium text-primary">{itemCount}</span>
        <span className="text-muted-foreground">{closeToken}</span>
        <button
          type="button"
          className="group inline-flex size-4 shrink-0 items-center justify-center rounded-none text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          onClick={toggle}
          aria-label={expanded ? labels.collapseField : labels.expandField}
          title={expanded ? labels.collapseField : labels.expandField}
        >
          <RiArrowDownSLine
            className={cn(
              "size-3.5 text-primary transition-transform duration-200 ease-out",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </div>
      <AutoResizer duration={0.2} ease={[0.22, 1, 0.36, 1]}>
        <AutoTransition
          initial={false}
          transitionKey={expanded ? "expanded" : "collapsed"}
          customVariants={FIELD_TREE_CHILD_TRANSITION}
          presenceMode="sync"
        >
          {expanded ? (
            <div className="relative space-y-1">
              <span
                className="absolute top-0 bottom-0 border-l border-border/70"
                style={jsonTreeGuideStyle(depth + 1)}
                aria-hidden
              />
              {entries.map(([key, child]) => (
                <JsonTree
                  key={key}
                  value={child}
                  depth={depth + 1}
                  labels={labels}
                  label={
                    isArray ? (
                      <span>[{key}]</span>
                    ) : (
                      <span>{JSON.stringify(key)}:</span>
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </AutoTransition>
      </AutoResizer>
    </div>
  );
}
