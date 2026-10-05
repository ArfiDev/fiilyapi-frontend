/**
 * `Ayarlar > Onay Eşiği` SAF katmanı (eski adı "Onay Rolleri ve Eşik").
 * Kanon: `projedesign/Ayarlar - Onay Rolleri.dc.html` (`:NN` = O dosyanın
 * satır numarası).
 *
 * IZN-B3b: kullanıcı × onay rolü atama kısmı KALKTI (backend 410) — onayı
 * belgenin projesinde ilgili role atanmış kişi verir (Ayarlar > Kullanıcılar).
 * Geriye yalnız eşik kartı kaldı.
 */

/* --- Eşik kartı (`:139-176`) --------------------------------------------- */

export const APPROVAL_THRESHOLD_CARD_TITLE = "Onay Eşiği";
export const APPROVAL_THRESHOLD_ADMIN_BADGE = "YALNIZ YÖNETİCİ";
export const APPROVAL_THRESHOLD_FIELD_LABEL = "Patron Onay Eşiği";
export const APPROVAL_THRESHOLD_HINT =
  "Değiştirmek için Sistem Yöneticisi yetkisi gerekir. Değişiklik denetim günlüğüne işlenir.";
export const APPROVAL_THRESHOLD_LOCKED_NOTE =
  "Onay eşiği yalnız Sistem Yöneticisi tarafından değiştirilebilir — bu alan salt okunur.";
export const APPROVAL_THRESHOLD_SAVE_LABEL = "Eşiği Kaydet";
export const APPROVAL_THRESHOLD_SAVE_ERROR = "Eşik kaydedilemedi.";
export const APPROVAL_THRESHOLD_FLOW_TITLE = "Eşik nasıl çalışır?";

/**
 * `:158` `< ₺500.000` · `:167` `≥ ₺500.000`.
 *
 * ⚠️ ONAYLI SAPMA — `≥` (U+2265) `src/styles/fonts.css`teki 7 `unicode-range`
 * kuralının HİÇBİRİNDE kapsanmıyor (ölçüldü); kapsanmayan glif tarayıcıyı
 * sistem yedeğine düşürür ve kare `ubuntu-latest`te turdan tura oynar.
 * Anlamı koruyan sözcük kullanılır (glif yasağı kanonu, F-MU2).
 */
export function approvalThresholdBelowLabel(formattedThreshold: string): string {
  return `${formattedThreshold} altı`;
}

export function approvalThresholdAboveLabel(formattedThreshold: string): string {
  return `${formattedThreshold} ve üstü`;
}
