// TKL-F3.2 · sahte backend teklif SERVİSİ — backend `offer_service.py` + `item_service.py` + `locking.py`
// ikizi (origin/tkl-b4-teklif-cekirdegi 3efb5e1). Davranış listesi ve gerekçeler `mock-offers.ts`
// başlığındadır; burası kuralların KENDİSİDİR: kilit/çözüm, durum makinesi, hep-ya-hiç toplu ekleme,
// SO-4/SO-6, kopya revizyon, silme. Yönlendirme `handleOffers`tedir.
import type { components } from "@/lib/api/schema";

import { ManualPriceWithoutCostError, calcItem, quantizeDecimal, suggestCost } from "./mock-offer-calc";
import { offerImmutableItemFields } from "./mock-offer-body";
import { assertSourceRules, conditionDefaults, lockSources, seedRevisionContent } from "./mock-offer-create-sources";
import { OFFER_MESSAGES, Failure, fail, invalid, pathViolation, rejectNull, uuidParam, validate } from "./mock-offer-guards";
import {
  OFFER_STATUSES,
  istanbulDate,
  istanbulYear,
  nextId,
  type GroupRec,
  type ItemRec,
  type OfferCatalogEntry,
  type OfferRec,
  type OffersPort,
  type OffersState,
  type OfferStatus,
  type PriceEscalation,
  type RevisionRec,
} from "./mock-offer-types";
import { itemInput, latestRevision, type OfferListFilters } from "./mock-offer-views";

type S = components["schemas"];

// Ortak hata/doğrulama yardımcıları `mock-offer-guards.ts`te (TKL-F4.4); `mock-offers.ts` buradan okumaya devam eder.
export { OFFER_MESSAGES, Failure, fail, invalid, rejectNull, uuidParam, validate };

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "taslak",
  sent: "gönderilmiş",
  won: "kazanılmış",
  lost: "kaybedilmiş",
  withdrawn: "vazgeçilmiş",
};

export type OfferAction = "send" | "win" | "lose" | "withdraw";

/** Eylem → [izinli kaynak durumlar, hedef durum] (`offer_service.TRANSITIONS`). */
const TRANSITIONS: Record<OfferAction, readonly [readonly OfferStatus[], OfferStatus]> = {
  send: [["draft"], "sent"],
  win: [["sent"], "won"],
  lose: [["sent"], "lost"],
  withdraw: [["draft", "sent"], "withdrawn"],
};

// ------------------------------------------------------------------------------------- yardımcı

const MIN_OFFER_DATE = "2000-01-01";
const MAX_OFFER_DATE = "2999-12-31";
const MAX_REV_NO = 100_000;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const text = (value: unknown): string => (typeof value === "string" ? value : String(value));
const nullable = (value: unknown, places: number): string | null =>
  value === null || value === undefined ? null : quantizeDecimal(text(value), places);
const whole = (value: unknown): number => parseInt(text(value), 10);
const nowIso = (state: OffersState): string => state.clock().toISOString();

export function revParam(value: string): number {
  if (!/^[+-]?\d+$/.test(value)) {
    throw pathViolation("rev_no", value, "int_parsing", "Input should be a valid integer, unable to parse string as an integer");
  }
  const parsed = parseInt(value, 10);
  if (parsed < 0) throw pathViolation("rev_no", value, "greater_than_equal", "Input should be greater than or equal to 0");
  if (parsed > MAX_REV_NO) throw pathViolation("rev_no", value, "less_than_equal", `Input should be less than or equal to ${MAX_REV_NO}`);
  return parsed;
}

function findEmployer(port: OffersPort, id: unknown): { id: string; name: string } | undefined {
  const wanted = text(id).toLowerCase();
  return port.employers().find((entry) => entry.id.toLowerCase() === wanted);
}

function checkEscalation(escalation: PriceEscalation, indexType: unknown): void {
  const hasIndex = indexType !== null && indexType !== undefined;
  if (escalation === "tuik" && !hasIndex) throw fail(422, OFFER_MESSAGES.indexRequired);
  if (escalation === "fixed" && hasIndex) throw fail(422, OFFER_MESSAGES.indexNotAllowed);
}

function checkOfferDate(value: unknown): void {
  const date = text(value);
  if (date < MIN_OFFER_DATE) {
    throw invalid({ detail: [{ type: "greater_than_equal", loc: ["body", "offer_date"], msg: `Input should be greater than or equal to ${MIN_OFFER_DATE}`, input: value }] });
  }
  if (date > MAX_OFFER_DATE) {
    throw invalid({ detail: [{ type: "less_than_equal", loc: ["body", "offer_date"], msg: `Input should be less than or equal to ${MAX_OFFER_DATE}`, input: value }] });
  }
}

// ----------------------------------------------------------------- durum yazıcıları (immutable)

function patchOffer(state: OffersState, id: string, patch: Partial<OfferRec>): OfferRec {
  const next = { ...(state.offers.find((offer) => offer.id === id) as OfferRec), ...patch };
  state.offers = state.offers.map((offer) => (offer.id === id ? next : offer));
  return next;
}

function patchRevision(state: OffersState, id: string, patch: Partial<RevisionRec>): RevisionRec {
  const next = { ...(state.revisions.find((revision) => revision.id === id) as RevisionRec), ...patch };
  state.revisions = state.revisions.map((revision) => (revision.id === id ? next : revision));
  return next;
}

/** Son KAYIT zamanı: koşul/grup/kalem yazımı + geçiş ilerletir (OKUMA ilerletmez). */
function touchRevision(state: OffersState, id: string): RevisionRec {
  return patchRevision(state, id, { updatedAt: nowIso(state) });
}

// ------------------------------------------------------------------------------ kilit + çözüm

export function findOffer(state: OffersState, offerId: string): OfferRec {
  const offer = state.offers.find((entry) => entry.id === offerId);
  if (offer === undefined) throw fail(404, OFFER_MESSAGES.offerMissing);
  return offer;
}

/** `locking.lock_latest_revision`: teklif yoksa 404; `revNo` verilmişse yoksa 404, son değilse 409. */
function lockLatest(state: OffersState, offerId: string, revNo?: number): { offer: OfferRec; revision: RevisionRec } {
  const offer = findOffer(state, offerId);
  const revision = latestRevision(state, offerId);
  if (revNo !== undefined && revNo !== revision.revNo) {
    if (revNo < 0 || revNo > revision.revNo) throw fail(404, OFFER_MESSAGES.revisionMissing);
    throw fail(409, OFFER_MESSAGES.notLatest);
  }
  return { offer, revision };
}

function lockDraft(state: OffersState, offerId: string, revNo?: number): { offer: OfferRec; revision: RevisionRec } {
  const locked = lockLatest(state, offerId, revNo);
  if (locked.revision.status !== "draft") throw fail(409, OFFER_MESSAGES.notDraft);
  return locked;
}

// ------------------------------------------------------------------------------------- ayarlar

export function settingsRead(state: OffersState): S["OfferSettingsRead"] {
  const s = state.settings;
  return {
    default_overhead_pct: s.defaultOverheadPct,
    default_profit_pct: s.defaultProfitPct,
    default_vat_pct: s.defaultVatPct,
    default_validity_days: s.defaultValidityDays,
    default_payment_terms: s.defaultPaymentTerms,
    updated_at: s.updatedAt,
  };
}

export function updateSettings(state: OffersState, body: Record<string, unknown>): S["OfferSettingsRead"] {
  validate("OfferSettingsUpdate", body);
  const terms = text(body.default_payment_terms).trim();
  if (terms === "") {
    throw invalid({ detail: [{ type: "value_error", loc: ["body", "default_payment_terms"], msg: `Value error, ${OFFER_MESSAGES.blankPaymentTerms}`, input: body.default_payment_terms, ctx: { error: {} } }] });
  }
  state.settings = {
    defaultOverheadPct: quantizeDecimal(text(body.default_overhead_pct), 2),
    defaultProfitPct: quantizeDecimal(text(body.default_profit_pct), 2),
    defaultVatPct: quantizeDecimal(text(body.default_vat_pct), 2),
    defaultValidityDays: whole(body.default_validity_days),
    defaultPaymentTerms: terms,
    updatedAt: nowIso(state),
  };
  return settingsRead(state);
}

// -------------------------------------------------------------------------------------- teklif

function offerNumber(state: OffersState): string {
  const year = istanbulYear(state.clock());
  const sequence = (state.counters[year] ?? 0) + 1;
  state.counters = { ...state.counters, [year]: sequence };
  return `TKL-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * `POST /offers` (`offer_service.create_offer_with_origin`). Kaynak (en fazla biri): boş | `template_id` | `copy_from`
 * (`mock-offer-create-sources.ts`). Koşul önceliği gövde ?? kaynak ?? ayar; `null` gövde alanı "verilmedi" sayılır
 * (`pick`) — YALNIZ `payment_terms` / `delivery_days` / `notes` / `scope_summary` için açık `null` = boşalt.
 */
export function createOffer(state: OffersState, port: OffersPort, body: Record<string, unknown>): OfferRec {
  validate("OfferCreate", body);
  assertSourceRules(body);
  if (body.offer_date !== null && body.offer_date !== undefined) checkOfferDate(body.offer_date);
  const sources = lockSources(state, body);
  const defaults = conditionDefaults(state, sources);
  const sourceOffer = sources.copy?.offer ?? null;
  const employer = findEmployer(port, body.employer_id ?? sourceOffer?.employerId);
  if (employer === undefined) throw fail(404, OFFER_MESSAGES.employerMissing);
  // Fiyat farkı: `price_escalation` verildiyse gövdenin endeksi (yoksa null); verilmediyse endeks yalnız verilirse gövdeden, yoksa kaynaktan.
  const escalationGiven = Object.hasOwn(body, "price_escalation");
  const escalation = (escalationGiven ? body.price_escalation : defaults.priceEscalation) as PriceEscalation;
  const indexType =
    escalationGiven || Object.hasOwn(body, "price_index_type") ? (body.price_index_type === undefined ? null : (body.price_index_type as string | null)) : defaults.priceIndexType;
  checkEscalation(escalation, indexType);

  // Numara DOĞRULAMALARDAN SONRA harcanır (reddedilen oluşturma numara tüketmez).
  const now = nowIso(state);
  const offerId = nextId(state, "offer");
  const given = (name: string): boolean => body[name] !== null && body[name] !== undefined;
  const explicit = <T,>(name: string, fallback: T, read: (value: unknown) => T): T =>
    Object.hasOwn(body, name) ? (body[name] === null ? (null as T) : read(body[name])) : fallback;
  const offer: OfferRec = {
    id: offerId,
    offerNo: offerNumber(state),
    employerId: employer.id,
    employerName: employer.name,
    title: given("title") ? text(body.title).trim() : (sourceOffer as OfferRec).title,
    scopeSummary: sourceOffer === null ? (given("scope_summary") ? text(body.scope_summary) : null) : explicit("scope_summary", sourceOffer.scopeSummary, text),
    preparedByUserId: port.actor.id,
    templateId: sources.template?.id ?? null, // yalnız şablondan; kopyada MİRAS ALINMAZ (SO-23)
    projectId: null,
    convertedAt: null,
    convertedByUserId: null,
    project: null,
    createdAt: now,
    updatedAt: now,
  };
  const revision: RevisionRec = {
    id: nextId(state, "revision"),
    offerId,
    revNo: 0,
    status: "draft",
    offerDate: given("offer_date") ? text(body.offer_date) : istanbulDate(state.clock()),
    validityDays: given("validity_days") ? whole(body.validity_days) : defaults.validityDays,
    overheadPct: given("overhead_pct") ? quantizeDecimal(text(body.overhead_pct), 2) : defaults.overheadPct,
    profitPct: given("profit_pct") ? quantizeDecimal(text(body.profit_pct), 2) : defaults.profitPct,
    vatPct: given("vat_pct") ? quantizeDecimal(text(body.vat_pct), 2) : defaults.vatPct,
    // Gönderilmezse kaynak/ayar metni; AÇIK null = ödeme koşulu BOŞ.
    paymentTerms: explicit("payment_terms", defaults.paymentTerms, text),
    deliveryDays: explicit("delivery_days", defaults.deliveryDays, whole),
    priceEscalation: escalation,
    priceIndexType: indexType === null ? null : text(indexType),
    notes: explicit("notes", defaults.notes, text),
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    wonAt: null,
    lostAt: null,
    withdrawnAt: null,
    lostReason: null,
    winningAmount: null,
    createdBy: port.actor.id,
    sentBy: null,
    wonBy: null,
    lostBy: null,
    withdrawnBy: null,
  };
  state.offers = [...state.offers, offer];
  state.revisions = [...state.revisions, revision];
  seedRevisionContent(state, port, sources, revision.id);
  return offer;
}

export function updateOffer(state: OffersState, port: OffersPort, offerId: string, body: Record<string, unknown>): OfferRec {
  validate("OfferUpdate", body);
  rejectNull(body, ["employer_id", "title"]);
  const { offer } = lockDraft(state, offerId);
  let employer: { id: string; name: string } | undefined;
  if (Object.hasOwn(body, "employer_id")) {
    employer = findEmployer(port, body.employer_id);
    if (employer === undefined) throw fail(404, OFFER_MESSAGES.employerMissing);
  }
  const patch: Partial<OfferRec> = {};
  if (employer !== undefined && employer.id !== offer.employerId) {
    patch.employerId = employer.id;
    patch.employerName = employer.name;
  }
  if (Object.hasOwn(body, "title") && text(body.title).trim() !== offer.title) patch.title = text(body.title).trim();
  if (Object.hasOwn(body, "scope_summary")) {
    const next = body.scope_summary === null ? null : text(body.scope_summary);
    if (next !== offer.scopeSummary) patch.scopeSummary = next;
  }
  if (Object.keys(patch).length === 0) return offer;
  return patchOffer(state, offerId, { ...patch, updatedAt: nowIso(state) });
}

export function deleteOffer(state: OffersState, offerId: string): void {
  const { offer, revision } = lockLatest(state, offerId);
  const count = state.revisions.filter((entry) => entry.offerId === offerId).length;
  if (count !== 1 || revision.status !== "draft") throw fail(409, OFFER_MESSAGES.deleteNotAllowed);
  const revisionIds = new Set(state.revisions.filter((entry) => entry.offerId === offer.id).map((entry) => entry.id));
  state.offers = state.offers.filter((entry) => entry.id !== offer.id);
  state.revisions = state.revisions.filter((entry) => entry.offerId !== offer.id);
  state.groups = state.groups.filter((entry) => !revisionIds.has(entry.revisionId));
  state.items = state.items.filter((entry) => !revisionIds.has(entry.revisionId));
}

// ----------------------------------------------------------------------------------- revizyon

const REVISION_FIELD: ReadonlyArray<readonly [string, keyof RevisionRec]> = [
  ["offer_date", "offerDate"],
  ["validity_days", "validityDays"],
  ["overhead_pct", "overheadPct"],
  ["profit_pct", "profitPct"],
  ["vat_pct", "vatPct"],
  ["payment_terms", "paymentTerms"],
  ["delivery_days", "deliveryDays"],
  ["price_escalation", "priceEscalation"],
  ["price_index_type", "priceIndexType"],
  ["notes", "notes"],
];

function revisionValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (field.endsWith("_pct")) return quantizeDecimal(text(value), 2);
  if (field === "validity_days" || field === "delivery_days") return whole(value);
  return text(value);
}

export function updateRevision(state: OffersState, offerId: string, revNo: number, body: Record<string, unknown>): { offer: OfferRec; revision: RevisionRec } {
  validate("OfferRevisionUpdate", body);
  rejectNull(body, ["offer_date", "validity_days", "overhead_pct", "profit_pct", "vat_pct", "price_escalation"]);
  if (body.offer_date !== null && body.offer_date !== undefined) checkOfferDate(body.offer_date);
  const { offer, revision } = lockDraft(state, offerId, revNo);
  const changes: Record<string, unknown> = { ...body };
  if (changes.price_escalation === "fixed" && !Object.hasOwn(changes, "price_index_type")) {
    changes.price_index_type = null; // sabit fiyata geçerken endeks türü kendiliğinden düşer
  }
  const escalation = (changes.price_escalation ?? revision.priceEscalation) as PriceEscalation;
  const indexType = Object.hasOwn(changes, "price_index_type") ? changes.price_index_type : revision.priceIndexType;
  checkEscalation(escalation, indexType);

  const patch: Record<string, unknown> = {};
  for (const [field, key] of REVISION_FIELD) {
    if (!Object.hasOwn(changes, field)) continue;
    const next = revisionValue(field, changes[field]);
    if (next !== revision[key]) patch[key] = next; // metin eşitliği = sayı eşitliği (kanonik ölçek)
  }
  if (Object.keys(patch).length === 0) return { offer, revision };
  const now = nowIso(state);
  patchOffer(state, offerId, { updatedAt: now });
  return { offer: findOffer(state, offerId), revision: patchRevision(state, revision.id, { ...(patch as Partial<RevisionRec>), updatedAt: now }) };
}

/** Yeni revizyon = önceki revizyonun KOPYASI (SO-10): teklif tarihi BUGÜN; neden/kazanan tutar kopyalanmaz. */
export function createRevision(state: OffersState, port: OffersPort, offerId: string): { offer: OfferRec; revision: RevisionRec } {
  const { revision: previous } = lockLatest(state, offerId);
  if (previous.status !== "sent" && previous.status !== "lost") throw fail(409, OFFER_MESSAGES.newRevisionNotAllowed);
  const now = nowIso(state);
  const revision: RevisionRec = {
    ...previous,
    id: nextId(state, "revision"),
    revNo: previous.revNo + 1,
    status: "draft",
    offerDate: istanbulDate(state.clock()),
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    wonAt: null,
    lostAt: null,
    withdrawnAt: null,
    lostReason: null,
    winningAmount: null,
    createdBy: port.actor.id,
    sentBy: null,
    wonBy: null,
    lostBy: null,
    withdrawnBy: null,
  };
  const groupMap = new Map<string, string>();
  const groups: GroupRec[] = state.groups
    .filter((group) => group.revisionId === previous.id)
    .map((group) => {
      const id = nextId(state, "group");
      groupMap.set(group.id, id);
      return { ...group, id, revisionId: revision.id };
    });
  const items: ItemRec[] = state.items
    .filter((item) => item.revisionId === previous.id)
    .map((item) => ({ ...item, id: nextId(state, "item"), revisionId: revision.id, groupId: groupMap.get(item.groupId) as string }));
  state.revisions = [...state.revisions, revision];
  state.groups = [...state.groups, ...groups];
  state.items = [...state.items, ...items];
  return { offer: patchOffer(state, offerId, { updatedAt: now }), revision };
}

export function transition(
  state: OffersState,
  port: OffersPort,
  offerId: string,
  revNo: number,
  action: OfferAction,
  loseBody: Record<string, unknown> | null,
): OfferRec {
  if (action === "lose" && loseBody !== null) validate("OfferLoseRequest", loseBody);
  const { offer, revision } = lockLatest(state, offerId, revNo);
  const [allowedFrom, target] = TRANSITIONS[action];
  if (!allowedFrom.includes(revision.status)) {
    throw fail(409, `Revizyon ${STATUS_LABEL[revision.status]} durumda; bu işlem yapılamaz`);
  }
  if (action === "send" && !state.items.some((item) => item.revisionId === revision.id)) {
    throw fail(422, OFFER_MESSAGES.noItemsToSend); // SO-9/SO-17: bos grup kalem SAYILMAZ
  }
  if (action === "send" && state.items.some((item) => item.revisionId === revision.id && item.quantity === null)) {
    throw fail(422, OFFER_MESSAGES.unquantifiedItems); // SO-21: taslakta serbest, gönderimde engelli
  }
  const now = nowIso(state);
  const actor = port.actor.id;
  const patch: Partial<RevisionRec> = { status: target, updatedAt: now };
  if (action === "send") Object.assign(patch, { sentAt: now, sentBy: actor });
  else if (action === "win") Object.assign(patch, { wonAt: now, wonBy: actor });
  else if (action === "withdraw") Object.assign(patch, { withdrawnAt: now, withdrawnBy: actor });
  else {
    Object.assign(patch, { lostAt: now, lostBy: actor });
    if (loseBody !== null) {
      const reason = loseBody.lost_reason === null || loseBody.lost_reason === undefined ? "" : text(loseBody.lost_reason).trim();
      patch.lostReason = reason === "" ? null : reason;
      patch.winningAmount = nullable(loseBody.winning_amount, 2);
    }
  }
  patchRevision(state, revision.id, patch);
  return patchOffer(state, offer.id, { updatedAt: now });
}

// ------------------------------------------------------------------------------------ grup/kalem

function findGroup(state: OffersState, revisionId: string, groupId: string): GroupRec {
  const group = state.groups.find((entry) => entry.id === groupId && entry.revisionId === revisionId);
  if (group === undefined) throw fail(404, OFFER_MESSAGES.groupMissing);
  return group;
}

function nextGroupOrder(state: OffersState, revisionId: string): number {
  const orders = state.groups.filter((group) => group.revisionId === revisionId).map((group) => group.sortOrder);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

export function createGroup(state: OffersState, offerId: string, revNo: number, body: Record<string, unknown>): GroupRec {
  validate("OfferGroupCreate", body);
  const { revision } = lockDraft(state, offerId, revNo);
  const group: GroupRec = {
    id: nextId(state, "group"),
    revisionId: revision.id,
    name: text(body.name).trim(),
    sortOrder: body.sort_order === null || body.sort_order === undefined ? nextGroupOrder(state, revision.id) : whole(body.sort_order),
  };
  state.groups = [...state.groups, group];
  touchRevision(state, revision.id);
  return group;
}

export function updateGroup(state: OffersState, offerId: string, revNo: number, groupId: string, body: Record<string, unknown>): GroupRec {
  validate("OfferGroupUpdate", body);
  rejectNull(body, ["name", "sort_order"]);
  const { revision } = lockDraft(state, offerId, revNo);
  const group = findGroup(state, revision.id, groupId);
  const next: GroupRec = {
    ...group,
    ...(Object.hasOwn(body, "name") ? { name: text(body.name).trim() } : {}),
    ...(Object.hasOwn(body, "sort_order") ? { sortOrder: whole(body.sort_order) } : {}),
  };
  state.groups = state.groups.map((entry) => (entry.id === groupId ? next : entry));
  touchRevision(state, revision.id);
  return next;
}

export function deleteGroup(state: OffersState, offerId: string, revNo: number, groupId: string): void {
  const { revision } = lockDraft(state, offerId, revNo);
  const group = findGroup(state, revision.id, groupId);
  state.groups = state.groups.filter((entry) => entry.id !== group.id); // kalemler KASKAD gider
  state.items = state.items.filter((item) => item.groupId !== group.id);
  touchRevision(state, revision.id);
}

/** SO-4: birleşik durum üzerinde, YAZMADAN ÖNCE (reddedilen yazma hiçbir şey bırakmaz). */
function assertPriceable(item: ItemRec, revision: RevisionRec, label?: string): void {
  try {
    calcItem(itemInput(item), { overhead_pct: revision.overheadPct, profit_pct: revision.profitPct });
  } catch (error) {
    if (error instanceof ManualPriceWithoutCostError) {
      throw fail(422, label === undefined ? error.message : `${label}: ${error.message}`);
    }
    throw error;
  }
}

export function addItems(state: OffersState, port: OffersPort, offerId: string, revNo: number, bodies: readonly Record<string, unknown>[], bulk: boolean): { revision: RevisionRec; items: ItemRec[] } {
  const { revision } = lockDraft(state, offerId, revNo);
  const label = (index: number): string | undefined => (bulk ? `Kalem ${index + 1}` : undefined);
  const prefix = (index: number): string => (bulk ? `${label(index)}: ` : "");

  // 1) doğrula (yazmadan ÖNCE): gruplar
  bodies.forEach((body, index) => {
    const groupId = text(body.group_id).toLowerCase();
    if (state.groups.some((group) => group.id === groupId && group.revisionId === revision.id)) return;
    const elsewhere = state.groups.some((group) => group.id === groupId);
    throw fail(elsewhere ? 422 : 404, `${prefix(index)}${elsewhere ? OFFER_MESSAGES.groupForeign : OFFER_MESSAGES.groupMissing}`);
  });
  // 2) katalog
  const catalog = new Map(port.catalog().map((entry) => [entry.id, entry] as const));
  for (const body of bodies) {
    if (!catalog.has(text(body.catalog_item_id).toLowerCase())) throw fail(404, OFFER_MESSAGES.catalogMissing);
  }
  // 3) SO-6 son fiyat — maliyeti GÖNDERİLMEYEN kalemler için
  const lastPrices = port.lastPrices();
  const orders = new Map<string, number>();
  for (const item of state.items.filter((entry) => entry.revisionId === revision.id)) {
    orders.set(item.groupId, Math.max(orders.get(item.groupId) ?? -1, item.sortOrder));
  }
  const created: ItemRec[] = [];
  bodies.forEach((body, index) => {
    const entry = catalog.get(text(body.catalog_item_id).toLowerCase()) as OfferCatalogEntry;
    let cost: string | null;
    if (Object.hasOwn(body, "cost_unit_price")) {
      cost = nullable(body.cost_unit_price, 2); // açık null = BOŞ
    } else {
      const suggested = suggestCost(lastPrices.get(entry.id)?.price ?? null, entry.refPrice);
      cost = suggested === null ? null : quantizeDecimal(suggested, 2);
    }
    const groupId = text(body.group_id).toLowerCase();
    let sortOrder: number;
    if (body.sort_order !== null && body.sort_order !== undefined) {
      sortOrder = whole(body.sort_order);
    } else {
      sortOrder = (orders.get(groupId) ?? -1) + 1;
      orders.set(groupId, sortOrder);
    }
    const item: ItemRec = {
      id: nextId(state, "item"),
      revisionId: revision.id,
      groupId,
      sortOrder,
      catalogItemId: entry.id,
      pozNo: entry.pozNo,
      description: entry.name,
      unit: entry.uom,
      quantity: body.quantity === null || body.quantity === undefined ? null : quantizeDecimal(text(body.quantity), 3), // SO-21: yok/null = girilmedi
      unitMhr: quantizeDecimal(body.unit_mhr === null || body.unit_mhr === undefined ? entry.standardUnitMhr : text(body.unit_mhr), 4),
      costUnitPrice: cost,
      overheadPct: nullable(body.overhead_pct, 2),
      profitPct: nullable(body.profit_pct, 2),
      offerUnitPrice: nullable(body.offer_unit_price, 2),
    };
    assertPriceable(item, revision, label(index));
    created.push(item);
  });
  // 4) yaz (hep-ya-hiç)
  state.items = [...state.items, ...created];
  return { revision: touchRevision(state, revision.id), items: created };
}

const ITEM_PATCH_FIELD: ReadonlyArray<readonly [string, keyof ItemRec, number | null]> = [
  ["quantity", "quantity", 3],
  ["unit_mhr", "unitMhr", 4],
  ["cost_unit_price", "costUnitPrice", 2],
  ["overhead_pct", "overheadPct", 2],
  ["profit_pct", "profitPct", 2],
  ["offer_unit_price", "offerUnitPrice", 2],
];

export function updateItem(state: OffersState, offerId: string, revNo: number, itemId: string, body: Record<string, unknown>): { revision: RevisionRec; item: ItemRec } {
  const immutable = offerImmutableItemFields(body);
  if (immutable !== null) throw invalid(immutable);
  validate("OfferItemUpdate", body);
  rejectNull(body, ["quantity", "unit_mhr", "group_id", "sort_order"]);
  const { revision } = lockDraft(state, offerId, revNo);
  const item = state.items.find((entry) => entry.id === itemId && entry.revisionId === revision.id);
  if (item === undefined) throw fail(404, OFFER_MESSAGES.itemMissing);
  const patch: Record<string, unknown> = {};
  if (Object.hasOwn(body, "group_id") && text(body.group_id).toLowerCase() !== item.groupId) {
    const groupId = text(body.group_id).toLowerCase();
    if (!state.groups.some((group) => group.id === groupId && group.revisionId === revision.id)) {
      const elsewhere = state.groups.some((group) => group.id === groupId);
      throw fail(elsewhere ? 422 : 404, elsewhere ? OFFER_MESSAGES.groupForeign : OFFER_MESSAGES.groupMissing);
    }
    patch.groupId = groupId;
  }
  for (const [field, key, places] of ITEM_PATCH_FIELD) {
    if (Object.hasOwn(body, field)) patch[key] = nullable(body[field], places as number);
  }
  if (Object.hasOwn(body, "sort_order")) patch.sortOrder = whole(body.sort_order);
  const merged: ItemRec = { ...item, ...(patch as Partial<ItemRec>) };
  assertPriceable(merged, revision); // birleşik durum, YAZMADAN önce
  state.items = state.items.map((entry) => (entry.id === item.id ? merged : entry));
  return { revision: touchRevision(state, revision.id), item: merged };
}

export function deleteItem(state: OffersState, offerId: string, revNo: number, itemId: string): void {
  const { revision } = lockDraft(state, offerId, revNo);
  if (!state.items.some((entry) => entry.id === itemId && entry.revisionId === revision.id)) {
    throw fail(404, OFFER_MESSAGES.itemMissing);
  }
  state.items = state.items.filter((entry) => entry.id !== itemId);
  touchRevision(state, revision.id);
}

// ------------------------------------------------------------------------------------- liste

function queryViolation(name: string, type: string, msg: string, input: string): Failure {
  return new Failure(422, { detail: [{ type, loc: ["query", name], msg, input }] });
}

export function parseListFilters(query: URLSearchParams): OfferListFilters {
  const status = query.get("status");
  if (status !== null && !(OFFER_STATUSES as readonly string[]).includes(status)) {
    const quoted = OFFER_STATUSES.map((entry) => `'${entry}'`);
    throw queryViolation("status", "enum", `Input should be ${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]}`, status);
  }
  const conversion = query.get("conversion");
  if (conversion !== null && conversion !== "converted" && conversion !== "won_not_converted") {
    throw queryViolation("conversion", "literal_error", "Input should be 'converted' or 'won_not_converted'", conversion);
  }
  const q = query.get("q");
  if (q !== null && q.length > 200) throw queryViolation("q", "string_too_long", "String should have at most 200 characters", q);
  const employerId = query.get("employer_id");
  const date = (name: string): string | null => {
    const value = query.get(name);
    if (value === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw queryViolation(name, "date_from_datetime_parsing", "Input should be a valid date or datetime, invalid character in year", value);
    }
    return value;
  };
  const integer = (name: string, fallback: number): number => {
    const value = query.get(name);
    if (value === null) return fallback;
    if (!/^[+-]?\d+$/.test(value)) throw queryViolation(name, "int_parsing", "Input should be a valid integer, unable to parse string as an integer", value);
    return parseInt(value, 10);
  };
  const dateFrom = date("offer_date_from");
  const dateTo = date("offer_date_to");
  if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) throw fail(422, OFFER_MESSAGES.dateRange);
  return {
    status: status as OfferStatus | null,
    conversion: conversion as OfferListFilters["conversion"],
    q,
    employerId: employerId === null ? null : employerId.toLowerCase(),
    dateFrom,
    dateTo,
    limit: Math.min(integer("limit", DEFAULT_LIMIT), MAX_LIMIT),
    offset: integer("offset", 0),
  };
}

