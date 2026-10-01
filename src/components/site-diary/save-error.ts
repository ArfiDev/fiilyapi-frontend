import { BackendError } from "@/lib/api/unwrap";

import { parseLockedDays } from "@/components/timesheet/timesheet-lock";

/**
 * GKS-F1.2a · günlük kaydetme hatasının SINIFI (saf, React yok).
 *
 * - `locked`: 409 + geçerli `locked_days` (gün rapor onayıyla kilitli; "Var
 *   olan kaydı aç" basılmaz).
 * - `date_conflict`: kilit olmayan diğer her 409 (aynı güne ikinci kayıt,
 *   UQ yarışı). Metne BAKILMAZ (EV-BORC-2 ilkesi); POST'taki `DUPLICATE_LINE`
 *   409'u da buraya düşer — istemci Map anahtarıyla üretemez, kabul edilmiş
 *   risk (karar Ü10).
 * - `other`: geri kalan (403/404/422/ağ).
 *
 * Kilit gövdesi DIŞ VERİDİR; `parseLockedDays` katıdır (boş / bozuk gün =
 * kilit 409'u sayılmaz).
 */
export type DiarySaveErrorKind = "locked" | "date_conflict" | "other";

export function classifyDiarySaveError(error: unknown): DiarySaveErrorKind {
  if (!(error instanceof BackendError) || error.status !== 409) return "other";
  const body = error.body;
  const lockedDays = body !== null && typeof body === "object" ? (body as { locked_days?: unknown }).locked_days : undefined;
  return parseLockedDays(lockedDays) !== null ? "locked" : "date_conflict";
}
