import spec from "../../../../docs/openapi.json";

const BODY = JSON.stringify(spec);
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=3600",
  "access-control-allow-origin": "*",
};

export function GET() {
  return new Response(BODY, { status: 200, headers: HEADERS });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: HEADERS });
}
