"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiCheckLine,
  RiComputerLine,
  RiGlobalLine,
  RiLockPasswordLine,
  RiUserSettingsLine,
} from "@remixicon/react";
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
import { intlLocale } from "@/lib/dashboard/format";
import {
  FALLBACK_TIME_ZONE,
  normalizeTimeZone,
  supportedTimeZones,
  timeZoneOffsetMinutes,
} from "@/lib/dashboard/time-zone";
import type { AccountUserData } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface AccountSettingsClientProps {
  locale: Locale;
  messages: AppMessages;
  user: AccountUserData;
}

type TimeZoneMode = "browser" | "custom";

interface ProfileResponse {
  ok?: boolean;
  data?: AccountUserData;
  error?: string;
  message?: string;
}

interface TimeZoneOption {
  value: string;
  label: string;
}

const timeZoneNameFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimeZoneNameFormatter(
  locale: Locale,
  timeZone: string,
): Intl.DateTimeFormat | null {
  const cacheKey = `${locale}::${timeZone}`;
  const cached = timeZoneNameFormatterCache.get(cacheKey);
  if (cached) return cached;

  try {
    const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone,
      timeZoneName: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    timeZoneNameFormatterCache.set(cacheKey, formatter);
    return formatter;
  } catch {
    return null;
  }
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function formatTimeZoneOptionLabel(
  locale: Locale,
  timeZone: string,
  timestampMs: number,
): string {
  const date = new Date(timestampMs);
  const name =
    getTimeZoneNameFormatter(locale, timeZone)
      ?.formatToParts(date)
      .find((part) => part.type === "timeZoneName")
      ?.value.trim() || "";
  const offset = formatUtcOffset(timeZoneOffsetMinutes(timeZone, timestampMs));
  return name && name !== timeZone
    ? `${name} (${offset}) - ${timeZone}`
    : `${timeZone} (${offset})`;
}

function buildTimeZoneOptions(params: {
  locale: Locale;
  supported: string[];
  selected: string;
  active: string;
  browser: string;
  timestampMs: number;
}): TimeZoneOption[] {
  const values = new Set<string>();
  for (const value of [
    params.selected,
    params.active,
    params.browser,
    ...params.supported,
  ]) {
    const normalized = normalizeTimeZone(value);
    if (normalized) values.add(normalized);
  }

  return Array.from(values).map((value) => ({
    value,
    label: formatTimeZoneOptionLabel(params.locale, value, params.timestampMs),
  }));
}

export function AccountSettingsClient({
  locale,
  messages,
  user,
}: AccountSettingsClientProps) {
  const copy = messages.accountSettings;
  const router = useRouter();
  const {
    timeZone,
    timeZonePreference,
    browserTimeZone,
    setTimeZonePreference,
  } = useDashboardQueryControls();
  const [profileUser, setProfileUser] = useState(user);
  const [profileName, setProfileName] = useState(user.name || "");
  const [profileUsername, setProfileUsername] = useState(user.username || "");
  const [profileEmail, setProfileEmail] = useState(user.email || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const timeZones = useMemo(() => supportedTimeZones(), []);
  const [mode, setMode] = useState<TimeZoneMode>(
    timeZonePreference ? "custom" : "browser",
  );
  const [customTimeZone, setCustomTimeZone] = useState(
    timeZonePreference || timeZone,
  );
  const [saving, setSaving] = useState(false);
  const timeZoneOptionTimestamp = useMemo(() => Date.now(), []);
  const normalizedProfileName = profileName.trim();
  const normalizedProfileUsername = profileUsername.trim();
  const normalizedProfileEmail = profileEmail.trim();
  const profileChanged =
    normalizedProfileName !== (profileUser.name || "") ||
    normalizedProfileUsername !== profileUser.username ||
    normalizedProfileEmail !== profileUser.email;
  const canSaveProfile =
    !profileSaving &&
    profileChanged &&
    normalizedProfileUsername.length >= 3 &&
    normalizedProfileEmail.length >= 3 &&
    normalizedProfileEmail.includes("@");
  const canSavePassword =
    !passwordSaving &&
    currentPassword.length > 0 &&
    nextPassword.length >= 8 &&
    confirmPassword.length > 0;
  const selectedCustomTimeZone =
    normalizeTimeZone(customTimeZone) ||
    normalizeTimeZone(timeZone) ||
    normalizeTimeZone(browserTimeZone) ||
    FALLBACK_TIME_ZONE;
  const timeZoneOptions = useMemo(
    () =>
      buildTimeZoneOptions({
        locale,
        supported: timeZones,
        selected: selectedCustomTimeZone,
        active: timeZone,
        browser: browserTimeZone,
        timestampMs: timeZoneOptionTimestamp,
      }),
    [
      browserTimeZone,
      locale,
      selectedCustomTimeZone,
      timeZone,
      timeZoneOptionTimestamp,
      timeZones,
    ],
  );

  useEffect(() => {
    setProfileUser(user);
    setProfileName(user.name || "");
    setProfileUsername(user.username || "");
    setProfileEmail(user.email || "");
  }, [user]);

  useEffect(() => {
    setMode(timeZonePreference ? "custom" : "browser");
    if (timeZonePreference) {
      setCustomTimeZone(timeZonePreference);
    } else {
      setCustomTimeZone(timeZone);
    }
  }, [timeZone, timeZonePreference]);

  const nextPreference = mode === "browser" ? "" : selectedCustomTimeZone;
  const canSave =
    !saving &&
    (mode === "browser" || Boolean(nextPreference)) &&
    nextPreference !== timeZonePreference;
  const sourceLabel =
    timeZonePreference.length > 0 ? copy.manualSource : copy.browserSource;
  const activeTimeZoneLabel = formatTimeZoneOptionLabel(
    locale,
    timeZone,
    timeZoneOptionTimestamp,
  );
  const browserTimeZoneLabel = browserTimeZone
    ? formatTimeZoneOptionLabel(
        locale,
        browserTimeZone,
        timeZoneOptionTimestamp,
      )
    : copy.browserUnavailable;

  function applySavedUser(savedUser: AccountUserData) {
    setProfileUser(savedUser);
    setProfileName(savedUser.name || "");
    setProfileUsername(savedUser.username || "");
    setProfileEmail(savedUser.email || "");
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileSaving) return;
    if (
      normalizedProfileUsername.length < 3 ||
      !/^[a-z0-9._@-]+$/i.test(normalizedProfileUsername) ||
      normalizedProfileEmail.length < 3 ||
      !normalizedProfileEmail.includes("@")
    ) {
      toast.error(copy.invalidProfile);
      return;
    }

    setProfileSaving(true);
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: normalizedProfileUsername,
          email: normalizedProfileEmail,
          name: normalizedProfileName,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ProfileResponse;
      if (!response.ok || payload.ok === false || !payload.data) {
        throw new Error(
          payload.message || payload.error || copy.profileSaveFailed,
        );
      }
      applySavedUser(payload.data);
      toast.success(copy.profileSaved);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : copy.profileSaveFailed,
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSaving) return;
    if (!currentPassword) {
      toast.error(copy.currentPasswordRequired);
      return;
    }
    if (nextPassword.length < 8) {
      toast.error(copy.passwordTooShort);
      return;
    }
    if (nextPassword !== confirmPassword) {
      toast.error(copy.passwordMismatch);
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          password: nextPassword,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ProfileResponse;
      if (!response.ok || payload.ok === false || !payload.data) {
        throw new Error(
          payload.message || payload.error || copy.passwordSaveFailed,
        );
      }
      applySavedUser(payload.data);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      toast.success(copy.passwordSaved);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : copy.passwordSaveFailed,
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleTimeZoneSubmit(event: React.FormEvent<HTMLFormElement>) {
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
        throw new Error(payload.message || payload.error || copy.saveFailed);
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <RiUserSettingsLine className="size-4 text-muted-foreground" />
              {copy.profileTitle}
            </CardTitle>
            <CardDescription>{copy.profileDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col">
            <form
              className="flex h-full flex-col gap-5"
              onSubmit={handleProfileSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="account-profile-name">
                    {copy.nicknameLabel}
                  </FieldLabel>
                  <Input
                    id="account-profile-name"
                    value={profileName}
                    maxLength={120}
                    autoComplete="name"
                    placeholder={copy.nicknamePlaceholder}
                    onChange={(event) => setProfileName(event.target.value)}
                    disabled={profileSaving}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="account-profile-username">
                    {copy.usernameLabel}
                  </FieldLabel>
                  <Input
                    id="account-profile-username"
                    value={profileUsername}
                    minLength={3}
                    maxLength={80}
                    autoComplete="username"
                    placeholder={copy.usernamePlaceholder}
                    onChange={(event) => setProfileUsername(event.target.value)}
                    disabled={profileSaving}
                    required
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="account-profile-email">
                    {copy.emailLabel}
                  </FieldLabel>
                  <Input
                    id="account-profile-email"
                    type="email"
                    value={profileEmail}
                    maxLength={200}
                    autoComplete="email"
                    placeholder={copy.emailPlaceholder}
                    onChange={(event) => setProfileEmail(event.target.value)}
                    disabled={profileSaving}
                    required
                  />
                </Field>
              </div>
              <FieldDescription>{copy.usernameDescription}</FieldDescription>

              <div className="mt-auto flex justify-start">
                <Button type="submit" disabled={!canSaveProfile}>
                  <AutoTransition className="inline-flex items-center gap-2">
                    {profileSaving ? (
                      <span
                        key="profile-saving"
                        className="inline-flex items-center gap-2"
                      >
                        <Spinner className="size-4" />
                        {copy.profileSaving}
                      </span>
                    ) : (
                      <span
                        key="profile-save"
                        className="inline-flex items-center gap-2"
                      >
                        <RiCheckLine className="size-4" />
                        {copy.profileSave}
                      </span>
                    )}
                  </AutoTransition>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <RiLockPasswordLine className="size-4 text-muted-foreground" />
              {copy.passwordTitle}
            </CardTitle>
            <CardDescription>{copy.passwordDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col">
            <form
              className="flex h-full flex-col gap-5"
              onSubmit={handlePasswordSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="account-current-password">
                    {copy.currentPasswordLabel}
                  </FieldLabel>
                  <Input
                    id="account-current-password"
                    type="password"
                    value={currentPassword}
                    autoComplete="current-password"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    disabled={passwordSaving}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="account-new-password">
                    {copy.newPasswordLabel}
                  </FieldLabel>
                  <Input
                    id="account-new-password"
                    type="password"
                    value={nextPassword}
                    minLength={8}
                    autoComplete="new-password"
                    onChange={(event) => setNextPassword(event.target.value)}
                    disabled={passwordSaving}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="account-confirm-password">
                    {copy.confirmPasswordLabel}
                  </FieldLabel>
                  <Input
                    id="account-confirm-password"
                    type="password"
                    value={confirmPassword}
                    minLength={8}
                    autoComplete="new-password"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={passwordSaving}
                    required
                  />
                </Field>
              </div>

              <div className="mt-auto flex justify-start">
                <Button type="submit" disabled={!canSavePassword}>
                  <AutoTransition className="inline-flex items-center gap-2">
                    {passwordSaving ? (
                      <span
                        key="password-saving"
                        className="inline-flex items-center gap-2"
                      >
                        <Spinner className="size-4" />
                        {copy.passwordSaving}
                      </span>
                    ) : (
                      <span
                        key="password-save"
                        className="inline-flex items-center gap-2"
                      >
                        <RiCheckLine className="size-4" />
                        {copy.passwordSave}
                      </span>
                    )}
                  </AutoTransition>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-full overflow-visible lg:col-span-2">
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
          <CardContent className="flex h-full flex-col">
            <form
              className="flex h-full flex-col gap-5"
              onSubmit={handleTimeZoneSubmit}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-none border border-border p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                    <RiGlobalLine className="size-4 text-muted-foreground" />
                    {copy.activeTimeZone}
                  </div>
                  <div className="text-sm">{activeTimeZoneLabel}</div>
                </div>
                <div className="rounded-none border border-border p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                    <RiComputerLine className="size-4 text-muted-foreground" />
                    {copy.browserTimeZone}
                  </div>
                  <div className="text-sm">{browserTimeZoneLabel}</div>
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
                <FieldDescription>
                  {copy.preferenceDescription}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="account-timezone-select">
                  {copy.customTimeZoneLabel}
                </FieldLabel>
                <FieldContent>
                  <Select
                    value={selectedCustomTimeZone}
                    disabled={mode === "browser"}
                    onValueChange={(value) => {
                      setCustomTimeZone(value);
                      if (mode !== "custom") setMode("custom");
                    }}
                  >
                    <SelectTrigger
                      id="account-timezone-select"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {timeZoneOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {copy.customTimeZoneDescription}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <div className="mt-auto flex justify-start">
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
                      <span
                        key="save"
                        className="inline-flex items-center gap-2"
                      >
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
    </div>
  );
}
