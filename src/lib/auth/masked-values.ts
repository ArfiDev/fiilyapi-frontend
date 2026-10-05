/**
 * IZN-F4b.2 — maskeli (`null`) değer yardımcıları. SAF; gizleme kararı VERMEZ.
 * Backend gizli alanı `null` döndürür; `0` maskeli DEĞİLDİR (gerçek sıfır).
 */

/** Listede en az bir `null` (maskeli) var mı? `undefined` (henüz yok) maskeli sayılmaz. */
export function hasMaskedValue(values: readonly (string | number | null | undefined)[]): boolean {
  return values.some((value) => value === null);
}

/**
 * Başlıkta kilit ipucu gösterilsin mi: kategori gizli VE sütunda gerçekten maskeli değer var.
 * (Kategori gizli ama değer dolu ise — ör. proje bağlamı farkı — yalan kilit basılmaz.)
 */
export function shouldShowHiddenMark(
  isHidden: boolean,
  values: readonly (string | number | null | undefined)[],
): boolean {
  return isHidden && hasMaskedValue(values);
}
