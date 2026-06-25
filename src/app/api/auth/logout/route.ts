import { SESSION_COOKIE } from "@/lib/constants";
import { jsonResponseFor } from "@/lib/response";

export async function POST(request: Request): Promise<Response> {
  const response = jsonResponseFor(request, {
    ok: true,
    data: { next: "/login" },
  });
  response.headers.set(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
