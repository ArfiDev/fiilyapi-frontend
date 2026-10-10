import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { proxyAuthenticated } from "@/lib/auth/backend";
import { clientIpOf } from "@/lib/auth/client-ip";
import { applyAuthCookies, clearedAuthCookies } from "@/lib/auth/cookies";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

// Backend `POST /auth/logout` token_version'i artirir (backend/app/modules/auth/router.py:90-93):
// o ana dek basilmis TUM token'lar (access + refresh) gecersiz olur. Bu cagri yapilmazsa cikis
// yalniz tarayicidan silinir, sunucuda GERCEKLESMEZ — calinmis bir refresh token cikistan sonra
// da /auth/refresh ile yeni access uretmeye devam eder. Cookie silmek yalniz YEREL yaridir.
// Cagri BEST-EFFORT'tur: sonucu kontrol EDILMEZ ve hata yutulur; aksi halde backend erisilemez
// oldugunda ya da access suresi gectiginde kullanici cikis yapamaz hale gelirdi. Bu yuzden
// asagidaki cookie temizligi KOSULSUZ calisir.
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  try {
    // 401'de proxyAuthenticated once /auth/refresh dener: yeni token'lar AYNI token_version'i
    // tasir, ardindan gelen logout onlari da iptal eder. Sira bu yuzden dogrudur.
    await proxyAuthenticated(access, refresh, "/auth/logout", { method: "POST", clientIp: clientIpOf(request) });
  } catch {
    // BACKEND_URL tanimsiz ya da ag hatasi — yerel cikis engellenmez.
  }
  const res = new NextResponse(null, { status: 204 });
  applyAuthCookies(res, clearedAuthCookies());
  return res;
}
