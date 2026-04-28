"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import Avatar from "boring-avatars";
import { Icon } from "@iconify/react";
import {
  RiComputerLine,
  RiGlobalLine,
  RiSmartphoneLine,
  RiTabletLine,
} from "@remixicon/react";
import {
  durationFormat,
  intlLocale,
  shortDateTime,
} from "@/lib/dashboard/format";
import { decodeUrlDisplayValue } from "@/lib/dashboard/url-display";
import {
  resolveCountryFlagCode,
  resolveCountryLabel,
} from "@/lib/i18n/code-labels";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const VISITOR_AVATAR_COLORS = [
  "#0f172a",
  "#1d4ed8",
  "#0f766e",
  "#f59e0b",
  "#e11d48",
];
const BROWSER_ICON_DIR = "/images/browser";
const OS_ICON_DIR = "/images/os";
const UNKNOWN_ICON_KEY = "unknown";
const BROWSER_APPLE_ICON_KEYS = new Set(["ios", "ios-webview"]);
const OS_APPLE_ICON_KEYS = new Set(["ios", "mac-os"]);
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:\/\//i;

export function VisitorAvatar({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex size-7 shrink-0 overflow-hidden rounded-sm", className)}>
      <Avatar
        name={seed || "anonymous"}
        variant="marble"
        colors={VISITOR_AVATAR_COLORS}
        square
      />
    </span>
  );
}

function handleImageFallback(
  event: SyntheticEvent<HTMLImageElement>,
  fallbackSrc: string,
): void {
  const target = event.currentTarget;
  if (target.dataset.fallbackApplied === "true") return;
  target.dataset.fallbackApplied = "true";
  target.src = fallbackSrc;
}

function LogoIcon({
  src,
  fallbackSrc,
  invertInDark = false,
  className,
}: {
  src: string;
  fallbackSrc: string;
  invertInDark?: boolean;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      className={cn("block size-4 shrink-0 object-contain", invertInDark && "dark:invert", className)}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        handleImageFallback(event, fallbackSrc);
      }}
    />
  );
}

function resolveBrowserIconKey(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return UNKNOWN_ICON_KEY;
  if (normalized.includes("android webview") || normalized.includes("android-webview")) return "android-webview";
  if (normalized.includes("chromium-webview")) return "chromium-webview";
  if (normalized.includes("edge ios")) return "edge-ios";
  if (normalized.includes("edge")) return "edge-chromium";
  if (normalized.includes("chrome ios") || normalized.includes("crios")) return "crios";
  if (normalized.includes("firefox ios") || normalized.includes("fxios")) return "fxios";
  if (normalized.includes("ios webview")) return "ios-webview";
  if (normalized === "ios") return "ios";
  if (normalized.includes("arc")) return "arc";
  if (normalized.includes("opera mini")) return "opera-mini";
  if (normalized.includes("opera gx")) return "opera-gx";
  if (normalized.includes("opera")) return "opera";
  if (normalized.includes("samsung")) return "samsung";
  if (normalized.includes("wechat")) return "wechat";
  if (normalized.includes("duckduckgo")) return "duckduckgo";
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("huawei")) return "huawei";
  if (normalized.includes("qqbrowser") || normalized.includes("qq browser") || normalized === "qq") return "qq";
  if (normalized.includes("ucbrowser") || normalized.includes("uc browser")) return "uc";
  if (normalized.includes("brave")) return "brave";
  if (normalized.includes("miui")) return "miui";
  if (normalized.includes("firefox")) return "firefox";
  if (normalized.includes("safari")) return "safari";
  if (normalized.includes("chrome") || normalized.includes("chromium")) return "chrome";
  if (normalized.includes("android")) return "android";
  return UNKNOWN_ICON_KEY;
}

function resolveOsIconKey(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return UNKNOWN_ICON_KEY;
  if (normalized.includes("windows 11")) return "windows-11";
  if (normalized.includes("windows 10")) return "windows-10";
  if (normalized.startsWith("windows")) return "windows-10";
  if (normalized.startsWith("mac") || normalized.startsWith("os x") || normalized.startsWith("darwin")) return "mac-os";
  if (normalized.startsWith("ios")) return "ios";
  if (normalized.startsWith("android")) return "android-os";
  if (normalized.startsWith("chrome os") || normalized.startsWith("chromium os")) return "chrome-os";
  if (normalized.includes("linux") || normalized.startsWith("ubuntu") || normalized.startsWith("debian") || normalized.startsWith("fedora")) return "linux";
  return UNKNOWN_ICON_KEY;
}

function browserLabel(browser: string, version?: string | null): string {
  const base = browser.trim();
  const suffix = String(version || "").trim();
  return suffix && !base.includes(suffix) ? `${base} ${suffix}` : base;
}

function osLabel(os: string, version?: string | null): string {
  const base = os.trim();
  const suffix = String(version || "").trim();
  if (!base) return suffix;
  if (!suffix || base.includes(suffix)) return base;
  return `${base} ${suffix}`;
}

export function BrowserMeta({
  browser,
  version,
  unknownLabel,
  className,
}: {
  browser: string;
  version?: string | null;
  unknownLabel: string;
  className?: string;
}) {
  const label = browserLabel(browser, version) || unknownLabel;
  const iconKey = resolveBrowserIconKey(label);
  return (
    <InlineMeta
      icon={(
        <LogoIcon
          src={`${BROWSER_ICON_DIR}/${iconKey}.svg`}
          fallbackSrc={`${BROWSER_ICON_DIR}/${UNKNOWN_ICON_KEY}.svg`}
          invertInDark={BROWSER_APPLE_ICON_KEYS.has(iconKey)}
        />
      )}
      label={label}
      className={className}
    />
  );
}

export function OsMeta({
  os,
  version,
  unknownLabel,
  className,
}: {
  os: string;
  version?: string | null;
  unknownLabel: string;
  className?: string;
}) {
  const label = osLabel(os, version) || unknownLabel;
  const iconKey = resolveOsIconKey(label);
  return (
    <InlineMeta
      icon={(
        <LogoIcon
          src={`${OS_ICON_DIR}/${iconKey}.svg`}
          fallbackSrc={`${OS_ICON_DIR}/${UNKNOWN_ICON_KEY}.svg`}
          invertInDark={OS_APPLE_ICON_KEYS.has(iconKey)}
        />
      )}
      label={label}
      className={className}
    />
  );
}

export function DeviceMeta({
  deviceType,
  unknownLabel,
  className,
}: {
  deviceType: string;
  unknownLabel: string;
  className?: string;
}) {
  const normalized = deviceType.trim();
  const lowered = normalized.toLocaleLowerCase();
  const DeviceIcon = lowered.includes("mobile") || lowered.includes("phone")
    ? RiSmartphoneLine
    : lowered.includes("tablet")
      ? RiTabletLine
      : RiComputerLine;
  return (
    <InlineMeta
      icon={<DeviceIcon className="size-4 text-muted-foreground" />}
      label={normalized || unknownLabel}
      className={className}
    />
  );
}

export function LocationMeta({
  locale,
  messages,
  country,
  city,
  region,
  className,
}: {
  locale: Locale;
  messages: AppMessages;
  country: string;
  city?: string | null;
  region?: string | null;
  className?: string;
}) {
  const resolved = resolveCountryLabel(country || "", locale, messages.common.unknown);
  const flagCode = resolveCountryFlagCode(resolved.code, locale);
  const locality = String(city || region || "").trim();
  const label = locality
    ? `${locality}${resolved.label !== messages.common.unknown ? `, ${resolved.label}` : ""}`
    : resolved.label;
  return (
    <InlineMeta
      icon={flagCode ? (
        <Icon
          icon={`flagpack:${flagCode.toLowerCase()}`}
          style={{ width: 16, height: 12 }}
          className="block shrink-0"
        />
      ) : (
        <RiGlobalLine className="size-4 text-muted-foreground" />
      )}
      label={label}
      className={className}
    />
  );
}

function sanitizeHostname(value: string): string {
  return value
    .trim()
    .replace(/^[a-z][a-z\d+\-.]*:\/\//i, "")
    .replace(/\/+.*$/, "");
}

function faviconUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.startsWith("/")) return null;
  try {
    if (ABSOLUTE_URL_PATTERN.test(raw)) return `${new URL(raw).origin}/favicon.ico`;
    if (raw.startsWith("//")) return `${new URL(`https:${raw}`).origin}/favicon.ico`;
    const hostname = sanitizeHostname(raw);
    return hostname ? `${new URL(`https://${hostname}`).origin}/favicon.ico` : null;
  } catch {
    return null;
  }
}

export function ReferrerMeta({
  referrerHost,
  referrerUrl,
  directLabel,
  className,
}: {
  referrerHost: string;
  referrerUrl?: string | null;
  directLabel: string;
  className?: string;
}) {
  const label = referrerHost.trim() || String(referrerUrl || "").trim() || directLabel;
  const src = label === directLabel ? null : faviconUrl(label);
  return (
    <InlineMeta
      icon={<ReferrerIcon src={src} label={label} directLabel={directLabel} />}
      label={label}
      className={className}
    />
  );
}

function ReferrerIcon({
  src,
  label,
  directLabel,
}: {
  src: string | null;
  label: string;
  directLabel: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    if (!src) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setLoaded(true);
    };
    image.onerror = () => {
      if (active) setFailed(true);
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  if (src && loaded && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={16}
        height={16}
        className="block size-4 shrink-0 object-contain"
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span className="inline-flex size-4 items-center justify-center rounded-[2px] bg-muted text-[10px] text-muted-foreground">
      {label === directLabel ? "/" : label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function InlineMeta({
  icon,
  label,
  className,
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}
      title={label}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function formatRelativeTime(locale: Locale, timestamp: number, now: number): string {
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absoluteSeconds = Math.abs(diffSeconds);
  if (absoluteSeconds < 60) return formatter.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  return formatter.format(Math.round(diffHours / 24), "day");
}

export function formatShortDateTime(locale: Locale, timestamp: number): string {
  return shortDateTime(locale, timestamp);
}

export function formatDuration(locale: Locale, durationMs: number): string {
  return durationFormat(locale, durationMs);
}

export function formatPath(pathname: string): string {
  return decodeUrlDisplayValue(pathname.trim() || "/");
}

export function formatScreen(
  screenWidth: number | null | undefined,
  screenHeight: number | null | undefined,
): string {
  if (!screenWidth || !screenHeight) return "/";
  return `${Math.trunc(screenWidth)}x${Math.trunc(screenHeight)}`;
}
