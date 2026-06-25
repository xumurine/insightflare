function getBaseUrl(request: Request): string {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  return Response.redirect(`${baseUrl}/app`, 302);
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
