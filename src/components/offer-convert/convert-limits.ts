/**
 * TKL-F5.4b · dönüştürme SINIRLARI ve metinleri — bağımlılıksız küçük sabit modülü (SAF veri).
 * `convert-validate` (taslak kapısı) ve ortak seçicinin dönüştürme hedefi (`picker-rules`) AYNI değerleri buradan okur;
 * böylece seçici, doğrulama modülünün ağır içe alımlarına (model, derive, project-form…) bağlanmaz.
 */

/** `convert_schemas.CONVERT_MAX_ITEMS`. */
export const MAX_CONVERT_ITEMS = 2000;

/** `convert_schemas`: sözleşme grubu adı ≤ 200. */
export const MAX_CONVERT_GROUP_NAME = 200;

/** Seçici (F5.4) tavan bandında AYNI metni basar. */
export const MSG_TOO_MANY = `En fazla ${MAX_CONVERT_ITEMS} kalem dönüştürülebilir`;

export const maxCharsMessage = (max: number): string => `En çok ${max} karakter`;
