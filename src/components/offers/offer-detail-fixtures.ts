/**
 * TKL-F3.5 · Teklif Detay test fikstürü (mockup `Teklif - Detay.dc.html` TKL-2026-014 karşılığı).
 * Test-DIŞI adlıdır; `vitest` İMPORT ETMEZ.
 */
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";

export const OFFER_ID = "offer-14";

type RevisionSummary = OfferDetailRead["revisions"][number];
type HistoryEvent = OfferDetailRead["history"][number];

export function makeRevisionSummary(
  overrides: Partial<RevisionSummary> & Pick<RevisionSummary, "rev_no">,
): RevisionSummary {
  return {
    created_at: "2026-09-28T09:00:00Z",
    gross: "88778568.00",
    lost_at: null,
    lost_reason: null,
    net: "73982140.00",
    offer_date: "2026-09-28",
    sent_at: null,
    status: "draft",
    unpriced_count: 0,
    unquantified_count: 0,
    updated_at: "2026-09-28T10:30:00Z",
    valid_until: "2026-10-28",
    winning_amount: null,
    withdrawn_at: null,
    won_at: null,
    ...overrides,
  };
}

/** Rev.0 (gönderildi) · Rev.1 (gönderildi) · Rev.2 (taslak, güncel) — mockup'taki üç revizyon. */
export function makeDetail(overrides: Partial<OfferDetailRead> = {}): OfferDetailRead {
  return {
    id: OFFER_ID,
    created_at: "2026-08-28T09:00:00Z",
    updated_at: "2026-09-28T10:30:00Z",
    employer_id: "emp-1",
    employer_name: "Kuzey Gayrimenkul A.Ş.",
    offer_no: "TKL-2026-0014",
    title: "Güneşkent Konut Kompleksi",
    scope_summary: "Kaba inşaat · 4 blok, 96 daire",
    prepared_by_name: "Selin Aksoy",
    prepared_by_user_id: "user-1",
    latest_rev_no: 2,
    conversion_state: null,
    project_id: null,
    project: null,
    converted_at: null,
    converted_by_name: null,
    template_id: null,
    status: "draft",
    revisions: [
      makeRevisionSummary({
        rev_no: 0,
        status: "sent",
        offer_date: "2026-08-28",
        valid_until: "2026-09-27",
        sent_at: "2026-08-28T12:00:00Z",
        net: "69410500.00",
        gross: "83292600.00",
      }),
      makeRevisionSummary({
        rev_no: 1,
        status: "sent",
        offer_date: "2026-09-12",
        valid_until: "2026-10-12",
        sent_at: "2026-09-12T12:00:00Z",
        net: "73982140.00",
        gross: "88778568.00",
      }),
      makeRevisionSummary({ rev_no: 2, status: "draft", unpriced_count: 2 }),
    ],
    history: [
      { at: "2026-08-28T09:00:00Z", kind: "opened", rev_no: 0, user_id: "user-2", user_name: "Ahmet Yılmaz" },
      { at: "2026-08-28T12:00:00Z", kind: "sent", rev_no: 0, user_id: "user-2", user_name: "Ahmet Yılmaz" },
      { at: "2026-09-12T09:00:00Z", kind: "opened", rev_no: 1, user_id: "user-1", user_name: "Selin Aksoy" },
      { at: "2026-09-12T12:00:00Z", kind: "sent", rev_no: 1, user_id: "user-1", user_name: "Selin Aksoy" },
      { at: "2026-09-28T09:00:00Z", kind: "opened", rev_no: 2, user_id: "user-1", user_name: "Selin Aksoy" },
    ] satisfies HistoryEvent[],
    ...overrides,
  };
}

export function makeRevision(
  overrides: Partial<OfferRevisionRead> & Pick<OfferRevisionRead, "rev_no">,
): OfferRevisionRead {
  const isLatestDraft = overrides.rev_no === 2;
  return {
    created_at: "2026-09-28T09:00:00Z",
    updated_at: "2026-09-28T10:30:00Z",
    offer_id: OFFER_ID,
    offer_no: "TKL-2026-0014",
    status: isLatestDraft ? "draft" : "sent",
    is_latest: isLatestDraft,
    is_editable: isLatestDraft,
    offer_date: "2026-09-28",
    validity_days: 30,
    valid_until: "2026-10-28",
    overhead_pct: "12.00",
    profit_pct: "15.00",
    vat_pct: "20.00",
    payment_terms: "Aylık hakediş, 30 gün vadeli",
    delivery_days: 420,
    price_escalation: "fixed",
    price_index_type: null,
    notes: "Şantiye elektrik ve su aboneliği işverene aittir.",
    sent_at: null,
    lost_at: null,
    lost_reason: null,
    winning_amount: null,
    withdrawn_at: null,
    won_at: null,
    groups: [],
    totals: {
      unpriced_count: 2,
      unquantified_count: 0,
      customer: { net: "73982140.00", vat: "14796428.00", gross: "88778568.00" },
      internal: {
        cost: "50000000.00",
        overhead: "6000000.00",
        profit: "8400000.00",
        profit_pct: "15.00",
        man_hours: "12840",
      },
    },
    ...overrides,
  };
}
