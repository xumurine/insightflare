export function GET(request: Request) {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  return Response.redirect(`${baseUrl}/healthz`, 302);
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
