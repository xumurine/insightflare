import { fetchEdgeForServer } from "@/lib/edge-proxy";
import { bad, errorResponse, jsonResponseFor } from "@/lib/response";

export async function GET(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const siteId = incomingUrl.searchParams.get("siteId") || "";
  const from = incomingUrl.searchParams.get("from") || "";
  const to = incomingUrl.searchParams.get("to") || "";

  if (siteId.length === 0) {
    return bad("Missing siteId", "missing_site_id", request);
  }

  const edgeRes = await fetchEdgeForServer({
    baseUrl: incomingUrl.origin,
    pathname: "/api/private/archive/manifest",
    params: {
      siteId,
      from,
      to,
    },
  });

  const text = await edgeRes.text();
  if (!edgeRes.ok) {
    return errorResponse(
      request,
      edgeRes.status,
      "fetch_archive_manifest_failed",
      text,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return errorResponse(
      request,
      502,
      "invalid_manifest_json",
      "Archive manifest payload is invalid JSON",
    );
  }

  const files =
    payload &&
    typeof payload === "object" &&
    "files" in payload &&
    Array.isArray((payload as { files: unknown }).files)
      ? (payload as { files: Array<Record<string, unknown>> }).files
      : [];

  const normalizedFiles = files.map((file) => ({
    ...file,
    fetchUrl:
      typeof file.archiveKey === "string"
        ? `/api/archive/file?key=${encodeURIComponent(file.archiveKey)}`
        : undefined,
  }));

  return jsonResponseFor(request, {
    ...(payload && typeof payload === "object" ? payload : {}),
    files: normalizedFiles,
  });
}
