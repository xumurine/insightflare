"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiCheckLine, RiComputerLine, RiGlobalLine } from "@remixicon/react";
import { toast } from "sonner";

import { useDashboardQueryControls } from "@/components/dashboard/dashboard-query-provider";
import { PageHeading } from "@/components/dashboard/page-heading";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  normalizeTimeZone,
  supportedTimeZones,
} from "@/lib/dashboard/time-zone";
import type { AppMessages } from "@/lib/i18n/messages";

interface AccountSettingsClientProps {
  messages: AppMessages;
}

type TimeZoneMode = "browser" | "custom";

interface ProfileResponse {
  ok?: boolean;
  data?: {
    timeZone?: string;
  };
  message?: string;
}

export function AccountSettingsClient({
  messages,
}: AccountSettingsClientProps) {
  const copy = messages.accountSettings;
  const router = useRouter();
  const {
    timeZone,
    timeZonePreference,
    browserTimeZone,
    setTimeZonePreference,
  } = useDashboardQueryControls();
  const timeZones = useMemo(() => supportedTimeZones(), []);
  const [mode, setMode] = useState<TimeZoneMode>(
    timeZonePreference ? "custom" : "browser",
  );
  const [customTimeZone, setCustomTimeZone] = useState(
    timeZonePreference || timeZone,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(timeZonePreference ? "custom" : "browser");
    if (timeZonePreference) {
      setCustomTimeZone(timeZonePreference);
    } else {
      setCustomTimeZone(timeZone);
    }
  }, [timeZone, timeZonePreference]);

  const normalizedCustomTimeZone = normalizeTimeZone(customTimeZone);
  const nextPreference = mode === "browser" ? "" : normalizedCustomTimeZone;
  const hasInvalidCustomTimeZone =
    mode === "custom" && customTimeZone.trim().length > 0 && !nextPreference;
  const canSave =
    !saving &&
    !hasInvalidCustomTimeZone &&
    (mode === "browser" || Boolean(nextPreference)) &&
    nextPreference !== timeZonePreference;
  const sourceLabel =
    timeZonePreference.length > 0 ? copy.manualSource : copy.browserSource;
  const browserLabel = browserTimeZone || copy.browserUnavailable;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (mode === "custom" && !nextPreference) {
      toast.error(copy.invalidTimeZone);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ timeZone: nextPreference }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ProfileResponse;
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || copy.saveFailed);
      }
      const savedTimeZone = normalizeTimeZone(payload.data?.timeZone) || "";
      setTimeZonePreference(savedTimeZone);
      setMode(savedTimeZone ? "custom" : "browser");
      if (savedTimeZone) {
        setCustomTimeZone(savedTimeZone);
      }
      toast.success(copy.saved);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading title={copy.title} subtitle={copy.subtitle} />

      <Card className="max-w-3xl overflow-visible">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="inline-flex items-center gap-2">
                <RiGlobalLine className="size-4 text-muted-foreground" />
                {copy.timeZoneTitle}
              </CardTitle>
              <CardDescription>{copy.timeZoneDescription}</CardDescription>
            </div>
            <Badge variant="outline">{sourceLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-none border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                  <RiGlobalLine className="size-4 text-muted-foreground" />
                  {copy.activeTimeZone}
                </div>
                <div className="font-mono text-sm">{timeZone}</div>
              </div>
              <div className="rounded-none border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                  <RiComputerLine className="size-4 text-muted-foreground" />
                  {copy.browserTimeZone}
                </div>
                <div className="font-mono text-sm">{browserLabel}</div>
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="account-timezone-mode">
                {copy.preferenceLabel}
              </FieldLabel>
              <Select
                value={mode}
                onValueChange={(value) => {
                  if (value === "browser" || value === "custom") {
                    setMode(value);
                  }
                }}
              >
                <SelectTrigger id="account-timezone-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">{copy.useBrowser}</SelectItem>
                  <SelectItem value="custom">{copy.useCustom}</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>{copy.preferenceDescription}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="account-timezone-input">
                {copy.customTimeZoneLabel}
              </FieldLabel>
              <FieldContent>
                <Input
                  id="account-timezone-input"
                  list="account-timezone-options"
                  value={customTimeZone}
                  disabled={mode === "browser"}
                  placeholder={copy.customTimeZonePlaceholder}
                  aria-invalid={hasInvalidCustomTimeZone}
                  onChange={(event) => {
                    setCustomTimeZone(event.target.value);
                    if (mode !== "custom") setMode("custom");
                  }}
                />
                <datalist id="account-timezone-options">
                  {timeZones.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                <FieldDescription>
                  {hasInvalidCustomTimeZone
                    ? copy.invalidTimeZone
                    : copy.customTimeZoneDescription}
                </FieldDescription>
              </FieldContent>
            </Field>

            <div className="flex justify-end">
              <Button type="submit" disabled={!canSave}>
                <AutoTransition className="inline-flex items-center gap-2">
                  {saving ? (
                    <span
                      key="saving"
                      className="inline-flex items-center gap-2"
                    >
                      <Spinner className="size-4" />
                      {copy.saving}
                    </span>
                  ) : (
                    <span key="save" className="inline-flex items-center gap-2">
                      <RiCheckLine className="size-4" />
                      {copy.save}
                    </span>
                  )}
                </AutoTransition>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
