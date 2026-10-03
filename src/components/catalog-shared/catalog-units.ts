/**
 * Kanonik birim yazımı (T47): kelime birimler İLK HARF BÜYÜK (Adet, Kg, Ton,
 * Lt, Gün, Saat, Takım), metre sembolleri küçük (m, m², m³). Bakanlık
 * aktarım verisi bu yazımla gelir. Backend'de birim serbest metindir (≤50).
 * TEK KAYNAK: Birim Oran Kataloğu (KAT) ve İş Kalemi Kataloğu aynı listeyi
 * kullanır — aynı kalemde iki ekranda farklı birim seçeneği çıkmaz.
 */
export const CATALOG_UNIT_OPTIONS: readonly string[] = [
  "m³",
  "m²",
  "m",
  "Ton",
  "Kg",
  "Adet",
  "Lt",
  "Gün",
  "Saat",
  "Takım",
];

/** Büyük/küçük harf duyarsız (tr-TR) karşılaştırma anahtarı. */
function unitKey(unit: string): string {
  return unit.toLocaleLowerCase("tr-TR");
}

/**
 * Aynı birimin farklı yazımlarını (kg / Kg) tek seçeneğe indirger; ilk gelen
 * (kanonik sabit liste önce gelir) kazanır. Boşlar atılır.
 */
export function dedupeUnits(units: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const unit of units) {
    if (unit && !seen.has(unitKey(unit))) seen.set(unitKey(unit), unit);
  }
  return Array.from(seen.values());
}

/**
 * Açılır liste seçenekleri: sabit liste + katalogdaki mevcut birimler + düzenlenen
 * kaydın birimi (eski değer kaybolmasın). Harf duyarsız tekil, boşsuz.
 */
export function unitOptions(catalogUnits: readonly string[], current: string): string[] {
  return dedupeUnits([...CATALOG_UNIT_OPTIONS, ...catalogUnits, current]);
}

/**
 * `<select value>` için GÖSTERİM değeri: kayıtlı birim listedeki seçenekle yalnız
 * harf farkıyla eşleşiyorsa (kg ↔ Kg) o seçeneği döndürür; yoksa değeri olduğu gibi.
 * Form durumu DEĞİŞMEZ — kullanıcı dokunmazsa kaydedilen birim "kg" kalır.
 */
export function selectedUnit(options: readonly string[], current: string): string {
  const key = unitKey(current);
  return options.find((option) => unitKey(option) === key) ?? current;
}
