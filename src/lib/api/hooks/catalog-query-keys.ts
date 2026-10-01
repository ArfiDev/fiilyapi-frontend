// TKL-F1.2 · iki katalog ekranının (KAT `/earned-value/catalog` ve çekirdek
// `/catalog/items`) önbellek anahtarları TEK yerde: iki hook dosyası birbirini
// ithal etmeden çapraz geçersizleme yapar (döngüsel ithal yok).
export const EV_CATALOG_QUERY_KEY = "ev-catalog";
export const CATALOG_ITEMS_QUERY_KEY = "catalog-items";
// TKL-F1.3.1 · disiplin listeleri de burada: KAT disiplin yazması çekirdek çiplerini
// (`catalog-disciplines`), kalem yazması `used_by_item_count` taşıyan KAT disiplin
// listesini (`ev-disciplines`) tazeler.
export const CATALOG_DISCIPLINES_QUERY_KEY = "catalog-disciplines";
export const EV_DISCIPLINES_QUERY_KEY = "ev-disciplines";
