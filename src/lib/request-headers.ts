import { createIsomorphicFn } from "@tanstack/react-start";

export const requestHeader = createIsomorphicFn()
  .client((name: string) => {
    if (name.toLowerCase() === "cookie") return document.cookie;
    if (name.toLowerCase() === "host") return window.location.host;
    if (name.toLowerCase() === "x-forwarded-proto") {
      return window.location.protocol.replace(/:$/, "");
    }
    return null;
  })
  .server(async (name: string) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return getRequestHeader(name) ?? null;
  });
