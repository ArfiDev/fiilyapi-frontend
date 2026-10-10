import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { backendUrl } from "@/lib/auth/backend";
import { clientIpOf, forwardedIpHeaders } from "@/lib/auth/client-ip";
import { applyAuthCookies, buildAuthCookies } from "@/lib/auth/cookies";
import type { TokenPair } from "@/lib/auth/types";

interface ParsedLogin {
  email: string;
  password: string;
  remember: boolean;
}

function parseLoginBody(data: unknown): ParsedLogin | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.email !== "string" || d.email.trim() === "") return null;
  if (typeof d.password !== "string" || d.password === "") return null;
  return { email: d.email, password: d.password, remember: d.remember === true };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }
  let base: string;
  try {
    base = backendUrl();
  } catch {
    return NextResponse.json({ ok: false, code: "misconfigured" }, { status: 500 });
  }
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  const parsed = parseLoginBody(data);
  if (!parsed) {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  let backendRes: Response;
  try {
    backendRes = await fetch(base + "/auth/login", {
      method: "POST",
      // Backend'in giris hiz siniri IP basinadir: istemci IP'si iletilmezse tum sirket tek kovadir.
      headers: { "content-type": "application/json", ...forwardedIpHeaders(clientIpOf(request)) },
      body: JSON.stringify({ email: parsed.email, password: parsed.password }),
    });
  } catch {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
  }
  if (!backendRes.ok) {
    // Ham backend mesajini sizdirma; yalniz statuyu gecir.
    // 401/403 invalid_credentials; diger non-2xx: login_failed
    const code = backendRes.status === 401 || backendRes.status === 403 ? "invalid_credentials" : "login_failed";
    return NextResponse.json({ ok: false, code }, { status: backendRes.status });
  }
  let pair: unknown;
  try {
    pair = await backendRes.json();
  } catch {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
  }
  // Validate pair has access_token and refresh_token (non-empty strings)
  if (
    typeof pair !== "object" ||
    pair === null ||
    typeof (pair as Record<string, unknown>).access_token !== "string" ||
    (pair as Record<string, unknown>).access_token === "" ||
    typeof (pair as Record<string, unknown>).refresh_token !== "string" ||
    (pair as Record<string, unknown>).refresh_token === ""
  ) {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
  }
  const res = NextResponse.json({ ok: true });
  applyAuthCookies(res, buildAuthCookies(pair as TokenPair, parsed.remember));
  return res;
}
