"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiCloseLine,
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiRobot2Line,
  RiSave3Line,
} from "@remixicon/react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { PublicBotAnalyticsConfig } from "@/lib/bot-analytics-config";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

interface BotAnalyticsSettingsClientProps {
  messages: AppMessages;
}

interface ApiResponse<T> {
  ok?: boolean;
  data?: T;
  error?: string | { message?: string };
  message?: string;
}

type FormState = Pick<PublicBotAnalyticsConfig, "accountId" | "dataset">;

const API_PATH = "/api/private/admin/bot-analytics-config";
const ANALYTICS_ENGINE_ENABLE_URL =
  "https://dash.cloudflare.com/?to=/:account/workers/analytics-engine";

function demoAnalyticsEngineDisabled(): boolean {
  return process.env.NEXT_PUBLIC_INSIGHTFLARE_ANALYTICS_ENGINE_DISABLED === "1";
}

function defaultConfig(): PublicBotAnalyticsConfig {
  return {
    accountId: "",
    analyticsEngineDisabled: false,
    analyticsEngineEnableUrl: "",
    dataset: "insightflare_bot_events",
    apiTokenConfigured: false,
    apiTokenHint: "",
    updatedAt: 0,
  };
}

function toFormState(config: PublicBotAnalyticsConfig): FormState {
  return {
    accountId: config.accountId,
    dataset: config.dataset,
  };
}

function apiMessage(payload: ApiResponse<unknown>, fallback: string): string {
  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function fetchConfig(): Promise<PublicBotAnalyticsConfig> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    return {
      ...defaultConfig(),
      analyticsEngineDisabled: demoAnalyticsEngineDisabled(),
      analyticsEngineEnableUrl: ANALYTICS_ENGINE_ENABLE_URL,
    };
  }

  const response = await fetch(API_PATH, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload =
    (await response.json()) as ApiResponse<PublicBotAnalyticsConfig>;
  if (!response.ok || payload.ok !== true || !payload.data) {
    throw new Error(apiMessage(payload, "load_bot_analytics_config_failed"));
  }
  return payload.data;
}

async function saveConfig(
  body: Record<string, unknown>,
): Promise<PublicBotAnalyticsConfig> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    return {
      ...defaultConfig(),
      accountId: String(body.accountId || ""),
      dataset: String(body.dataset || "insightflare_bot_events"),
      apiTokenConfigured: Boolean(body.apiToken),
      apiTokenHint: body.apiToken ? "••••demo" : "",
      analyticsEngineDisabled: false,
      analyticsEngineEnableUrl: "",
      updatedAt: Date.now(),
    };
  }

  const response = await fetch(API_PATH, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload =
    (await response.json()) as ApiResponse<PublicBotAnalyticsConfig>;
  if (!response.ok || payload.ok !== true || !payload.data) {
    throw new Error(apiMessage(payload, "save_bot_analytics_config_failed"));
  }
  return payload.data;
}

async function deleteConfig(): Promise<PublicBotAnalyticsConfig> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    return defaultConfig();
  }

  const response = await fetch(API_PATH, {
    method: "DELETE",
    credentials: "include",
  });
  const payload =
    (await response.json()) as ApiResponse<PublicBotAnalyticsConfig>;
  if (!response.ok || payload.ok !== true || !payload.data) {
    throw new Error(apiMessage(payload, "delete_bot_analytics_config_failed"));
  }
  return payload.data;
}

export function BotAnalyticsSettingsClient({
  messages,
}: BotAnalyticsSettingsClientProps) {
  const copy = messages.systemSettings;
  const [config, setConfig] = useState<PublicBotAnalyticsConfig>(defaultConfig);
  const [form, setForm] = useState<FormState>(() => toFormState(config));
  const [apiToken, setApiToken] = useState("");
  const [clearApiToken, setClearApiToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const analyticsEngineDisabled = config.analyticsEngineDisabled;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConfig()
      .then((next) => {
        if (cancelled) return;
        setConfig(next);
        setForm(toFormState(next));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : copy.loadFailed);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed]);

  const hasChanges = useMemo(
    () =>
      !analyticsEngineDisabled &&
      (form.accountId !== config.accountId ||
        form.dataset !== config.dataset ||
        apiToken.trim().length > 0 ||
        clearApiToken),
    [analyticsEngineDisabled, apiToken, clearApiToken, config, form],
  );

  async function handleSave() {
    if (analyticsEngineDisabled) return;
    setSaving(true);
    try {
      const next = await saveConfig({
        accountId: form.accountId.trim(),
        dataset: form.dataset.trim(),
        apiToken: apiToken.trim() || undefined,
        clearApiToken,
      });
      setConfig(next);
      setForm(toFormState(next));
      setApiToken("");
      setClearApiToken(false);
      toast.success(copy.botAnalyticsSaved);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : copy.botAnalyticsSaveFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (analyticsEngineDisabled) return;
    setDeleting(true);
    try {
      const next = await deleteConfig();
      setConfig(next);
      setForm(toFormState(next));
      setApiToken("");
      setClearApiToken(false);
      toast.success(copy.botAnalyticsDeleted);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : copy.botAnalyticsDeleteFailed,
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card
      className={cn("overflow-hidden", analyticsEngineDisabled && "opacity-75")}
    >
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <RiRobot2Line className="size-4 shrink-0 text-primary" />
              <span className="truncate">{copy.botAnalyticsTitle}</span>
            </CardTitle>
            <CardDescription>{copy.botAnalyticsDescription}</CardDescription>
          </div>
          <Badge
            variant={
              analyticsEngineDisabled
                ? "secondary"
                : config.apiTokenConfigured
                  ? "default"
                  : "secondary"
            }
          >
            {analyticsEngineDisabled
              ? copy.botAnalyticsEngineDisabledBadge
              : config.apiTokenConfigured
                ? copy.botAnalyticsTokenSaved
                : copy.botAnalyticsTokenNotSaved}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <AutoTransition
          transitionKey={loading ? "loading" : "ready"}
          type="fade"
          duration={0.2}
        >
          {loading ? (
            <div className="flex h-28 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              {analyticsEngineDisabled ? (
                <div className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground lg:col-span-2">
                  <p className="font-medium text-foreground">
                    {copy.botAnalyticsEngineDisabledTitle}
                  </p>
                  <p className="mt-1">
                    {copy.botAnalyticsEngineDisabledDescription}
                  </p>
                  <Button asChild className="mt-3" variant="outline">
                    <a
                      href={config.analyticsEngineEnableUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <RiExternalLinkLine className="size-4" />
                      {copy.botAnalyticsOpenCloudflare}
                    </a>
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="bot-analytics-account-id">
                  {copy.botAnalyticsAccountIdLabel}
                </Label>
                <Input
                  id="bot-analytics-account-id"
                  value={form.accountId}
                  disabled={analyticsEngineDisabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accountId: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bot-analytics-dataset">
                  {copy.botAnalyticsDatasetLabel}
                </Label>
                <Input
                  id="bot-analytics-dataset"
                  value={form.dataset}
                  disabled={analyticsEngineDisabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dataset: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="bot-analytics-api-token">
                  {copy.botAnalyticsApiTokenLabel}
                </Label>
                <Input
                  id="bot-analytics-api-token"
                  type="password"
                  value={apiToken}
                  disabled={analyticsEngineDisabled}
                  placeholder={
                    !analyticsEngineDisabled && config.apiTokenConfigured
                      ? copy.botAnalyticsApiTokenPlaceholder
                      : ""
                  }
                  onChange={(event) => {
                    setApiToken(event.target.value);
                    if (event.target.value.trim()) setClearApiToken(false);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {analyticsEngineDisabled
                    ? copy.botAnalyticsEngineDisabledHint
                    : config.apiTokenConfigured && config.apiTokenHint
                      ? `${copy.botAnalyticsTokenSaved}: ${config.apiTokenHint}`
                      : copy.botAnalyticsTokenNotSaved}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    analyticsEngineDisabled || saving || deleting || !hasChanges
                  }
                >
                  {saving ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RiSave3Line className="size-4" />
                  )}
                  {saving ? copy.saving : copy.save}
                </Button>
                {config.apiTokenConfigured && !analyticsEngineDisabled ? (
                  <Button
                    type="button"
                    variant={clearApiToken ? "destructive" : "outline"}
                    onClick={() => {
                      setClearApiToken((value) => !value);
                      setApiToken("");
                    }}
                  >
                    {clearApiToken ? (
                      <RiCloseLine className="size-4" />
                    ) : (
                      <RiDeleteBinLine className="size-4" />
                    )}
                    {copy.clearApiKey}
                  </Button>
                ) : null}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={analyticsEngineDisabled || saving || deleting}
                    >
                      {deleting ? (
                        <Spinner className="size-4" />
                      ) : (
                        <RiDeleteBinLine className="size-4" />
                      )}
                      {deleting ? copy.deleting : copy.delete}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {copy.botAnalyticsTitle}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {copy.botAnalyticsDeleteConfirm}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>
                        {copy.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </AutoTransition>
      </CardContent>
    </Card>
  );
}
