const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
  "access-control-allow-origin": "*",
};

export async function GET(request: Request) {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/healthz`);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: HEADERS,
    });
  } catch {
    return new Response(
      JSON.stringify({ service: "insightflare", status: "unreachable" }),
      { status: 503, headers: HEADERS },
    );
  }
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
