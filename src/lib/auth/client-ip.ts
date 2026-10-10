import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/**
 * 🔴 İstemcinin gerçek IP'si — backend'in hız sınırı ve denetim kaydı bunu ister.
 *
 * Backend public'e KAPALIDIR, yalnız BFF ona ulaşır; backend bu yüzden BFF'nin
 * ilettiği `X-Forwarded-For`a güvenir (`fiilyapi-backend/app/core/ratelimit.py`).
 * BFF iletmezse backend her isteği BFF'nin IP'sinden gelmiş görür: "IP başına
 * 10 giriş/dk" tüm şirket için TEK kovaya döner, denetim kaydındaki her IP aynı olur.
 *
 * Kaynak: Railway edge'i `X-Real-IP` ve `X-Forwarded-For`u istemcinin
 * gönderdiklerinin ÜZERİNE yazar; bu yüzden ikisi de istemcinin uydurabileceği
 * bir değer taşımaz. `X-Real-IP` önceliklidir (tek değer, liste değil).
 * ⚠️ Railway dışında, başlıkları üzerine yazmayan bir proxy arkasında bu varsayım
 * ÇÖKER: istemci kendi IP'sini seçebilir hâle gelir.
 *
 * Geçerli bir IP değilse `undefined`: backend'e çöp yazılmaz, backend kendi
 * bağlantısının adresine düşer.
 */
export function clientIpOf(request: NextRequest): string | undefined {
  const realIp = validIp(request.headers.get("x-real-ip"));
  if (realIp) return realIp;
  const firstForwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return validIp(firstForwarded);
}

function validIp(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && isIP(trimmed) !== 0 ? trimmed : undefined;
}

/** Backend'e giden isteğe eklenecek başlık; IP yoksa HİÇBİR başlık eklenmez. */
export function forwardedIpHeaders(clientIp: string | undefined): Record<string, string> {
  return clientIp ? { "x-forwarded-for": clientIp } : {};
}
