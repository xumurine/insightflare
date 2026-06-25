import { fetchEdgeForServer } from "@/lib/edge-proxy";
import { bad, errorResponse } from "@/lib/response";

async function proxyArchiveFile(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const key = incomingUrl.searchParams.get("key") || "";
  if (key.length === 0) {
    return bad("Missing key", "missing_key", request);
  }

  const rangeHeader = request.headers.get("range") || undefined;

  const edgeRes = await fetchEdgeForServer({
    baseUrl: incomingUrl.origin,
    pathname: "/api/private/archive/file",
    method: request.method === "HEAD" ? "HEAD" : "GET",
    params: { key },
    headers: {
      range: rangeHeader,
    },
  });
  if (!edgeRes.ok && edgeRes.status !== 206) {
    const text = await edgeRes.text();
    return errorResponse(
      request,
      edgeRes.status,
      "fetch_archive_file_failed",
      text,
    );
  }

  const headers = new Headers();
  const passthrough = [
    "content-type",
    "cache-control",
    "accept-ranges",
    "content-range",
    "content-length",
    "etag",
    "last-modified",
  ];
  for (const name of passthrough) {
    const value = edgeRes.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/vnd.apache.parquet");
  }

  return new Response(request.method === "HEAD" ? null : edgeRes.body, {
    status: edgeRes.status,
    headers,
  });
}

export async function GET(request: Request): Promise<Response> {
  return proxyArchiveFile(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return proxyArchiveFile(request);
}
