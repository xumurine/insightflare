export function shouldUseHono(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/__e2e__" ||
    pathname.startsWith("/__e2e__/") ||
    pathname === "/collect" ||
    pathname === "/script.js" ||
    pathname === "/healthz" ||
    pathname === "/notification-email-preview" ||
    pathname.startsWith("/.well-known/")
  );
}
