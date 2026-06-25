const BODY = `Contact: mailto:contact@insightflare.net
Expires: 2027-06-25T00:00:00.000Z
Preferred-Languages: en, zh
Acknowledgments: https://github.com/RavelloH/InsightFlare
Policy: https://github.com/RavelloH/InsightFlare/blob/main/SECURITY.md
`;

const HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=3600",
  "access-control-allow-origin": "*",
};

export function GET() {
  return new Response(BODY, { status: 200, headers: HEADERS });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: HEADERS });
}
