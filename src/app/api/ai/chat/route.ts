import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";
import { applyAuthCookies, buildAccessCookie, clearedAuthCookies } from "@/lib/auth/cookies";
import { backendUrl, refreshRequest } from "@/lib/auth/backend";
import { clientIpOf, forwardedIpHeaders } from "@/lib/auth/client-ip";
import { assertSameOrigin } from "@/lib/auth/csrf";
import type { TokenPair } from "@/lib/auth/types";

/**
 * FİİL AI sohbet akışı (AI-1) — **AYRI** BFF rotası, catch-all proxy DEĞİL.
 *
 * 🔴 SEBEP ÖLÇÜLDÜ: `src/lib/auth/backend.ts`teki iki yardımcı da gövdeyi
 * TAMPONLAR (`parseBody` → `res.json()`, `rawResult` → `arrayBuffer()`).
 * `response.body` (ReadableStream) hiçbir yolda geçirilmez ve içerik-tipi
 * kararı akışı ikili SAYMAZ; yani catch-all üzerinden geçen bir SSE yanıtı
 * **200 + `null`** olarak, sessizce ölür. Bu rota gövdeyi hiç okumaz, doğrudan
 * boru bağlar.
 *
 * ─── `runtime = "nodejs"` (bilinçli) ─────────────────────────────────────
 * Depoda bugüne kadar HİÇBİR rota `runtime` ilan etmemişti (ölçüldü); yani bu
 * bir kopya değil, ilk karar. Node seçildi çünkü:
 *   1. `backendUrl()` `process.env.BACKEND_URL` okur — edge çalışma zamanında
 *      bu değişken derleme anında gömülmediği sürece YOKTUR ve rota canlıda
 *      "BACKEND_URL tanimli degil" ile patlardı.
 *   2. `buildAccessCookie` → `readTokenExp` `Buffer.from(..., "base64url")`
 *      kullanır; `Buffer` bir Node API'sidir, edge'de bulunmaz.
 *   3. Dağıtım hedefi Railway'de Next standalone sunucusudur (tek Node
 *      süreci); edge çalışma zamanı orada zaten ek bir kazanç sağlamaz.
 *
 * ─── `maxDuration = 300` (bilinçli) ──────────────────────────────────────
 * Üst kaynaktaki sağlayıcı adaptörünün tek çağrı zaman aşımı 60 sn'dir ve bir
 * tur en fazla 8 araç çağrısı yapabilir (`ai_max_tool_calls`), yani her araç
 * turundan sonra YENİ bir model çağrısı gelir. Tavanı 60'a çekmek, araç
 * zincirleyen normal bir turu ortasından keserdi. 300 sn, en kötü hâlin
 * altında kalan ama **sınırlı** bir tavandır: asılı bir tur bir işçiyi sonsuza
 * kadar tutamaz.
 *
 * ⚠️ DÜRÜSTLÜK NOTU: `maxDuration` bir Next/Vercel dağıtım ipucudur. Railway'in
 * Node sunucusunda ve ters vekilinde bu değerin FİİLEN uygulanıp uygulanmadığı
 * bu dilimde **ÖLÇÜLMEDİ** (canlıya bağlanmak kapsam dışıydı). Beyan, niyeti
 * kayda geçirir; garanti etmez.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** Üst kaynaktaki tek hedef. 🔴 İstemciden yol/kök ALINMAZ (SSRF). */
const UPSTREAM_PATH = "/ai/chat";

/** Backend `AiChatRequest` ile aynı sınır (`Field(min_length=1, max_length=4000)`). */
const MAX_MESAJ = 4000;

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

/**
 * İstemciden taşınan **tam** yük. 🔴 DÖRT alan; beşincisi taşınmaz.
 *
 * 🔴🔴 AI-BAĞLAM'IN GERÇEK TIKACI BURASIYDI. Görev emri devrin
 * (`pnpm gen:api`) yapılmamasını tıkaç sanıyordu — ölçüm bunu çürüttü:
 * akış istemcisi `backendClient`i DEĞİL ham `fetch` kullanır (bu dosyanın
 * üst notu sebebini yazıyor), yani üretilmiş tipler o gövdeye hiç dokunmaz ve
 * `project_id` göndermek `typecheck`i KIRMAZDI. Tıkaç, aşağıdaki `readYuk`un
 * **izin listesiydi**: gövde burada YENİDEN KURULUYOR ve listede olmayan her
 * alan sessizce düşüyordu. Bağlam alanları buraya eklenmeden, istemci onları
 * göndermiş olsa bile üst kaynağa HİÇ ULAŞMAZDI — kusur yalnız CANLIDA
 * görünürdü (BFF izin listesi tuzağı).
 */
interface AiChatYuku {
  mesaj: string;
  conversationId: string | null;
  /** Sağ üstteki "Sohbet Bağlamı" panelinin seçimi (AI-BAĞLAM). */
  projectId: string | null;
  siteId: string | null;
}

function upstreamRequest(
  yuk: AiChatYuku,
  accessToken: string | undefined,
  clientIp: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", ...forwardedIpHeaders(clientIp) };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return fetch(backendUrl() + UPSTREAM_PATH, {
    method: "POST",
    headers,
    // 🔴 Gövde YENİDEN KURULUR. İstemcinin gönderdiği nesne olduğu gibi
    // iletilseydi, oraya konan fazladan alanlar üst kaynağa sızardı.
    // 🔴 `conversation_id` bir SAHİPLİK iddiasıdır, bir yetki DEĞİL: backend
    // onu `WHERE user_id = :actor` ile doğrular ve başkasınınkine 404 verir.
    // BFF burada hiçbir doğrulama YAPMAZ ve yapmamalıdır — kapının iki yerde
    // olması, bir gün ikisinin ayrışması demektir.
    // 🔴 `project_id`/`site_id` her zaman yazılır (yokken `null`). Sunucu
    // doldurmayı `is None` ile yapar; alanı atlamakla `null` göndermek aynı
    // sonucu verir ama tek bir gövde şekli, testin de izin listesinin de tek
    // bir şeyi ölçmesini sağlar.
    // 🔴 Bunlar da bir SAHİPLİK iddiasıdır, yetki DEĞİL: görünmeyen bir
    // proje/şantiye backend'de **404** alır (403 değil — S14 varlık sızıntısı).
    // BFF burada görünürlük DOĞRULAMAZ; kapının iki yerde olması, bir gün
    // ikisinin ayrışması demektir.
    body: JSON.stringify({
      mesaj: yuk.mesaj,
      ...(yuk.conversationId === null ? {} : { conversation_id: yuk.conversationId }),
      project_id: yuk.projectId,
      site_id: yuk.siteId,
    }),
  });
}

/** Kaba biçim kontrolü — UUID'nin GEÇERLİLİĞİ backend'in işidir. */
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * İsteğe bağlı bir kimlik alanını okur.
 *
 * Dönüş: `null` → alan yok/boş · `string` → geçerli biçim · `undefined` →
 * GEÇERSİZ (istek 400). Üç hâl AYRI tutulur; `null` ile "geçersiz"i tek
 * değere indirmek, çöp bir kimliği sessizce "bağlam yok"a çevirirdi.
 */
function readKimlik(ham: unknown): string | null | undefined {
  if (ham === undefined || ham === null) return null;
  if (typeof ham !== "string" || !UUID_DESENI.test(ham)) return undefined;
  return ham;
}

/**
 * Gövdeden YALNIZ `mesaj` + `conversation_id` + `project_id` + `site_id`
 * okunur; başka alan taşınmaz.
 */
function readYuk(payload: unknown): AiChatYuku | null {
  if (typeof payload !== "object" || payload === null) return null;
  const {
    mesaj,
    conversation_id: konusma,
    project_id: proje,
    site_id: santiye,
  } = payload as {
    mesaj?: unknown;
    conversation_id?: unknown;
    project_id?: unknown;
    site_id?: unknown;
  };
  if (typeof mesaj !== "string") return null;
  const kirpilmis = mesaj.trim();
  if (kirpilmis.length === 0 || kirpilmis.length > MAX_MESAJ) return null;

  const projectId = readKimlik(proje);
  const siteId = readKimlik(santiye);
  if (projectId === undefined || siteId === undefined) return null;

  if (konusma !== undefined && konusma !== null) {
    if (typeof konusma !== "string" || !UUID_DESENI.test(konusma)) return null;
    return { mesaj: kirpilmis, conversationId: konusma, projectId, siteId };
  }
  return { mesaj: kirpilmis, conversationId: null, projectId, siteId };
}

function unauthenticated(): NextResponse {
  const res = NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  applyAuthCookies(res, clearedAuthCookies());
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const yuk = readYuk(payload);
  if (yuk === null) {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const clientIp = clientIpOf(request);

  let upstream: Response;
  let refreshedAccessToken: string | undefined;
  try {
    upstream = await upstreamRequest(yuk, access, clientIp);

    // 🔴 401 → refresh AKIŞ BAŞLAMADAN çözülür. Akış açıldıktan sonra
    // yeniden kimliklenmek imkânsızdır: başlıklar gitmiş, gövde akmaya
    // başlamıştır ve kullanıcı yarım bir cevabın ardından sessizce susan bir
    // panel görürdü.
    if (upstream.status === 401 && refresh) {
      const refreshed = await refreshRequest(refresh, clientIp);
      if (refreshed.ok) {
        const pair = (await refreshed.json().catch(() => null)) as TokenPair | null;
        if (pair?.access_token) {
          refreshedAccessToken = pair.access_token;
          upstream = await upstreamRequest(yuk, pair.access_token, clientIp);
        }
      }
    }
  } catch {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
  }

  if (upstream.status === 401) return unauthenticated();

  // 🔴 Akış DIŞI her yanıt (403 · 422 · 503 sağlayıcı yapılandırılmadı)
  // gövdesiyle GEÇİRİLİR: backend'in dürüst Türkçe hata metni kullanıcıya
  // ulaşmazsa panel "sistem hatası" der ve operatörü yanlış yere arattırır.
  if (!upstream.ok || upstream.body === null) {
    const body = await upstream.json().catch(() => null);
    const res = NextResponse.json(body ?? { ok: false, code: "unavailable" }, {
      status: upstream.status,
    });
    if (refreshedAccessToken) applyAuthCookies(res, [buildAccessCookie(refreshedAccessToken)]);
    return res;
  }

  // 🔴 TAMPONLAMA YOK: `upstream.body` doğrudan yanıt gövdesi olur.
  const res = new NextResponse(upstream.body, { status: 200, headers: SSE_HEADERS });
  if (refreshedAccessToken) applyAuthCookies(res, [buildAccessCookie(refreshedAccessToken)]);
  return res;
}
