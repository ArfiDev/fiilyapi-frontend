import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";
import type { RentalInvoiceStatus } from "@/lib/api/hooks/useEquipmentRentalInvoices";

/**
 * F-KIRA · kira hakedişinin DURUM → İZİNLİ EYLEM haritası.
 *
 * Backend `rental_transitions.py:34-42` geçiş tablosunun görünürlük
 * yansımasıdır. Güvenlik sınırı HER ZAMAN backend'dedir; bu yalnız
 * çalışmayacak butonu göstermemek içindir.
 *
 * | durum                | approve | pay | reject | düzenleme |
 * |----------------------|---------|-----|--------|-----------|
 * | draft                | ✅→pv   | 409 | 409    | ✅        |
 * | pending_verification | ✅→app  | 409 | 409    | ✅        |
 * | approved             | 409     | ✅  | ✅→pv  | 409       |
 * | paid                 | 409     | 409 | 409    | 409       |
 *
 * 🔴 EMSALDEN SAPMA — İZİN EŞİĞİ. `progress-payments/shared/status-actions.ts`
 * `approve`/`admin` eşikleri kullanır. KİRADA HEPSİ `full`tur:
 * `rental_router.py:54-55` `_FULL = require_permission(…, AccessLevel.full)`
 * ve sekiz yazma ucunun HEPSİ `dependencies=[_FULL]` taşır. Emsal
 * kopyalansaydı `approve` seviyeli kullanıcı 403 veren düğmeler görürdü.
 */
export type RentalActionKind = "approve" | "pay" | "reject";

/** Yazma uçlarının backend eşiği — tek yerde. */
export const RENTAL_WRITE_LEVEL: AccessLevel = "full";

/**
 * IZN-F2.x: `canAct` verilirse (saha.makine_kira ONAYLAR kararı, `useButtonGate`) seviye
 * eşiğinin YERİNE geçer; verilmezse bugünkü `full` eşiği uygulanır.
 */
export function permittedRentalActions(
  status: RentalInvoiceStatus,
  level: AccessLevel | undefined,
  canAct?: boolean,
): RentalActionKind[] {
  if (!(canAct ?? hasAtLeast(level, RENTAL_WRITE_LEVEL))) return [];

  switch (status) {
    case "draft":
    case "pending_verification":
      // İleri adım TEK uçtur (`approve`) ve zinciri BİR adım ilerletir.
      return ["approve"];
    case "approved": {
      // 🔴 `approve` YOK: `approved → paid` geçişi tabloda vardır ama ödemenin
      // KENDİ ucu vardır (`rental_service.py:648-650` bu hedefi AYRICA
      // reddeder) — "onayla"ya basan kullanıcı ödeme yapmış OLMAMALIDIR.
      // Sıra mockup'ın okuma yönünü izler: geri alma solda, ilerletme sağda.
      return ["reject", "pay"];
    }
    case "paid":
      // Uç durum: `paid` hiçbir geçişin KAYNAĞI değildir.
      return [];
  }
}

/**
 * İleri adım düğmesinin etiketi — DURUMA GÖRE değişir.
 *
 * 🔴 Tek uç (`POST …/approve`) İKİ ANLAM taşır: `draft`ta basılınca fatura
 * "Doğrulama Bekliyor"a geçer, `pending_verification`ta basılınca onaylanır.
 * Backend docstring'i yalnız İKİNCİ anlamı adlandırır. Tek sabit etiket
 * basılsaydı `draft` hâlinde ekran OLMAYAN bir olguyu iddia ederdi (F-BOR
 * kanonu: sabit metin bir olgu iddia ediyorsa o olguyu OKUMAK zorundadır).
 */
export const RENTAL_FORWARD_ACTION_LABEL: Record<RentalInvoiceStatus, string | null> = {
  // Hedef durumun mockup'taki adı M5:65 "Doğrulama Bekliyor" — etiket ondan türer.
  draft: "Doğrulamaya Gönder",
  // rental_router.py:210 docstring'inde KALIN, openapi `description`ında aynen,
  // ayrıca rental_transitions.py:46 ve rental_service.py:640 — ÜÇ yerde birebir.
  // ONAYLI SAPMA: M5:27 "Kiracıya Gönder" der ama akış yönüyle çelişir
  // (gelen faturayı BİZ ödüyoruz).
  pending_verification: "Onayla ve Ödemeye Gönder",
  approved: null,
  paid: null,
};

export function rentalForwardActionLabel(status: RentalInvoiceStatus): string | null {
  return RENTAL_FORWARD_ACTION_LABEL[status];
}

/**
 * Eylem düğmelerinin etiketleri. `pay`/`reject` backend servis mesajlarıyla
 * aynı dili konuşur (`rental_service.py:681` "…ödendi olarak işaretlendi",
 * `:710` "…onayı geri alındı").
 *
 * `approve` burada ucun KANONİK adını taşır; ekran duruma göre değişen hâli
 * için `rentalForwardActionLabel`ı kullanır.
 */
export const RENTAL_ACTION_LABEL: Record<RentalActionKind, string> = {
  approve: "Onayla ve Ödemeye Gönder",
  pay: "Ödendi İşaretle",
  reject: "Onayı Geri Al",
};

/**
 * Başlık ve satır düzenlemesi açık mı? Backend
 * `rental_transitions.py:60-62` `EDIT_LOCKED_STATUSES = {approved, paid}`
 * yansıması — kilitli durumda PATCH 409 döner
 * (`INVOICE_LOCKED`: "Onaylanmış ya da ödenmiş bir kira hakedişi
 * düzenlenemez. Düzeltme için önce hakedişin onayını geri alın.").
 */
export function isRentalEditable(status: RentalInvoiceStatus): boolean {
  return status === "draft" || status === "pending_verification";
}
