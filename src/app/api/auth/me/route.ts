import { NextResponse, type NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/auth/backend";
import { clientIpOf } from "@/lib/auth/client-ip";
import { applyAuthCookies, buildAccessCookie, clearedAuthCookies } from "@/lib/auth/cookies";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  let result;
  try {
    result = await proxyAuthenticated(access, refresh, "/auth/me", { clientIp: clientIpOf(request) });
  } catch {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
  }

  if (result.status === 200) {
    const res = NextResponse.json(result.body, { status: 200 });
    if (result.refreshedAccessToken) {
      applyAuthCookies(res, [buildAccessCookie(result.refreshedAccessToken)]);
    }
    return res;
  }

  if (result.status === 401) {
    const res = NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
    applyAuthCookies(res, clearedAuthCookies());
    return res;
  }

  if (result.status === 403) {
    const res = NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
    applyAuthCookies(res, clearedAuthCookies());
    return res;
  }

  // Any other status: return generic response without forwarding backend body
  return NextResponse.json({ ok: false, code: "unavailable" }, { status: result.status });
}
