import { downloadExport, withQuery } from "@/lib/api/download";

// TKL-F4.3 · İş Kalemi Kataloğu Excel çıktısı (plan §5, ÜS-F4-14).
// 🔴 YALNIZ disiplin süzgeci gider; arama metni (`q`) GÖNDERİLMEZ — sunucu `ilike`
// ile istemci süzgeci farklı eşleşebilir. Uç `/catalog` kökündedir (BFF'de var).

const DEFAULT_EXPORT_FILENAME = "is-kalemi-katalogu.xlsx";
const CATALOG_EXPORT_PATH = "/api/backend/catalog/items/export";

export interface CatalogExportFilter {
  disciplineId?: string | null;
}

/** Kataloğu (varsa tek disiplinle sınırlı) xlsx olarak indirir; çözülen dosya adını döndürür. */
export function downloadCatalogExport(filter: CatalogExportFilter = {}): Promise<string> {
  const query: Record<string, string> = filter.disciplineId ? { discipline_id: filter.disciplineId } : {};
  return downloadExport(withQuery(CATALOG_EXPORT_PATH, query), DEFAULT_EXPORT_FILENAME);
}
