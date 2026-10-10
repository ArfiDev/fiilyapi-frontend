import { forwardedIpHeaders } from "./client-ip";
import type { TokenPair } from "./types";

export interface ProxyResult {
  status: number;
  body: unknown;
  // Seffaf refresh olduysa yeni access token — cagiran taraf access cookie'sini gunceller.
  refreshedAccessToken?: string;
}

export interface ProxyOptions {
  method?: string;
  body?: unknown;
  /**
   * F-BC — JSON'a ÇEVRİLMEDEN geçirilecek ham gövde (multipart belge yükleme).
   *
   * `body` ile birlikte verilmez; verilirse `rawBody` kazanır. `ArrayBuffer`
   * bilinçli tercihtir: 401 → refresh → tek retry yolunda gövde İKİNCİ KEZ
   * okunabilir olmalıdır (akış gövdesi ikinci istekte tükenmiş olurdu).
   */
  rawBody?: { data: ArrayBuffer; contentType: string };
  query?: Record<string, string>;
  /** İstemcinin gerçek IP'si (`clientIpOf`); backend'e `X-Forwarded-For` olarak gider. */
  clientIp?: string;
}

export function backendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (!url) throw new Error("BACKEND_URL tanimli degil");
  return url;
}

async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildUrl(path: string, query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) return backendUrl() + path;
  const qs = new URLSearchParams(query).toString();
  return backendUrl() + path + "?" + qs;
}

// Backend'e Bearer ile tek istek — method/body/query destekli.
function request(path: string, accessToken: string | undefined, options: ProxyOptions): Promise<Response> {
  const { method = "GET", body, rawBody, query, clientIp } = options;
  const headers: Record<string, string> = { ...forwardedIpHeaders(clientIp) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const init: RequestInit = { method, headers };
  if (rawBody !== undefined) {
    // Boundary iceren `Content-Type` AYNEN gecer — yeniden uretilmez.
    headers["content-type"] = rawBody.contentType;
    init.body = rawBody.data;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetch(buildUrl(path, query), init);
}

// Backend `/auth/refresh` cagrisi — hiz siniri IP'ye gore oldugu icin istemci IP'si burada da gider.
export function refreshRequest(refreshToken: string, clientIp: string | undefined): Promise<Response> {
  return fetch(backendUrl() + "/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json", ...forwardedIpHeaders(clientIp) },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/**
 * Ham (ayristirilmamis) proxy sonucu — govde HER DURUMDA `ArrayBuffer` olarak
 * okunur, hata yanitlari dahil (spec §8.1).
 *
 * Neden hata govdesi de okunuyor: ikili/JSON karari artik `Content-Type`
 * geldikten SONRA veriliyor. Onceki `proxyAuthenticatedBinary` `!res.ok` iken
 * govdeyi dusuruyordu; boyle bir yolda backend'in 403/409/422 Turkce hata
 * mesajlari kullaniciya hic ulasmazdi.
 */
export interface ProxyRawResult {
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  data: ArrayBuffer;
  refreshedAccessToken?: string;
}

async function rawResult(response: Response, refreshedAccessToken?: string): Promise<ProxyRawResult> {
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentDisposition: response.headers.get("content-disposition"),
    data: await response.arrayBuffer(),
    refreshedAccessToken,
  };
}

// proxyAuthenticated ile ayni 401 → /auth/refresh → tek retry davranisi,
// JSON ayristirmasi olmadan.
export async function proxyAuthenticatedRaw(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  path: string,
  options: ProxyOptions = {},
): Promise<ProxyRawResult> {
  const first = await request(path, accessToken, options);
  if (first.status !== 401) return rawResult(first);
  if (!refreshToken) return rawResult(first);

  const refreshed = await refreshRequest(refreshToken, options.clientIp);
  if (!refreshed.ok) return rawResult(first);

  const pair = (await parseBody(refreshed)) as TokenPair | null;
  if (!pair?.access_token) return rawResult(first);

  const retry = await request(path, pair.access_token, options);
  return rawResult(retry, pair.access_token);
}

// Backend'i Bearer ile cagirir; 401'de refresh token varsa /auth/refresh dener,
// basarili ise yeni access token ile AYNI method+body+query ile bir kez retry eder.
export async function proxyAuthenticated(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  path: string,
  options: ProxyOptions = {},
): Promise<ProxyResult> {
  const first = await request(path, accessToken, options);
  if (first.status !== 401) {
    return { status: first.status, body: await parseBody(first) };
  }
  if (!refreshToken) {
    return { status: 401, body: await parseBody(first) };
  }
  const refreshed = await refreshRequest(refreshToken, options.clientIp);
  if (!refreshed.ok) {
    // 🔴 Refresh basarisizsa `first`in govdesi (backend'in Turkce 401 hata
    // metni) DUSURULMEZ — `proxyAuthenticatedRaw`in AYNI dalindaki
    // `rawResult(first)` deseniyle simetrik (o ikiz govdeyi zaten koruyordu).
    return { status: 401, body: await parseBody(first) };
  }
  const pair = (await parseBody(refreshed)) as TokenPair | null;
  if (!pair?.access_token) {
    // Ayni gerekce: refresh yaniti 200 ama beklenen sekilde degilse de
    // `first`in orijinal govdesi kullaniciya ULASMALI, `null` DEGIL.
    return { status: 401, body: await parseBody(first) };
  }
  const retry = await request(path, pair.access_token, options);
  return {
    status: retry.status,
    body: await parseBody(retry),
    refreshedAccessToken: pair.access_token,
  };
}
