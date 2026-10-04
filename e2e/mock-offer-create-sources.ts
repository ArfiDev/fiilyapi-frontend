// TKL-F4.4 · sahte backend `POST /offers` KAYNAKLARI — backend `offer_service.create_offer_with_origin` (kaynak/oran
// çözümü, :176-293) + `offer_seed.py` (`seed_from_template` · `copy_content`) ikizi. `mock-offer-service.ts` 800 satırı
// aşmasın diye ayrıldı; ÇAĞIRAN `createOffer`dır.
//
// Üç kaynak (en fazla BİRİ): boş (varsayılan) | `template_id` | `copy_from {offer_id, rev_no}` (SO-8).
//  · ORAN/KOŞUL ÖNCELİĞİ: gövde ?? kaynak ?? ayar. Şablon yalnız GG/kâr oranını taşır (null = ayardan);
//    kopya revizyonun TÜM koşullarını (geçerlilik, GG, kâr, KDV, ödeme, teslim, fiyat farkı, notlar) taşır.
//  · şablondan içerik: gruplar + kalemler, MİKTAR NULL (SO-21), maliyet = son fiyat → referans → boş (T38), a-s katalogdan
//  · kopyadan içerik: kaynak revizyonun grup/kalemleri BİREBİR (fiyat, kalem oranı, elle B.F., a-s, miktar — NULL dahil)
//  · `template_id` yalnız şablondan oluşturmada yazılır; kopyada MİRAS ALINMAZ (SO-23)
import { quantizeDecimal, suggestCost } from "./mock-offer-calc";
import { OFFER_MESSAGES, TEMPLATE_MESSAGES, fail, invalid, valueError } from "./mock-offer-guards";
import { findTemplate } from "./mock-offer-templates";
import {
  nextId,
  type GroupRec,
  type ItemRec,
  type OfferRec,
  type OffersPort,
  type OffersState,
  type PriceEscalation,
  type RevisionRec,
  type TemplateRec,
} from "./mock-offer-types";

export interface CreateSources {
  template: TemplateRec | null;
  copy: { offer: OfferRec; revision: RevisionRec } | null;
}

/** Kaynak kümesinin KOŞUL varsayılanları (gövdede verilmeyen alanların düştüğü yer). */
export interface ConditionDefaults {
  validityDays: number;
  overheadPct: string;
  profitPct: string;
  vatPct: string;
  paymentTerms: string | null;
  deliveryDays: number | null;
  priceEscalation: PriceEscalation;
  priceIndexType: string | null;
  notes: string | null;
}

const isGiven = (body: Record<string, unknown>, name: string): boolean => body[name] !== null && body[name] !== undefined;

/** `OfferCreate._source_rules` (model_validator): şema SONRASI; ikisi birden / kaynaksızda işveren + iş adı zorunlu. */
export function assertSourceRules(body: Record<string, unknown>): void {
  if (isGiven(body, "template_id") && isGiven(body, "copy_from")) {
    throw invalid(valueError(TEMPLATE_MESSAGES.sourceExclusive, ["body"], body));
  }
  if (isGiven(body, "copy_from")) return;
  if (!isGiven(body, "employer_id")) throw invalid(valueError(TEMPLATE_MESSAGES.employerRequired, ["body"], body));
  if (!isGiven(body, "title")) throw invalid(valueError(TEMPLATE_MESSAGES.titleRequired, ["body"], body));
}

/** Kaynakları çözer (404'ler backend sırasıyla: şablon → kopya teklifi → kopya revizyonu). */
export function lockSources(state: OffersState, body: Record<string, unknown>): CreateSources {
  const template = isGiven(body, "template_id") ? findTemplate(state, String(body.template_id).toLowerCase()) : null;
  if (!isGiven(body, "copy_from")) return { template, copy: null };
  const reference = body.copy_from as { offer_id: string; rev_no: number };
  const offerId = String(reference.offer_id).toLowerCase();
  const offer = state.offers.find((entry) => entry.id === offerId);
  if (offer === undefined) throw fail(404, OFFER_MESSAGES.offerMissing);
  const revision = state.revisions.find((entry) => entry.offerId === offer.id && entry.revNo === Number(reference.rev_no));
  if (revision === undefined) throw fail(404, OFFER_MESSAGES.revisionMissing);
  return { template, copy: { offer, revision } };
}

/** Ayar → (şablon: yalnız GG/kâr) → (kopya: kaynak revizyonun hepsi). */
export function conditionDefaults(state: OffersState, sources: CreateSources): ConditionDefaults {
  const settings = state.settings;
  const base: ConditionDefaults = {
    validityDays: settings.defaultValidityDays,
    overheadPct: settings.defaultOverheadPct,
    profitPct: settings.defaultProfitPct,
    vatPct: settings.defaultVatPct,
    paymentTerms: settings.defaultPaymentTerms,
    deliveryDays: null,
    priceEscalation: "fixed",
    priceIndexType: null,
    notes: null,
  };
  if (sources.copy !== null) {
    const source = sources.copy.revision;
    return {
      validityDays: source.validityDays,
      overheadPct: source.overheadPct,
      profitPct: source.profitPct,
      vatPct: source.vatPct,
      paymentTerms: source.paymentTerms,
      deliveryDays: source.deliveryDays,
      priceEscalation: source.priceEscalation,
      priceIndexType: source.priceIndexType,
      notes: source.notes,
    };
  }
  const template = sources.template;
  if (template === null) return base;
  return { ...base, overheadPct: template.overheadPct ?? base.overheadPct, profitPct: template.profitPct ?? base.profitPct };
}

/** Şablondan içerik: miktar NULL, maliyet = son fiyat → referans → boş (TEK `lastPrices` okuması, T32). */
function seedFromTemplate(state: OffersState, port: OffersPort, template: TemplateRec, revisionId: string): void {
  const catalog = new Map(port.catalog().map((entry) => [entry.id, entry] as const));
  const lastPrices = port.lastPrices();
  const groups: GroupRec[] = [];
  const items: ItemRec[] = [];
  template.groups.forEach((templateGroup, groupIndex) => {
    const group: GroupRec = { id: nextId(state, "group"), revisionId, name: templateGroup.name, sortOrder: groupIndex };
    groups.push(group);
    templateGroup.items.forEach((templateItem, itemIndex) => {
      const entry = catalog.get(templateItem.catalogItemId);
      if (entry === undefined) return; // FK RESTRICT: katalog kalemi silinemez — mock'ta katalog canlıdır, yine de güvenli
      const suggested = suggestCost(lastPrices.get(entry.id)?.price ?? null, entry.refPrice);
      items.push({
        id: nextId(state, "item"),
        revisionId,
        groupId: group.id,
        sortOrder: itemIndex,
        catalogItemId: entry.id,
        pozNo: entry.pozNo,
        sourceCode: entry.sourceCode,
        description: entry.name,
        unit: entry.uom,
        quantity: null, // SO-21: miktar boş gelir
        unitMhr: quantizeDecimal(entry.standardUnitMhr, 4),
        costUnitPrice: suggested === null ? null : quantizeDecimal(suggested, 2),
        overheadPct: null,
        profitPct: null,
        offerUnitPrice: null,
      });
    });
  });
  state.groups = [...state.groups, ...groups];
  state.items = [...state.items, ...items];
}

/** Kopyadan içerik (`copy_content`): kalemin grubu hedefteki KARŞILIK grubuna eşlenir; her alan birebir. */
function copyContent(state: OffersState, source: RevisionRec, revisionId: string): void {
  const groupMap = new Map<string, string>();
  const groups: GroupRec[] = state.groups
    .filter((group) => group.revisionId === source.id)
    .map((group) => {
      const id = nextId(state, "group");
      groupMap.set(group.id, id);
      return { ...group, id, revisionId };
    });
  const items: ItemRec[] = state.items
    .filter((item) => item.revisionId === source.id)
    .map((item) => ({ ...item, id: nextId(state, "item"), revisionId, groupId: groupMap.get(item.groupId) as string }));
  state.groups = [...state.groups, ...groups];
  state.items = [...state.items, ...items];
}

/** Yeni Rev.0'ın içeriğini doldurur (kaynak yoksa boş kalır). */
export function seedRevisionContent(state: OffersState, port: OffersPort, sources: CreateSources, revisionId: string): void {
  if (sources.template !== null) seedFromTemplate(state, port, sources.template, revisionId);
  if (sources.copy !== null) copyContent(state, sources.copy.revision, revisionId);
}
