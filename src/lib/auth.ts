import { SESSION_COOKIE } from "./constants";
import { requestHeader } from "./request-headers";
import type { DashboardSession } from "./session";
import { verifySessionToken } from "./session";

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieValue(cookieHeader: string, key: string): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === key) {
      return decodeCookieValue(rawValue.join("="));
    }
  }
  return "";
}

async function readServerCookieHeader(): Promise<string> {
  try {
    return (await requestHeader("cookie")) || "";
  } catch {
    return "";
  }
}

export async function getSessionToken(): Promise<string> {
  if (import.meta.env.VITE_DEMO_MODE === "1") return "demo-token";
  if (typeof document !== "undefined") {
    return parseCookieValue(document.cookie || "", SESSION_COOKIE);
  }
  const cookieHeader = await readServerCookieHeader();
  return parseCookieValue(cookieHeader, SESSION_COOKIE);
}

export async function getSession(): Promise<DashboardSession | null> {
  if (import.meta.env.VITE_DEMO_MODE === "1") {
    return {
      userId: "demo-user-001",
      username: "demo",
      displayName: "Demo User",
      systemRole: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    };
  }
  const token = await getSessionToken();
  return verifySessionToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  if (import.meta.env.VITE_DEMO_MODE === "1") return true;
  const session = await getSession();
  return Boolean(session);
}
