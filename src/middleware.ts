import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/config";
import { isValidLocale } from "@/lib/i18n/config";
import { dashboardSessionSecret } from "@/lib/secrets";
import { hasConfiguredSessionSecret, verifySessionToken } from "@/lib/session";

type AuthState = "authenticated" | "unauthenticated" | "unknown";

const DEMO_DEFAULT_TEAM_SLUG = "xeoos-team";

interface RedirectProfile {
  teams: Array<{
    slug: string;
  }>;
}

function hasRootSecret(source: Record<string, unknown>): boolean {
  return Boolean(
    String(source.MAIN_SECRET || "").trim() ||
    String(source.DAILY_SALT_SECRET || "").trim(),
  );
}

async function hasRuntimeRootSecret(): Promise<boolean> {
  if (
    hasRootSecret({
      MAIN_SECRET: process.env.MAIN_SECRET,
      DAILY_SALT_SECRET: process.env.DAILY_SALT_SECRET,
    })
  ) {
    return true;
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return hasRootSecret(context.env as Record<string, unknown>);
  } catch {
    // No Cloudflare runtime context available.
  }

  return false;
}

function forwardedOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) return request.nextUrl.origin;
  return `${proto}://${host}`;
}

async function resolveSessionSecretForMiddleware(): Promise<string | null> {
  if (hasConfiguredSessionSecret()) {
    const fromProcess = await dashboardSessionSecret({
      MAIN_SECRET: process.env.MAIN_SECRET,
      DAILY_SALT_SECRET: process.env.DAILY_SALT_SECRET,
    });
    if (fromProcess) return fromProcess;
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    const env = context.env as Record<string, unknown>;
    return dashboardSessionSecret(env);
  } catch {
    // No Cloudflare runtime context available.
  }

  return null;
}

async function authState(request: NextRequest): Promise<AuthState> {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) return "unauthenticated";

  const secret = await resolveSessionSecretForMiddleware();
  if (!secret) return "unknown";

  const session = await verifySessionToken(token, secret);
  return session ? "authenticated" : "unauthenticated";
}

async function fetchRedirectProfile(
  request: NextRequest,
): Promise<RedirectProfile | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) return null;

  try {
    const url = request.nextUrl.clone();
    url.pathname = "/api/private/session";
    url.search = "";
    const fetchUrl = new URL(
      `${url.pathname}${url.search}`,
      forwardedOrigin(request),
    );

    const response = await fetch(fetchUrl.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      ok?: boolean;
      data?: {
        teams?: Array<{
          slug?: unknown;
        }>;
      };
    };
    if (!payload.ok) return null;

    const teams = Array.isArray(payload.data?.teams)
      ? payload.data.teams
          .map((team) => String(team?.slug || "").trim())
          .filter((slug) => slug.length > 0)
      : [];

    return {
      teams: teams.map((slug) => ({ slug })),
    };
  } catch {
    return null;
  }
}

function getLocale(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language");
  if (acceptLang) {
    const preferred = acceptLang
      .split(",")
      .map((part) => part.trim().split(";")[0].trim().toLowerCase())
      .map((tag) => {
        // Try exact match first (e.g. "zh"), then language-only prefix (e.g. "zh" from "zh-cn")
        if (isValidLocale(tag)) return tag;
        const lang = tag.slice(0, 2);
        return isValidLocale(lang) ? lang : null;
      })
      .find(
        (code): code is (typeof SUPPORTED_LOCALES)[number] => code !== null,
      );
    if (preferred) return preferred;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  return DEFAULT_LOCALE;
}

function pathnameHasLocale(pathname: string): boolean {
  return SUPPORTED_LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
}

function normalizePathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function toLocalizedPath(pathname: string, locale: string): string {
  const normalized = normalizePathname(pathname);

  if (normalized === "/") {
    return `/${locale}/app`;
  }
  return `/${locale}${normalized}`;
}

function localeFromPathname(pathname: string): string | null {
  const segment = pathname.split("/")[1];
  if (isValidLocale(segment)) {
    return segment;
  }
  return null;
}

function redirectWithPath(
  request: NextRequest,
  pathname: string,
  options?: { preserveSearch?: boolean },
): NextResponse {
  const url = new URL(request.url);
  url.pathname = normalizePathname(pathname);
  if (!options?.preserveSearch) {
    url.search = "";
  }
  const response = NextResponse.redirect(url);
  response.headers.set("x-pathname", url.pathname);

  const locale = localeFromPathname(url.pathname);
  if (locale) {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: locale,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

function redirectToRuntimeConfigError(
  request: NextRequest,
  locale: string,
): NextResponse {
  return redirectWithPath(
    request,
    `/${resolveLocale(locale)}/runtime-config-error`,
    {
      preserveSearch: false,
    },
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Demo mode: skip all auth checks
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    if (pathname === "/api/private/realtime/ws") return NextResponse.next();
    if (pathname.startsWith("/api/private")) {
      return NextResponse.next();
    }
    if (!pathnameHasLocale(pathname)) {
      const locale = getLocale(request);
      return redirectWithPath(request, toLocalizedPath(pathname, locale), {
        preserveSearch: true,
      });
    }
    const demoLocale = pathname.split("/")[1];
    const demoNormalized = normalizePathname(pathname);
    if (demoLocale && demoNormalized === `/${demoLocale}`) {
      return redirectWithPath(request, `/${demoLocale}/app`, {
        preserveSearch: true,
      });
    }
    const demoRest = pathname.replace(/^\/[^/]+/, "") || "/";
    const demoNormalizedRest = normalizePathname(demoRest);
    if (demoNormalizedRest === "/app") {
      return redirectWithPath(
        request,
        `/${demoLocale}/app/${DEMO_DEFAULT_TEAM_SLUG}`,
        { preserveSearch: false },
      );
    }
    if (demoNormalizedRest === "/login") {
      return redirectWithPath(request, `/${demoLocale}/app`, {
        preserveSearch: false,
      });
    }
    const demoResponse = NextResponse.next();
    demoResponse.headers.set("x-pathname", pathname);
    if (demoLocale && isValidLocale(demoLocale)) {
      demoResponse.cookies.set({
        name: LOCALE_COOKIE,
        value: resolveLocale(demoLocale),
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return demoResponse;
  }

  let state: AuthState | null = null;
  let redirectProfile: RedirectProfile | null | undefined;
  const ensureAuthState = async (): Promise<AuthState> => {
    if (!state) {
      state = await authState(request);
    }
    return state;
  };
  const ensureRedirectProfile = async (): Promise<RedirectProfile | null> => {
    if (redirectProfile === undefined) {
      redirectProfile = await fetchRedirectProfile(request);
    }
    return redirectProfile;
  };
  const normalizedPathname = normalizePathname(pathname);
  const localeFromPath = pathnameHasLocale(pathname)
    ? pathname.split("/")[1]
    : null;
  const localeForRequest = localeFromPath || getLocale(request);

  // API 鉴权必须在各自 route handler 内完成（matcher 排除了 /api 路径，此处不会命中）。
  // WebSocket 认证在 Worker 层 (cf-worker.js) 处理，此处直接放行。
  if (pathname === "/api/private/realtime/ws") {
    return NextResponse.next();
  }

  if (
    normalizedPathname !== `/${localeForRequest}/runtime-config-error` &&
    !(await hasRuntimeRootSecret())
  ) {
    return redirectToRuntimeConfigError(request, localeForRequest);
  }

  // Non-locale path: unify all redirects here.
  if (!pathnameHasLocale(pathname)) {
    const locale = getLocale(request);
    return redirectWithPath(request, toLocalizedPath(pathname, locale), {
      preserveSearch: true,
    });
  }

  if (localeFromPath && normalizedPathname === `/${localeFromPath}`) {
    return redirectWithPath(request, `/${localeFromPath}/app`, {
      preserveSearch: true,
    });
  }

  const restPath = pathname.replace(/^\/[^/]+/, "") || "/";
  const normalizedRestPath = normalizePathname(restPath);

  // Protected routes under /[locale]/app/*
  if (restPath.startsWith("/app")) {
    const currentAuthState = await ensureAuthState();
    if (currentAuthState === "unauthenticated") {
      const url = request.nextUrl.clone();
      url.pathname = `/${localeFromPath}/login`;
      url.searchParams.set("next", `${pathname}${search}`);
      const response = NextResponse.redirect(url);
      response.cookies.set({
        name: LOCALE_COOKIE,
        value: resolveLocale(localeFromPath),
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }

    const appSegments = normalizedRestPath
      .split("/")
      .filter((segment) => segment.length > 0);
    if (appSegments.length === 1) {
      const profile = await ensureRedirectProfile();
      if (profile && profile.teams.length === 1) {
        return redirectWithPath(
          request,
          `/${localeFromPath}/app/${profile.teams[0].slug}`,
          { preserveSearch: false },
        );
      }
    }

    if (appSegments.length === 2) {
      const legacyTab = request.nextUrl.searchParams.get("tab");
      if (legacyTab === "settings" || legacyTab === "members") {
        return redirectWithPath(
          request,
          `/${localeFromPath}/app/${appSegments[1]}/${legacyTab}`,
          { preserveSearch: false },
        );
      }
    }
  }

  if (
    normalizedRestPath === "/login" &&
    (await ensureAuthState()) === "authenticated"
  ) {
    return redirectWithPath(request, `/${localeFromPath}/app`, {
      preserveSearch: false,
    });
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);
  if (localeFromPath) {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: resolveLocale(localeFromPath),
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|collect|script\\.js|healthz|favicon\\.ico|.*\\..*).*)",
  ],
};
