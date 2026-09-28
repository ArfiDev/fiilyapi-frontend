/**
 * SEKME-F1.1-FIX · TEK GÜVENLİ URL DOĞRULAYICI.
 *
 * `persistence.ts` (localStorage'dan okurken) ve `tabs-reducer.ts` (reducer'a
 * giren HER ham url için) AYNI fonksiyonu kullanır. Önceki turda iki ayrı
 * doğrulama vardı ve biri (reducer'ın kendisi, hiç doğrulama YAPMIYORDU)
 * diğerinden (persistence'ın basit `startsWith`/`includes` denetimi) çok daha
 * gevşekti — "/./api/auth/logout", "/x/../api/x", "/API/x" gibi yollar
 * `/api/` önek denetimini path normalizasyonuyla aşıyordu (Y1 bulgusu).
 *
 * Denetim sırası:
 * 1. Boş / "/" ile başlamıyor / `MAX_TAB_URL_LENGTH`i aşıyor / kontrol
 *    karakteri (`\u0000-\u001F`, `\u007F`) / "\\" / "#" içeriyor → RET
 *    (WHATWG `URL` sekme/yeni satırı SESSİZCE atar, bu yüzden kontrol
 *    karakteri denetimi `URL`den ÖNCE, ham dizede yapılır).
 * 2. `new URL(url, "http://x")` ile ÇÖZÜLÜR; çözülen origin taban origin'den
 *    FARKLIYSA ("//evil.com" gibi protokol-göreli sızma) → RET.
 * 3. Çözülen pathname `decodeURIComponent` ile AÇILIR (çözülemezse — bozuk
 *    `%` dizisi — RET) ve açılan hâlin küçük harflisi "/api" ile
 *    başlıyorsa → RET. Yalnız ÇÖZÜLMEMİŞ pathname'e bakmak
 *    `/%61pi/x`, `/%41PI/x`, `/ap%69/x` gibi yüzde-kodlamayla `/api/`
 *    önek denetimini aşma girişimlerini KAÇIRIYORDU (N1 turu bulgusu) —
 *    Next.js üretim ortamında istek çözülmüş yol üzerinden eşleşir, yani
 *    tarayıcı bu üç girdiyi de sunucu tarafında `/api/...`e çevirebilir.
 * 4. Çözülen `pathname + search`, girdiyle BİREBİR aynı değilse (`new URL`
 *    "." / ".." segmentlerini ve "//" önekini SESSİZCE normalize eder) → RET.
 *
 * 🔵 BİLGİ (düzeltme GEREKTİRMEZ, kasıtlı): ham ASCII-dışı karakter taşıyan
 * url'ler (`/ı`, sorgu içinde `ş` …) `new URL` tarafından yüzde-kodlanır ve
 * bu yüzden 4. adımdaki normalizasyon eşitliğini HER ZAMAN kırıp fail-closed
 * reddedilir — TÜKETİCİ (router senkronu) bu fonksiyona url'yi ZATEN
 * kodlanmış (`encodeURI`/`encodeURIComponent` uygulanmış) vermekle yükümlüdür.
 */
import { MAX_TAB_URL_LENGTH } from "./types";

const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;
const BASE_ORIGIN = "http://x";

export function isSafeInternalUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.length > MAX_TAB_URL_LENGTH) return false;
  if (!url.startsWith("/")) return false;
  if (CONTROL_CHAR_RE.test(url)) return false;
  if (url.includes("\\")) return false;
  if (url.includes("#")) return false;

  let resolved: URL;
  try {
    resolved = new URL(url, BASE_ORIGIN);
  } catch {
    return false;
  }
  if (resolved.origin !== BASE_ORIGIN) return false;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(resolved.pathname);
  } catch {
    return false; // bozuk `%` dizisi — fail-closed
  }
  if (decodedPath.toLowerCase().startsWith("/api")) return false;

  const normalized = resolved.pathname + resolved.search;
  if (normalized !== url) return false;

  return true;
}
