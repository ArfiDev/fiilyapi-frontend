/**
 * KAT:417-432 örnek verisindeki birimler (m², m³, ton, m, adet) + `kg`
 * (TKL ÜS-11, "ton"un yanında). Backend'de birim serbest metindir (≤50).
 * TEK KAYNAK: Birim Oran Kataloğu (KAT) ve İş Kalemi Kataloğu aynı listeyi
 * kullanır — aynı kalemde iki ekranda farklı birim seçeneği çıkmaz.
 */
export const CATALOG_UNIT_OPTIONS: readonly string[] = ["m³", "m²", "m", "ton", "kg", "adet"];

/**
 * Açılır liste seçenekleri: sabit liste + katalogdaki mevcut birimler + düzenlenen
 * kaydın birimi (eski değer kaybolmasın). Tekrarsız, boşsuz.
 */
export function unitOptions(catalogUnits: readonly string[], current: string): string[] {
  return Array.from(new Set([...CATALOG_UNIT_OPTIONS, ...catalogUnits, current].filter(Boolean)));
}
