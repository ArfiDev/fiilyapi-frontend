/**
 * TKL-F3.3 · Teklif listesi test fikstürü (mockup `Teklif - Liste.dc.html` 207-216 satırlarının
 * karşılığı). Test-DIŞI adlıdır; `vitest` İMPORT ETMEZ.
 */
import type { OfferListItem, OfferListResponse, OfferListSummary, OfferStatus } from "./offer-types";

export function makeOffer(overrides: Partial<OfferListItem> & Pick<OfferListItem, "offer_no">): OfferListItem {
  return {
    id: `id-${overrides.offer_no}`,
    created_at: "2026-09-28T09:00:00Z",
    employer_id: "emp-1",
    employer_name: "Kuzey Gayrimenkul A.Ş.",
    title: "Bahçeşehir Konakları 2. Etap",
    scope_summary: null,
    offer_date: "2026-09-28",
    valid_until: "2026-10-28",
    rev_no: 0,
    status: "draft",
    net: "48750000.00",
    gross: "58500000.00",
    unpriced_count: 0,
    ...overrides,
  };
}

export const OFFER_DRAFT = makeOffer({
  offer_no: "TKL-2026-0014",
  scope_summary: "Kaba inşaat · 4 blok, 96 daire",
});
export const OFFER_SENT = makeOffer({
  offer_no: "TKL-2026-0013",
  title: "Ataköy Rezidans B Blok",
  employer_name: "Mavikent Yapı Yatırım",
  rev_no: 2,
  status: "sent",
  offer_date: "2026-09-22",
  valid_until: "2026-10-22",
  net: "31420500.00",
  gross: "37704600.00",
});
export const OFFER_WON = makeOffer({
  offer_no: "TKL-2026-0011",
  title: "Güneşkent Konut C-Blok",
  employer_name: "Güneşkent İnşaat Yatırım",
  status: "won",
  net: "67300000.00",
  gross: "80760000.00",
});
export const OFFER_LOST = makeOffer({
  offer_no: "TKL-2026-0010",
  title: "Kartal Kentsel Dönüşüm 3 Parsel",
  employer_name: "Kartal Dönüşüm Ortaklığı",
  rev_no: 3,
  status: "lost",
  net: "89150000.00",
  gross: "106980000.00",
});
export const OFFER_WITHDRAWN = makeOffer({
  offer_no: "TKL-2026-0009",
  title: "Beylikdüzü Sitesi Mantolama",
  status: "withdrawn",
  net: "6480000.00",
  gross: "7776000.00",
});

export function makeSummary(overrides: Partial<OfferListSummary> = {}): OfferListSummary {
  const row = (status: OfferStatus, count: number, net: string | null) => ({ status, count, net });
  return {
    by_status: [
      row("draft", 2, "58490000.00"),
      row("sent", 3, "50810000.00"),
      row("won", 3, "109800000.00"),
      row("lost", 2, "96630000.00"),
      row("withdrawn", 1, "6480000.00"),
    ],
    expired_count: 2,
    win_rate: "60.00",
    ...overrides,
  };
}

export function makeResponse(items: OfferListItem[], overrides: Partial<OfferListResponse> = {}): OfferListResponse {
  return {
    items,
    total: items.length,
    limit: 200,
    offset: 0,
    summary: makeSummary(),
    ...overrides,
  };
}
