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
  /** Şablondan oluşturulduysa şablon kimliği; şablon silinince NULL, `copy_from`da MİRAS ALINMAZ (SO-23). */
  templateId: string | null;
  /** TKL-F5.1 · dönüştürülmüşse yeni projenin kimliği (`offers.project_id`); `conversion_state` buradan TÜRER. */
  projectId: string | null;
  /** TKL-F5.1 · dönüştürme anı (`offers.converted_at`). */
  convertedAt: string | null;
  /** TKL-B6.8 · dönüştürenin kimliği (`offers.converted_by_user_id`); okumada ad `users`tan çözülür (silinmişse `null`). */
  convertedByUserId: string | null;
  /** TKL-B6.8 · oluşan projenin kısa künyesi (`OfferProjectRef`; `project_id` ile birlikte yazılır). */
  project: { id: string; code: string; name: string; slug: string | null } | null;
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
  /** `null` = miktar girilmedi (SO-21). */
  quantity: string | null;
  unitMhr: string;
  costUnitPrice: string | null;
  overheadPct: string | null;
  profitPct: string | null;
  offerUnitPrice: string | null;
}

/** Şablon kalemi: yalnız katalog bağı (fiyat/miktar/a-s YOK, T12); sıra = dizin. */
export interface TemplateItemRec {
  id: string;
  catalogItemId: string;
}

/** Şablon grubu; `items` sırası = `sort_order`. */
export interface TemplateGroupRec {
  id: string;
  name: string;
  items: TemplateItemRec[];
}

export interface TemplateRec {
  id: string;
  name: string;
  description: string | null;
  /** DB `Numeric(5,2)` ölçeğinde metin ya da `null` (= ayardan). */
  overheadPct: string | null;
  profitPct: string | null;
  isDefault: boolean;
  createdAt: string;
  /** İyimser kilit değeri: MİKRO saniye (6 hane) — her yazma bir öncekinden KESİN büyük. */
  updatedAt: string;
  groups: TemplateGroupRec[];
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
  /** TKL-F4 · teklif şablonları (`mock-offer-templates.ts`). */
  templates: TemplateRec[];
  users: MockUser[];
  /** Kimlik üretici sayacı (belirleyici UUID'ler). */
  idSeq: Record<IdKind, number>;
  /** "Şimdi" — testte sabitlenir (yıl başı / gün sınırı). */
  clock: () => Date;
}

export type IdKind = "offer" | "revision" | "group" | "item" | "template" | "templateGroup" | "templateItem";

const ID_PREFIX: Record<IdKind, string> = {
  offer: "0ff10000",
  revision: "0ff20000",
  group: "0ff30000",
  item: "0ff40000",
  template: "0ff50000",
  templateGroup: "0ff60000",
  templateItem: "0ff70000",
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
    templates: [],
    users,
    idSeq: { offer: 0, revision: 0, group: 0, item: 0, template: 0, templateGroup: 0, templateItem: 0 },
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

// ------------------------------------------------------------------------- dönüştürme portu (TKL-F5.1)

/** Dönüştürmenin ana sahte duruma yazacağı kalem (sözleşme kalemi); sıra = gövde sırası (T15). */
export interface ConvertedItemSpec {
  catalogItemId: string;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

export interface ConvertedGroupSpec {
  name: string;
  items: ConvertedItemSpec[];
}

/** Doğrulanmış + normalize edilmiş dönüştürme isteği (yazma kararı port tarafında). */
export interface ConvertedProjectSpec {
  offerNo: string;
  employerId: string;
  employerName: string;
  project: {
    /** TKL-B6.8 · elle verilen proje kodu (strip); `null` = sunucu `PRJ-YYYY-NNN` üretir. */
    code: string | null;
    name: string;
    city: string;
    startDate: string;
    endDate: string;
    category: string | null;
    parcel: string | null;
    address: string | null;
  };
  contract: {
    contractNo: string;
    signatureDate: string;
    /** Σ ROUND_HALF_UP(miktar × B.F., 0,01) ya da gövdedeki `amount` (kuruş ölçeğinde). */
    amount: string;
    vatPct: string;
    advancePct: string;
    retainagePct: string;
    latePenaltyDaily: string | null;
    hasPriceEscalation: boolean;
    indexType: string | null;
    baseIndexValue: string | null;
  };
  groups: ConvertedGroupSpec[];
  /** `open_site` ise açılacak şantiye adı (yoksa proje adı); aksi `null`. Kalemler TAM miktarla dağıtılır (S-D2). */
  site: { name: string } | null;
}

export interface ConvertedProjectResult {
  projectId: string;
  projectSlug: string | null;
  projectCode: string;
  siteId: string | null;
}

export interface ConvertPort {
  /** Disiplin varlığı (`group_disciplines` değerleri; yoksa 404 "Disiplin bulunamadı"). */
  disciplineExists: (disciplineId: string) => boolean;
  /** Katalog kaleminin disiplini (karışık disiplinli grup uyarısı için); bilinmiyorsa `null`. */
  disciplineOfCatalog: (catalogItemId: string) => string | null;
  /** TKL-B6.8 · `projects.code` benzersiz: elle verilen kod başka projede var mı (409 "Bu proje kodu zaten kullanılıyor"). */
  projectCodeExists: (code: string) => boolean;
  /** Proje + sözleşme + kalemler (+ şantiye + tam dağıtım) yazar; kimlikleri döner. EV taslağı YAZILMAZ. */
  createConvertedProject: (spec: ConvertedProjectSpec) => ConvertedProjectResult;
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
  /** TKL-F5.1 · dönüştürme yazma portu; yoksa `/offers/{id}/convert` bu harness'ta DESTEKLENMEZ (404). */
  convert?: ConvertPort;
}
