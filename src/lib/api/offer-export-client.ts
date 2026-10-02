import { downloadExport, withQuery } from "@/lib/api/download";

// TKL-F4.3 · teklif revizyonu Excel çıktısı (plan §5).
// Uç `/offers` kökündedir (BFF izin listesinde ZATEN var); uzantısız `…/export`
// yolu BFF'de `Content-Type`tan ikili sayılır.

export type OfferExportView = "employer" | "internal";

const VIEW_LABELS: Record<OfferExportView, string> = { employer: "isveren", internal: "ic" };

function offerExportPath(offerId: string, revNo: number, view: OfferExportView): string {
  // `offerId` rota parametresidir = KULLANICI GİRDİSİ → kaçış şart.
  const base = `/api/backend/offers/${encodeURIComponent(offerId)}/revisions/${revNo}/export`;
  return withQuery(base, { view });
}

/**
 * Teklif revizyonunu xlsx olarak indirir; çözülen dosya adını döndürür.
 * `view=internal` maliyet + kâr taşır (backend `limited` için para sütunlarını boşaltır).
 */
export function downloadOfferExport(offerId: string, revNo: number, view: OfferExportView): Promise<string> {
  return downloadExport(offerExportPath(offerId, revNo, view), `teklif-Rev${revNo}-${VIEW_LABELS[view]}.xlsx`);
}
