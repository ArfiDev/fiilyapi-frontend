// TKL-F3.2 · sahte backend teklif durumu — kayıt tipleri + durum fabrikası (saf, DB yok).
//
// Backend `app/modules/offers/models.py`nin bellek ikizi. Ondalıklar DB `Numeric` ÖLÇEĞİNDE
// metin olarak saklanır (yüzde 2 · para 2 · miktar 3 · adam-saat 4) — yanıt GET ile aynı biçimde
// çıksın diye (backend R3: "yazma yanıtı okuma yolunun göreceği Numeric ölçekli değerlerle AYNI").
// Para/miktar `Number()`a ASLA çevrilmez.

export type OfferStatus = "draft" | "sent" | "won" | "lost" | "withdrawn";
export type PriceEscalation = "tuik" | "fixed";

export const OFFER_STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost", "withdrawn"];

export interface OfferRec {
  id: string;
  offerNo: string;
  employerId: string;
  /** İşveren adı ANLIK GÖRÜNTÜ (işveren sonradan yeniden adlanırsa teklifte eski ad kalır). */
  employerName: string;
  title: string;
  scopeSummary: string | null;
  preparedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionRec {
  id: string;
  offerId: string;
  revNo: number;
  status: OfferStatus;
  offerDate: string;
  validityDays: number;
  overheadPct: string;
  profitPct: string;
  vatPct: string;
  paymentTerms: string | null;
  deliveryDays: number | null;
  priceEscalation: PriceEscalation;
  priceIndexType: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  withdrawnAt: string | null;
  lostReason: string | null;
  winningAmount: string | null;
  createdBy: string | null;
  sentBy: string | null;
  wonBy: string | null;
  lostBy: string | null;
  withdrawnBy: string | null;
}

export interface GroupRec {
  id: string;
  revisionId: string;
  name: string;
  sortOrder: number;
}

export interface ItemRec {
  id: string;
  revisionId: string;
  groupId: string;
  sortOrder: number;
  catalogItemId: string;
  pozNo: string;
  description: string;
  unit: string;
  quantity: string;
  unitMhr: string;
  costUnitPrice: string | null;
  overheadPct: string | null;
  profitPct: string | null;
  offerUnitPrice: string | null;
}

export interface OfferSettingsRec {
  defaultOverheadPct: string;
  defaultProfitPct: string;
  defaultVatPct: string;
  defaultValidityDays: number;
  defaultPaymentTerms: string;
  updatedAt: string;
}

export interface MockUser {
  id: string;
  fullName: string;
}

export interface OffersState {
  offers: OfferRec[];
  revisions: RevisionRec[];
  groups: GroupRec[];
  items: ItemRec[];
  /** Yıl → DAĞITILAN son sıra. MONOTONDUR: silme sayacı geri almaz (numara tekrar kullanılmaz). */
  counters: Record<number, number>;
  settings: OfferSettingsRec;
  users: MockUser[];
  /** Kimlik üretici sayacı (belirleyici UUID'ler). */
  idSeq: Record<IdKind, number>;
  /** "Şimdi" — testte sabitlenir (yıl başı / gün sınırı). */
  clock: () => Date;
}

export type IdKind = "offer" | "revision" | "group" | "item";

const ID_PREFIX: Record<IdKind, string> = {
  offer: "0ff10000",
  revision: "0ff20000",
  group: "0ff30000",
  item: "0ff40000",
};

/** Belirleyici, geçerli bir UUID (v4 biçimli): `0ff1…-0000-4000-8000-000000000001`. */
export function nextId(state: OffersState, kind: IdKind): string {
  const next = state.idSeq[kind] + 1;
  state.idSeq[kind] = next;
  return `${ID_PREFIX[kind]}-0000-4000-8000-${next.toString(16).padStart(12, "0")}`;
}

export const DEFAULT_OFFER_SETTINGS: Omit<OfferSettingsRec, "updatedAt"> = {
  defaultOverheadPct: "12.00",
  defaultProfitPct: "15.00",
  defaultVatPct: "20.00",
  defaultValidityDays: 30,
  defaultPaymentTerms: "Ödeme aylık hakedişle, 30 gün vadeli",
};

export function emptyOffersState(users: MockUser[], clock: () => Date = () => new Date()): OffersState {
  return {
    offers: [],
    revisions: [],
    groups: [],
    items: [],
    counters: {},
    settings: { ...DEFAULT_OFFER_SETTINGS, updatedAt: "2026-01-01T09:00:00.000Z" },
    users,
    idSeq: { offer: 0, revision: 0, group: 0, item: 0 },
    clock,
  };
}

// ------------------------------------------------------------------------------- takvim

/** İstanbul takvim günü (`YYYY-MM-DD`) — backend `app.core.timezone.today()` (SO-7). */
export function istanbulDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function istanbulYear(at: Date): number {
  return parseInt(istanbulDate(at).slice(0, 4), 10);
}

/** `offer_date + validity_days` (UTC gün aritmetiği; tavan `9999-12-31`). */
export function addDays(isoDate: string, days: number): string {
  const result = new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000);
  return result.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------------------ port (mock-backend ↔ teklif)

/** Katalog kalemi — yalnız teklifin kopyaladığı/önerdiği alanlar. */
export interface OfferCatalogEntry {
  id: string;
  pozNo: string;
  name: string;
  uom: string;
  standardUnitMhr: string;
  refPrice: string | null;
}

export interface OffersPort {
  method: string;
  path: string;
  query: URLSearchParams;
  send: (status: number, body?: unknown) => void;
  /** JSON gövdesini okur (boş gövde = `{}`); geçersiz JSON'a 422'yi KENDİ basar. */
  readBody: (handler: (body: Record<string, unknown>) => void) => void;
  catalog: () => readonly OfferCatalogEntry[];
  employers: () => ReadonlyArray<{ id: string; name: string }>;
  /** Şirket geneli katalog son fiyatı (HK / SZL / TKL birleşik) — SO-6 önerisi buradan. */
  lastPrices: () => ReadonlyMap<string, { price: string }>;
  actor: MockUser;
}
