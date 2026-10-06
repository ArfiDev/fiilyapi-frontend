import type { PurchaseQuoteCard } from "@/lib/api/hooks/useQuotes";
import type { PurchaseRequestLineResponse } from "@/lib/api/hooks/usePurchaseRequests";

/**
 * TEK · teklif karşılaştırmasının SAF çekirdeği (F-SA T4).
 *
 * 🔴 BU DOSYADA "EN İYİ FİYAT" HESABI YOKTUR. Rozet SUNUCU DAMGASIDIR
 * (`PurchaseQuoteCard.is_best_price`) ve istemci onu YENİDEN ÜRETMEZ:
 * `total_cost` = `unit_price × request_quantity_total` (+ nakliye hariçse
 * `shipping_cost`) — birim fiyata bakan bir istemci türevi, nakliyesi hariç
 * ucuz GÖRÜNEN teklifi öne çıkarırdı (TEK 90'ın tam senaryosu; şema
 * açıklaması bunu adıyla yazar). Emsal: F-P10 "rozet artık sunucu
 * `quantity_source` damgasından".
 *
 * Beraberlikte sunucu HEPSİNİ rozetler; ekran bunu OLDUĞU GİBİ basar.
 */

/** Sunucunun rozetlediği teklifler — istemci sıralaması YOKTUR. */
export function bestPriceQuotes(items: readonly PurchaseQuoteCard[]): PurchaseQuoteCard[] {
  return items.filter((item) => item.is_best_price);
}

export interface QuoteComparison {
  /** 122 "En Düşük Teklif" — SUNUCUNUN rozetlediği kart (beraberlikte ilki). */
  lowest: PurchaseQuoteCard | null;
  /** Beraberlik var mı — özet tek tedarikçi adı basamaz, bunu söyler. */
  isBestPriceTied: boolean;
  /** 123 "En Yüksek Teklif" — sunucunun `total_cost` değerleri üzerinden. */
  highest: PurchaseQuoteCard | null;
  /** 125 "En İyi Teklif Farkı" = en düşük toplam − talebin tahmini bütçesi. */
  differenceToBudget: number | null;
  /**
   * IZN-F4d.2 — en az bir kartın `total_cost`u `null` (maskeli rol). Toplamlar KARŞILAŞTIRILAMAZ: `Number(null)` 0'dır ve
   * "en yüksek"/"fark" sahte sıfırlarla hesaplanırdı. Rozet (`is_best_price`) ve tedarikçi adı BUNDAN ETKİLENMEZ.
   */
  isTotalMasked: boolean;
}

function totalCost(card: PurchaseQuoteCard): number | null {
  return card.total_cost === null ? null : Number(card.total_cost);
}

/**
 * 119-127 · "Karşılaştırma Özeti". YALNIZ ELDEKİ verilerden türer:
 * kartların `total_cost`u (sunucu türevi) ve talebin `estimated_total`ı
 * (124 "Tahmini Bütçe · Orijinal talep"). Uydurma metrik YOKTUR.
 *
 * "En Yüksek" bir ROZET DEĞİLDİR (sunucuda karşılığı yok), yalnız elde duran
 * kümenin en büyüğüdür — ve küme TAMDIR: `PurchaseQuoteListResponse`
 * sayfalanmaz (şema açıklaması: "Sayfalama eklenseydi ekran 'en iyi fiyat'
 * rozetini eksik bir kume uzerinden hesaplamak zorunda kalirdi").
 */
export function buildQuoteComparison(
  items: readonly PurchaseQuoteCard[],
  estimatedTotal: string | null,
): QuoteComparison {
  const best = bestPriceQuotes(items);
  const lowest = best[0] ?? null;
  const isTotalMasked = items.some((item) => item.total_cost === null);
  const highest =
    items.length === 0 || isTotalMasked
      ? null
      : items.reduce((max, item) => ((totalCost(item) ?? 0) > (totalCost(max) ?? 0) ? item : max));

  const budget = estimatedTotal === null ? null : Number(estimatedTotal);
  const lowestTotal = lowest === null ? null : totalCost(lowest);
  const differenceToBudget =
    lowestTotal === null || budget === null || !Number.isFinite(budget) ? null : lowestTotal - budget;

  return { lowest, isBestPriceTied: best.length > 1, highest, differenceToBudget, isTotalMasked };
}

/**
 * 45 "Malzeme" — talep BİRDEN ÇOK kalem taşıyabilir (mockup tek kalemlik bir
 * talep çizmiştir). Tek kalemde kalemin adı, çok kalemde kalem SAYISI basılır;
 * kalemlerden bir "ana malzeme" seçmek veri uydurmak olurdu.
 */
export function requestMaterialLabel(lines: readonly PurchaseRequestLineResponse[]): string | null {
  if (lines.length === 0) return null;
  if (lines.length === 1) return lines[0].name;
  return `${lines.length} kalem`;
}

/**
 * 46 "Miktar" — DEĞER `PurchaseQuoteListResponse.request_quantity_total`dır
 * (sunucunun `total_cost` çarpanı; şema: "ekran tutari kendi hesaplamak
 * isterse tabani gormeli"). Birim yalnız TÜM kalemler aynı birimdeyse
 * basılabilir: "15 Ton" ile "500 m" toplandığında ortaya çıkan sayı
 * BİRİMSİZDİR ve ona bir birim yazmak yanlış olurdu.
 */
export function requestQuantityUnit(
  lines: readonly PurchaseRequestLineResponse[],
): string | null {
  const units = new Set(lines.map((line) => line.unit ?? ""));
  if (units.size !== 1) return null;
  const [unit] = [...units];
  return unit.length > 0 ? unit : null;
}
