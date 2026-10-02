// TKL-F3.2 · sahte backend teklif OKUMA yanıtları — `offer_views.py` + `offer_queries.py` ikizi.
//
// Hesap TEK yerdedir: `calcItem/calcRevision` (`mock-offer-calc.ts`, calc.py aynası). Burası yalnız
// sonucu yanıt şemasına eşler. Yanıt tipleri openapi'den (`components["schemas"]`) bağlıdır —
// `mock-backend-return-types.contract.test.ts` tipsiz üreticiyi kırmızıya çevirir.
//
// ⚠️ KAPSAM/PARA MASKESİ TAKLİT EDİLMEZ: backend `limited` rolde para alanlarını `null` yapar ve
// disiplin kısıtlı kullanıcıya TÜM `/offers*` uçlarında 403 verir (SO-19). Mock'ta rol/izin
// mekanizması YOKTUR (ekran testleri `/api/auth/me` yanıtını değiştirir) — uydurma tetikleyici,
// gerçek kapıyı TEMSİL ETMEYEN bir onay üretirdi.
import type { components } from "@/lib/api/schema";

import {
  addDecimal,
  calcItem,
  calcRevision,
  compareDecimal,
  percentOfIntegers,
  type ItemInput,
  type ItemResult,
  type RevisionResult,
} from "./mock-offer-calc";
import {
  OFFER_STATUSES,
  addDays,
  istanbulDate,
  type GroupRec,
  type ItemRec,
  type OfferRec,
  type OffersState,
  type OfferStatus,
  type RevisionRec,
} from "./mock-offer-types";

type S = components["schemas"];

export const itemInput = (item: ItemRec): ItemInput => ({
  quantity: item.quantity,
  unit_mhr: item.unitMhr,
  cost_unit_price: item.costUnitPrice,
  overhead_pct: item.overheadPct,
  profit_pct: item.profitPct,
  offer_unit_price: item.offerUnitPrice,
});

export function validUntil(revision: RevisionRec): string {
  return addDays(revision.offerDate, revision.validityDays);
}

/** Gruplar (sıra, ad, id) → kalemler (sıra, poz no, id): backend `sort_groups/sort_items`. */
export function orderedContent(
  state: OffersState,
  revision: RevisionRec,
): { groups: GroupRec[]; byGroup: Map<string, ItemRec[]>; flat: ItemRec[] } {
  const groups = state.groups
    .filter((group) => group.revisionId === revision.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || cmpText(a.name, b.name) || cmpText(a.id, b.id));
  const byGroup = new Map<string, ItemRec[]>(groups.map((group) => [group.id, []]));
  const items = state.items
    .filter((item) => item.revisionId === revision.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || cmpText(a.pozNo, b.pozNo) || cmpText(a.id, b.id));
  for (const item of items) byGroup.get(item.groupId)?.push(item);
  return { groups, byGroup, flat: groups.flatMap((group) => byGroup.get(group.id) ?? []) };
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function revisionResult(state: OffersState, revision: RevisionRec): RevisionResult {
  const items = state.items.filter((item) => item.revisionId === revision.id);
  return calcRevision(items.map(itemInput), {
    overhead_pct: revision.overheadPct,
    profit_pct: revision.profitPct,
    vat_pct: revision.vatPct,
  });
}

function buildItemRead(item: ItemRec, result: ItemResult): S["OfferItemRead"] {
  return {
    id: item.id,
    group_id: item.groupId,
    sort_order: item.sortOrder,
    catalog_item_id: item.catalogItemId,
    poz_no: item.pozNo,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unit_mhr: item.unitMhr,
    cost_unit_price: item.costUnitPrice,
    overhead_pct: item.overheadPct,
    profit_pct: item.profitPct,
    offer_unit_price: item.offerUnitPrice,
    priced: result.priced,
    // Backend `calc.py`: `quantified = item.quantity is not None` (kimlik kovası; mock maske taklit etmez).
    quantified: item.quantity !== null,
    customer: result.customer,
    internal: result.internal,
  };
}

/** Tek kalemin okuması (revizyon yüzdeleriyle hesaplanır). */
export function readItem(item: ItemRec, revision: RevisionRec): S["OfferItemRead"] {
  const result = calcItem(itemInput(item), {
    overhead_pct: revision.overheadPct,
    profit_pct: revision.profitPct,
  });
  return buildItemRead(item, result);
}

export function latestRevision(state: OffersState, offerId: string): RevisionRec {
  const revisions = state.revisions.filter((revision) => revision.offerId === offerId);
  return revisions.reduce((top, revision) => (revision.revNo > top.revNo ? revision : top));
}

export function readRevision(state: OffersState, offer: OfferRec, revision: RevisionRec): S["OfferRevisionRead"] {
  const content = orderedContent(state, revision);
  // Kalem sonuçları GRUP sırasıyla hesaplanır (toplamlar sıradan bağımsızdır).
  const ordered = calcRevision(content.flat.map(itemInput), {
    overhead_pct: revision.overheadPct,
    profit_pct: revision.profitPct,
    vat_pct: revision.vatPct,
  });
  const readById = new Map(content.flat.map((item, index) => [item.id, buildItemRead(item, ordered.items[index] as ItemResult)] as const));
  const isLatest = latestRevision(state, offer.id).revNo === revision.revNo;
  return {
    offer_id: offer.id,
    offer_no: offer.offerNo,
    rev_no: revision.revNo,
    status: revision.status,
    is_latest: isLatest,
    is_editable: isLatest && revision.status === "draft",
    offer_date: revision.offerDate,
    validity_days: revision.validityDays,
    valid_until: validUntil(revision),
    overhead_pct: revision.overheadPct,
    profit_pct: revision.profitPct,
    vat_pct: revision.vatPct,
    payment_terms: revision.paymentTerms,
    delivery_days: revision.deliveryDays,
    price_escalation: revision.priceEscalation,
    price_index_type: revision.priceIndexType as S["OfferRevisionRead"]["price_index_type"],
    notes: revision.notes,
    sent_at: revision.sentAt,
    won_at: revision.wonAt,
    lost_at: revision.lostAt,
    withdrawn_at: revision.withdrawnAt,
    lost_reason: revision.lostReason,
    winning_amount: revision.winningAmount,
    created_at: revision.createdAt,
    updated_at: revision.updatedAt,
    groups: content.groups.map((group) => ({
      id: group.id,
      name: group.name,
      sort_order: group.sortOrder,
      items: (content.byGroup.get(group.id) ?? []).map((item) => readById.get(item.id) as S["OfferItemRead"]),
    })),
    totals: {
      customer: ordered.customer,
      internal: ordered.internal,
      unpriced_count: ordered.unpriced_count,
      unquantified_count: ordered.unquantified_count,
    },
  };
}

// ----------------------------------------------------------------------------------- detay

type HistoryKind = S["OfferHistoryEventRead"]["kind"];
const KIND_RANK: Record<HistoryKind, number> = { opened: 0, sent: 1, won: 2, lost: 2, withdrawn: 2 };

function userName(state: OffersState, id: string | null): string | null {
  if (id === null) return null;
  return state.users.find((user) => user.id === id)?.fullName ?? null;
}

function historyOf(state: OffersState, revisions: readonly RevisionRec[]): S["OfferHistoryEventRead"][] {
  const events: S["OfferHistoryEventRead"][] = [];
  for (const rev of revisions) {
    const stamps: Array<[HistoryKind, string | null, string | null]> = [
      ["opened", rev.createdAt, rev.createdBy],
      ["sent", rev.sentAt, rev.sentBy],
      ["won", rev.wonAt, rev.wonBy],
      ["lost", rev.lostAt, rev.lostBy],
      ["withdrawn", rev.withdrawnAt, rev.withdrawnBy],
    ];
    for (const [kind, at, user] of stamps) {
      if (at === null) continue;
      events.push({ at, kind, rev_no: rev.revNo, user_id: user, user_name: userName(state, user) });
    }
  }
  return events.sort(
    (a, b) => cmpText(a.at, b.at) || a.rev_no - b.rev_no || KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
}

export function readOfferDetail(state: OffersState, offer: OfferRec): S["OfferDetailRead"] {
  const revisions = state.revisions.filter((rev) => rev.offerId === offer.id).sort((a, b) => a.revNo - b.revNo);
  const last = revisions[revisions.length - 1] as RevisionRec;
  return {
    id: offer.id,
    offer_no: offer.offerNo,
    employer_id: offer.employerId,
    employer_name: offer.employerName,
    title: offer.title,
    scope_summary: offer.scopeSummary,
    prepared_by_user_id: offer.preparedByUserId,
    prepared_by_name: userName(state, offer.preparedByUserId),
    status: last.status,
    latest_rev_no: last.revNo,
    template_id: offer.templateId,
    conversion_state: null,
    project_id: null,
    created_at: offer.createdAt,
    updated_at: offer.updatedAt,
    revisions: revisions.map((rev) => {
      const result = revisionResult(state, rev);
      return {
        rev_no: rev.revNo,
        status: rev.status,
        offer_date: rev.offerDate,
        valid_until: validUntil(rev),
        created_at: rev.createdAt,
        updated_at: rev.updatedAt,
        sent_at: rev.sentAt,
        won_at: rev.wonAt,
        lost_at: rev.lostAt,
        withdrawn_at: rev.withdrawnAt,
        lost_reason: rev.lostReason,
        winning_amount: rev.winningAmount,
        net: result.customer.net,
        gross: result.customer.gross,
        unpriced_count: result.unpriced_count,
        unquantified_count: result.unquantified_count,
      };
    }),
    history: historyOf(state, revisions),
  };
}

// ----------------------------------------------------------------------------------- liste

export interface OfferListFilters {
  status: OfferStatus | null;
  q: string | null;
  employerId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
  offset: number;
}

/** `TKL-2026-0014` → [2026, 14]: SAYISAL sıra (metne göre 9999 sonrası bozulurdu). */
function offerNoKey(offerNo: string): [number, number] {
  const [, year = "0", seq = "0"] = offerNo.split("-");
  return [parseInt(year, 10), parseInt(seq, 10)];
}

export function listOffers(state: OffersState, filters: OfferListFilters): S["OfferListResponse"] {
  const needle = filters.q === null ? "" : filters.q.trim().toLowerCase();
  const entries = state.offers
    .map((offer) => ({ offer, revision: latestRevision(state, offer.id) }))
    .filter(({ offer, revision }) => {
      if (filters.employerId !== null && offer.employerId !== filters.employerId) return false;
      if (filters.dateFrom !== null && revision.offerDate < filters.dateFrom) return false;
      if (filters.dateTo !== null && revision.offerDate > filters.dateTo) return false;
      if (needle === "") return true;
      return [offer.offerNo, offer.title, offer.employerName].some((text) => text.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      const [ay, as] = offerNoKey(a.offer.offerNo);
      const [by, bs] = offerNoKey(b.offer.offerNo);
      return by - ay || bs - as;
    })
    .map((entry) => ({ ...entry, result: revisionResult(state, entry.revision) }));

  const counts = new Map<OfferStatus, number>(OFFER_STATUSES.map((status) => [status, 0]));
  const nets = new Map<OfferStatus, string>(OFFER_STATUSES.map((status) => [status, "0"]));
  for (const { revision, result } of entries) {
    counts.set(revision.status, (counts.get(revision.status) ?? 0) + 1);
    nets.set(revision.status, addDecimal(nets.get(revision.status) ?? "0", result.customer.net));
  }
  const today = istanbulDate(state.clock());
  const expired = entries.filter(
    ({ revision }) => revision.status === "sent" && validUntil(revision) < today,
  ).length;
  const won = counts.get("won") ?? 0;
  const decided = won + (counts.get("lost") ?? 0);
  const shown = entries.filter(({ revision }) => filters.status === null || revision.status === filters.status);
  return {
    items: shown.slice(filters.offset, filters.offset + filters.limit).map(({ offer, revision, result }) => ({
      id: offer.id,
      offer_no: offer.offerNo,
      rev_no: revision.revNo,
      title: offer.title,
      employer_id: offer.employerId,
      employer_name: offer.employerName,
      scope_summary: offer.scopeSummary,
      offer_date: revision.offerDate,
      valid_until: validUntil(revision),
      status: revision.status,
      net: result.customer.net,
      gross: result.customer.gross,
      unpriced_count: result.unpriced_count,
      unquantified_count: result.unquantified_count,
      conversion_state: null,
      project_id: null,
      created_at: offer.createdAt,
    })),
    total: shown.length,
    limit: filters.limit,
    offset: filters.offset,
    summary: {
      by_status: OFFER_STATUSES.map((status) => ({
        status,
        count: counts.get(status) ?? 0,
        net: nets.get(status) ?? "0",
      })),
      expired_count: expired,
      won_not_converted_count: 0,
      win_rate: decided === 0 ? null : percentOfIntegers(won, decided),
    },
  };
}

// ------------------------------------------------------------- TKL katalog son fiyat kaynağı

export interface TklLastPrice {
  price: string;
  at: string;
  docNo: string;
  docId: string;
}

/**
 * Backend `offers/last_price_provider.py` ikizi (T29/T33, SO-16/SO-18):
 *  · kaynak YALNIZ `won` revizyonların `cost_unit_price` DOLU kalemleridir (taslak/gönderilmiş/
 *    kaybedilmiş/vazgeçilmiş kaynak OLMAZ); fiyat = MALİYET B.F. (teklif B.F. DEĞİL);
 *  · aynı revizyonda aynı katalog kalemine bağlı birden çok kalem → EN YÜKSEK maliyet;
 *  · revizyonlar arası: en yeni `won_at`; eşitlikte küçük teklif no, sonra küçük rev no, sonra
 *    küçük teklif id kazanır;
 *  · etiket `"{offer_no} Rev.{rev_no}"`, belge id = TEKLİF id.
 */
export function tklLastPrices(state: OffersState): Map<string, TklLastPrice> {
  const best = new Map<string, TklLastPrice & { offerNo: string; revNo: number }>();
  for (const revision of state.revisions) {
    if (revision.status !== "won" || revision.wonAt === null) continue;
    const offer = state.offers.find((entry) => entry.id === revision.offerId);
    if (offer === undefined) continue;
    const perCatalog = new Map<string, string>();
    for (const item of state.items) {
      if (item.revisionId !== revision.id || item.costUnitPrice === null) continue;
      const current = perCatalog.get(item.catalogItemId);
      if (current === undefined || compareDecimal(item.costUnitPrice, current) > 0) {
        perCatalog.set(item.catalogItemId, item.costUnitPrice);
      }
    }
    for (const [catalogId, price] of perCatalog) {
      const candidate = {
        price,
        at: revision.wonAt,
        docNo: `${offer.offerNo} Rev.${revision.revNo}`,
        docId: offer.id,
        offerNo: offer.offerNo,
        revNo: revision.revNo,
      };
      const current = best.get(catalogId);
      const wins =
        current === undefined ||
        Date.parse(candidate.at) > Date.parse(current.at) ||
        (Date.parse(candidate.at) === Date.parse(current.at) &&
          (candidate.offerNo < current.offerNo ||
            (candidate.offerNo === current.offerNo &&
              (candidate.revNo < current.revNo ||
                (candidate.revNo === current.revNo && candidate.docId < current.docId)))));
      if (wins) best.set(catalogId, candidate);
    }
  }
  return new Map(
    Array.from(best, ([catalogId, row]) => [catalogId, { price: row.price, at: row.at, docNo: row.docNo, docId: row.docId }] as const),
  );
}
