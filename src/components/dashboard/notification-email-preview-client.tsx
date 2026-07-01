"use client";

import { useEffect, useState } from "react";
import { RiMailSendLine, RiRefreshLine } from "@remixicon/react";
import { toast } from "sonner";

import { PageHeading } from "@/components/dashboard/page-heading";
import { AutoResizer } from "@/components/ui/auto-resizer";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fetchNotificationEmailPreview } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

type PreviewType =
  "test" | "report" | "milestone" | "threshold" | "change" | "health";
type PreviewFormat = "html" | "text" | "json";

const PREVIEW_TYPES: PreviewType[] = [
  "test",
  "report",
  "milestone",
  "threshold",
  "change",
  "health",
];
const PREVIEW_FORMATS: PreviewFormat[] = ["html", "text", "json"];

export function NotificationEmailPreviewClient({
  locale,
  messages,
}: {
  locale: Locale;
  messages: AppMessages;
}) {
  const copy = messages.teamManagement.notifications;
  const page = copy.emailPreviewPage;
  const [type, setType] = useState<PreviewType>("report");
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const [format, setFormat] = useState<PreviewFormat>("html");
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [payload, setPayload] = useState("");

  async function loadPreview() {
    setLoading(true);
    try {
      const result = await fetchNotificationEmailPreview({
        type,
        locale: previewLocale,
        format,
      });
      if (typeof result === "string") {
        setSubject("");
        setPayload(result);
      } else {
        setSubject(result.subject);
        setPayload(JSON.stringify(result, null, 2));
      }
    } catch {
      toast.error(page.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, [format, previewLocale, type]);

  return (
    <div className="space-y-4">
      <PageHeading
        title={page.title}
        subtitle={page.subtitle}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadPreview()}
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              {loading ? (
                <Spinner className="size-4" />
              ) : (
                <RiRefreshLine className="size-4" />
              )}
            </span>
            <AutoResizer
              initial
              animateWidth
              animateHeight={false}
              className="inline-flex shrink-0 items-center"
            >
              <AutoTransition
                className="inline-block"
                duration={0.2}
                type="fade"
                initial={false}
                presenceMode="wait"
                customVariants={{
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  exit: { opacity: 0 },
                }}
              >
                <span key={loading ? "loading" : "refresh"}>
                  {page.refresh}
                </span>
              </AutoTransition>
            </AutoResizer>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <Field>
            <FieldLabel>{page.typeLabel}</FieldLabel>
            <Select
              value={type}
              onValueChange={(value) => {
                if (
                  value === "test" ||
                  value === "report" ||
                  value === "milestone" ||
                  value === "threshold" ||
                  value === "change" ||
                  value === "health"
                ) {
                  setType(value);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {copy.ruleTypes[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{page.localeLabel}</FieldLabel>
            <Select
              value={previewLocale}
              onValueChange={(value) => {
                if (value === "en" || value === "zh") setPreviewLocale(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{page.formatLabel}</FieldLabel>
            <Select
              value={format}
              onValueChange={(value) => {
                if (value === "html" || value === "text" || value === "json") {
                  setFormat(value);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_FORMATS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item === "html"
                      ? page.html
                      : item === "text"
                        ? page.text
                        : page.json}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <RiMailSendLine className="size-4" />
            {subject ? `${page.subject}: ${subject}` : page.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <Spinner className="mr-2 size-4" />
              {page.loading}
            </div>
          ) : format === "html" ? (
            <iframe
              title={page.title}
              sandbox=""
              srcDoc={payload}
              className="h-[680px] w-full rounded-none border bg-white"
            />
          ) : (
            <pre className="max-h-[680px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-5">
              {payload}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
