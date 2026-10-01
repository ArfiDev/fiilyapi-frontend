// TKL-F1.2 · iki katalog ekranının (KAT `/earned-value/catalog` ve çekirdek
// `/catalog/items`) önbellek anahtarları TEK yerde: iki hook dosyası birbirini
// ithal etmeden çapraz geçersizleme yapar (döngüsel ithal yok).
export const EV_CATALOG_QUERY_KEY = "ev-catalog";
export const CATALOG_ITEMS_QUERY_KEY = "catalog-items";
