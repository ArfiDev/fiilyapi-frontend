// TKL-F4.4 · SAHTE BACKEND — Teklif ŞABLONLARI (`/offers/templates*`, 9 operasyon) — backend
// `offers/{template_router,template_service,template_schemas}.py` ikizi (B5.1 + B5.4 iyimser kilit).
// `handleOffers` (`mock-offers.ts`) `/offers/templates…` yollarını `/offers/{offer_id}` desenlerinden ÖNCE buraya
// yönlendirir (backend: `router_registry`de şablon router'ı teklif router'ından ÖNCE kayıtlıdır — aksi hâlde
// `GET /offers/templates` dinamik yola düşüp `offer_id` ayrıştırma 422'si verirdi).
//
// ## Davranış (kaynak: template_service.py unless noted)
//  · liste: varsayılan ÖNCE, sonra ada göre (tr-TR küçük harf), sonra kimlik; `{items,total}` (router:68)
//  · TEK varsayılan: "varsayılan yap" eskiyi AYNI işlemde düşürür (`_make_default`, :108-117)
//  · içerik TAM değiştirme, sıra = gövde sırası (`replace_content`/`_replace_rows`, :232-246); katalog id yoksa 404
//    "Katalog iş tipi bulunamadı" (:215); tavan 100 grup / 1000 kalem (şema: `too_long` + `value_error`)
//  · İYİMSER KİLİT (B5.4): PATCH + PUT'ta `expected_updated_at` ZORUNLU; ≠ şablonun `updated_at`i → 409; her gerçek
//    yazma `updated_at`i KESİN ilerletir (`_advance`: aynı mikro saniyeye denk gelse bile +1 µs)
//  · POST default kontrolsüzdür (`check_not_stale(None)`); zaten varsayılansa yazmaz
//  · kopya: ad yoksa `<ad[:72]> (kopya)`; varsayılan DEĞİL; DELETE 204, bağlı teklifler korunur (`template_id` NULL)
//  · tekliften: gruplar + katalog bağları + revizyon GG/kâr; fiyat/miktar YOK; tavan sema DIŞINDA da (düz metin 422)
//
// ⚠️ Mock'ta rol/izin YOKTUR (R5/T40 `RequireUnrestricted` 403'ü taklit EDİLMEZ — bkz. `mock-offer-views.ts` başlığı).
import type { components } from "@/lib/api/schema";

import { quantizeDecimal } from "./mock-offer-calc";
import { offerBodyViolation, offerNullRejected } from "./mock-offer-body";
import { OFFER_MESSAGES, TEMPLATE_MESSAGES, fail, invalid, uuidParam, valueError } from "./mock-offer-guards";
import {
  nextId,
  type OfferCatalogEntry,
  type OffersPort,
  type OffersState,
  type TemplateGroupRec,
  type TemplateRec,
} from "./mock-offer-types";
import { orderedContent } from "./mock-offer-views";

type S = components["schemas"];
type WithBody = (run: (body: Record<string, unknown>) => void) => void;

const TEMPLATE_GROUPS_MAX = 100;
const TEMPLATE_ITEMS_MAX = 1000;
const COPY_NAME_MAX = 80;
const TEMPLATES_PATH = "/offers/templates";
const trCollator = new Intl.Collator("tr-TR");

// ------------------------------------------------------------------------------ zaman (mikro saniye)

const DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/i;

/** ISO metin → mikro saniye (UTC); saat dilimsiz ya da bozuk metin için `null`. */
function parseMicros(value: string): bigint | null {
  const match = DATETIME_PATTERN.exec(value);
  if (match === null || match[3] === undefined) return null;
  const zone = match[3].length === 5 ? `${match[3].slice(0, 3)}:${match[3].slice(3)}` : match[3];
  const millis = Date.parse(`${match[1]}${zone.toUpperCase()}`);
  if (Number.isNaN(millis)) return null;
  const micros = BigInt((match[2] ?? "").padEnd(6, "0").slice(0, 6));
  return BigInt(millis) * 1000n + micros;
}

/** Mikro saniye → `2026-10-02T09:00:00.123456Z` (backend JSON biçimi: 6 hane). */
function formatMicros(micros: bigint): string {
  const iso = new Date(Number(micros / 1000n)).toISOString();
  return `${iso.slice(0, -1)}${(micros % 1000n).toString().padStart(3, "0")}Z`;
}

const nowMicros = (state: OffersState): bigint => BigInt(state.clock().getTime()) * 1000n;

/** `_advance`: saat geriye/aynı mikro saniyeye denk gelse bile ÖNCEKİNDEN kesin büyük. */
function advanced(state: OffersState, previous: string): string {
  const before = parseMicros(previous) ?? 0n;
  const now = nowMicros(state);
  return formatMicros(now > before ? now : before + 1n);
}

// ----------------------------------------------------------------------------------- doğrulama

/** Şema kapısı (openapi'den) + `expected_updated_at` (AwareDatetime: saat dilimsiz / bozuk → 422). */
function validateBody(schema: string, body: Record<string, unknown>): void {
  const violation = offerBodyViolation(schema, body);
  if (violation !== null) throw invalid(violation);
  if (!Object.hasOwn(body, "expected_updated_at")) return;
  const raw = body.expected_updated_at;
  const text = typeof raw === "string" ? raw : "";
  if (!DATETIME_PATTERN.test(text)) {
    throw invalid({ detail: [{ type: "datetime_from_date_parsing", loc: ["body", "expected_updated_at"], msg: "Input should be a valid datetime", input: raw }] });
  }
  if (parseMicros(text) === null) {
    throw invalid({ detail: [{ type: "timezone_aware", loc: ["body", "expected_updated_at"], msg: "Input should have timezone info", input: raw }] });
  }
}

function rejectNullFields(body: Record<string, unknown>, fields: readonly string[]): void {
  const violation = offerNullRejected(body, fields);
  if (violation !== null) throw invalid(violation);
}

function assertNotStale(template: TemplateRec, body: Record<string, unknown>): void {
  const expected = parseMicros(String(body.expected_updated_at));
  if (expected !== parseMicros(template.updatedAt)) throw fail(409, TEMPLATE_MESSAGES.stale);
}

/** Şema SONRASI toplam kalem tavanı (`TemplateContentReplace._total_items` field_validator'ı). */
function assertContentCeilings(groups: unknown[]): void {
  const total = groups.reduce((sum: number, group) => sum + ((group as { items?: unknown[] }).items?.length ?? 0), 0);
  if (total > TEMPLATE_ITEMS_MAX) throw invalid(valueError(TEMPLATE_MESSAGES.itemsTooMany, ["body", "groups"], groups));
}

// -------------------------------------------------------------------------------------- okuma

const pct = (value: unknown): string | null => (value === null || value === undefined ? null : quantizeDecimal(String(value), 2));

export function findTemplate(state: OffersState, templateId: string): TemplateRec {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (template === undefined) throw fail(404, TEMPLATE_MESSAGES.templateMissing);
  return template;
}

function usageCount(state: OffersState, template: TemplateRec): number {
  return state.offers.filter((offer) => offer.templateId === template.id).length;
}

function listItem(state: OffersState, template: TemplateRec): S["TemplateListItem"] {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    overhead_pct: template.overheadPct,
    profit_pct: template.profitPct,
    is_default: template.isDefault,
    group_count: template.groups.length,
    item_count: template.groups.reduce((sum, group) => sum + group.items.length, 0),
    usage_count: usageCount(state, template),
    updated_at: template.updatedAt,
  };
}

export function readTemplateList(state: OffersState): S["TemplateListResponse"] {
  const lower = (name: string): string => name.toLocaleLowerCase("tr-TR");
  const items = [...state.templates]
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || trCollator.compare(lower(a.name), lower(b.name)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((template) => listItem(state, template));
  return { items, total: items.length };
}

export function readTemplateDetail(state: OffersState, port: OffersPort, template: TemplateRec): S["TemplateDetailRead"] {
  const catalog = new Map(port.catalog().map((entry) => [entry.id, entry] as const));
  return {
    ...listItem(state, template),
    created_at: template.createdAt,
    groups: template.groups.map((group, groupIndex): S["TemplateGroupRead"] => ({
      id: group.id,
      name: group.name,
      sort_order: groupIndex,
      // Backend iç birleşim (katalog kalemi silinmişse satır düşer; FK RESTRICT'te olmaz).
      items: group.items.flatMap((item, itemIndex): S["TemplateItemRead"][] => {
        const entry = catalog.get(item.catalogItemId);
        if (entry === undefined) return [];
        return [{ id: item.id, sort_order: itemIndex, catalog_item_id: entry.id, poz_no: entry.pozNo, description: entry.name, unit: entry.uom }];
      }),
    })),
  };
}

// -------------------------------------------------------------------------------------- yazma

function patchTemplate(state: OffersState, id: string, patch: Partial<TemplateRec>): TemplateRec {
  const next = { ...findTemplate(state, id), ...patch };
  state.templates = state.templates.map((entry) => (entry.id === id ? next : entry));
  return next;
}

function buildGroups(state: OffersState, plan: ReadonlyArray<{ name: string; catalogIds: readonly string[] }>): TemplateGroupRec[] {
  return plan.map((group) => ({
    id: nextId(state, "templateGroup"),
    name: group.name,
    items: group.catalogIds.map((catalogItemId) => ({ id: nextId(state, "templateItem"), catalogItemId })),
  }));
}

/** `_replace_rows`: katalog doğrulaması + yazma TEK adımdır (hep-ya-hiç). */
function assertCatalogExists(port: OffersPort, plan: ReadonlyArray<{ catalogIds: readonly string[] }>): void {
  const known = new Set(port.catalog().map((entry) => entry.id));
  for (const group of plan) {
    for (const id of group.catalogIds) {
      if (!known.has(id.toLowerCase())) throw fail(404, OFFER_MESSAGES.catalogMissing);
    }
  }
}

function createRecord(
  state: OffersState,
  fields: { name: string; description: string | null; overheadPct: string | null; profitPct: string | null },
  groups: TemplateGroupRec[],
): TemplateRec {
  const stamp = formatMicros(nowMicros(state));
  const template: TemplateRec = { id: nextId(state, "template"), ...fields, isDefault: false, createdAt: stamp, updatedAt: stamp, groups };
  state.templates = [...state.templates, template];
  return template;
}

function createTemplate(state: OffersState, body: Record<string, unknown>): TemplateRec {
  validateBody("TemplateCreate", body);
  return createRecord(
    state,
    {
      name: String(body.name).trim(),
      description: body.description === null || body.description === undefined ? null : String(body.description),
      overheadPct: pct(body.overhead_pct),
      profitPct: pct(body.profit_pct),
    },
    [],
  );
}

/** Tekliften şablon: tavan, şablon satırı YAZILMADAN ÖNCE (yarım şablon kalmaz); düz metin 422 (OfferValidationError). */
function createFromOffer(state: OffersState, body: Record<string, unknown>): TemplateRec {
  validateBody("TemplateFromOffer", body);
  const offerId = String(body.offer_id).toLowerCase();
  if (!state.offers.some((offer) => offer.id === offerId)) throw fail(404, OFFER_MESSAGES.offerMissing);
  const revision = state.revisions.find((entry) => entry.offerId === offerId && entry.revNo === Number(body.rev_no));
  if (revision === undefined) throw fail(404, OFFER_MESSAGES.revisionMissing);
  const content = orderedContent(state, revision);
  const plan = content.groups.map((group) => ({
    name: group.name,
    catalogIds: (content.byGroup.get(group.id) ?? []).map((item) => item.catalogItemId),
  }));
  if (plan.length > TEMPLATE_GROUPS_MAX) throw fail(422, TEMPLATE_MESSAGES.groupsTooMany);
  if (plan.reduce((sum, group) => sum + group.catalogIds.length, 0) > TEMPLATE_ITEMS_MAX) throw fail(422, TEMPLATE_MESSAGES.itemsTooMany);
  return createRecord(
    state,
    {
      name: String(body.name).trim(),
      description: body.description === null || body.description === undefined ? null : String(body.description),
      overheadPct: revision.overheadPct,
      profitPct: revision.profitPct,
    },
    buildGroups(state, plan),
  );
}

function copyTemplate(state: OffersState, templateId: string, body: Record<string, unknown>): TemplateRec {
  validateBody("TemplateCopy", body);
  const source = findTemplate(state, templateId);
  const given = body.name === null || body.name === undefined ? null : String(body.name).trim();
  const suffix = TEMPLATE_MESSAGES.copySuffix;
  const name = given ?? `${source.name.slice(0, COPY_NAME_MAX - suffix.length)}${suffix}`;
  return createRecord(
    state,
    { name, description: source.description, overheadPct: source.overheadPct, profitPct: source.profitPct },
    buildGroups(
      state,
      source.groups.map((group) => ({ name: group.name, catalogIds: group.items.map((item) => item.catalogItemId) })),
    ),
  );
}

/** `_make_default`: eskiler AYNI işlemde düşer (updated_at ilerler), sonra bu işaretlenir. */
function makeDefault(state: OffersState, template: TemplateRec): TemplateRec {
  state.templates = state.templates.map((entry) =>
    entry.isDefault && entry.id !== template.id ? { ...entry, isDefault: false, updatedAt: advanced(state, entry.updatedAt) } : entry,
  );
  return patchTemplate(state, template.id, { isDefault: true });
}

function updateTemplate(state: OffersState, templateId: string, body: Record<string, unknown>): TemplateRec {
  validateBody("TemplateUpdate", body);
  rejectNullFields(body, ["name", "is_default"]);
  const template = findTemplate(state, templateId);
  assertNotStale(template, body);
  const patch: Partial<TemplateRec> = {};
  if (Object.hasOwn(body, "name") && String(body.name).trim() !== template.name) patch.name = String(body.name).trim();
  if (Object.hasOwn(body, "description")) {
    const next = body.description === null ? null : String(body.description);
    if (next !== template.description) patch.description = next;
  }
  if (Object.hasOwn(body, "overhead_pct") && pct(body.overhead_pct) !== template.overheadPct) patch.overheadPct = pct(body.overhead_pct);
  if (Object.hasOwn(body, "profit_pct") && pct(body.profit_pct) !== template.profitPct) patch.profitPct = pct(body.profit_pct);
  const becomesDefault = body.is_default === true && !template.isDefault;
  if (body.is_default === false && template.isDefault) patch.isDefault = false;
  let current = template;
  if (becomesDefault) current = makeDefault(state, template);
  if (Object.keys(patch).length === 0 && !becomesDefault) return template; // fiilen değişen yok: yazma YOK
  return patchTemplate(state, current.id, { ...patch, updatedAt: advanced(state, current.updatedAt) });
}

function replaceContent(state: OffersState, port: OffersPort, templateId: string, body: Record<string, unknown>): TemplateRec {
  validateBody("TemplateContentReplace", body);
  const groups = body.groups as Array<{ name: string; items?: Array<{ catalog_item_id: string }> }>;
  assertContentCeilings(groups);
  const template = findTemplate(state, templateId);
  assertNotStale(template, body);
  const plan = groups.map((group) => ({
    name: String(group.name).trim(),
    catalogIds: (group.items ?? []).map((item) => item.catalog_item_id.toLowerCase()),
  }));
  assertCatalogExists(port, plan);
  return patchTemplate(state, template.id, { groups: buildGroups(state, plan), updatedAt: advanced(state, template.updatedAt) });
}

function setDefault(state: OffersState, templateId: string): TemplateRec {
  const template = findTemplate(state, templateId);
  if (template.isDefault) return template; // zaten varsayılan: yazma YOK
  const made = makeDefault(state, template);
  return patchTemplate(state, made.id, { updatedAt: advanced(state, made.updatedAt) });
}

/** DELETE: bağlı teklifler korunur, `template_id` NULL (FK SET NULL); teklifin `updated_at`i DEĞİŞMEZ. */
function deleteTemplate(state: OffersState, templateId: string): void {
  const template = findTemplate(state, templateId);
  state.templates = state.templates.filter((entry) => entry.id !== template.id);
  state.offers = state.offers.map((offer) => (offer.templateId === template.id ? { ...offer, templateId: null } : offer));
}

// ------------------------------------------------------------------------------------ yönlendirme

export function handleOfferTemplates(state: OffersState, port: OffersPort, withBody: WithBody): void {
  const { method, path, send } = port;
  const notAllowed = (): void => send(405, { detail: "Method Not Allowed" });
  const detail = (template: TemplateRec) => readTemplateDetail(state, port, template);

  if (path === TEMPLATES_PATH) {
    if (method === "GET") return send(200, readTemplateList(state));
    if (method !== "POST") return notAllowed();
    return withBody((body) => send(201, detail(createTemplate(state, body))));
  }
  const segments = path.slice(TEMPLATES_PATH.length + 1).split("/"); // ["from-offer"] | ["{id}", "content"?]
  const head = segments[0] as string;
  if (head === "from-offer" && segments.length === 1) {
    if (method !== "POST") return notAllowed();
    return withBody((body) => send(201, detail(createFromOffer(state, body))));
  }
  const templateId = uuidParam("template_id", head);
  const tail = segments.slice(1);
  if (tail.length === 0) {
    if (method === "GET") return send(200, detail(findTemplate(state, templateId)));
    if (method === "DELETE") {
      deleteTemplate(state, templateId);
      return send(204);
    }
    if (method !== "PATCH") return notAllowed();
    return withBody((body) => send(200, detail(updateTemplate(state, templateId, body))));
  }
  if (tail.length !== 1) return send(404, { detail: "Not Found" });
  if (tail[0] === "content") {
    if (method !== "PUT") return notAllowed();
    return withBody((body) => send(200, detail(replaceContent(state, port, templateId, body))));
  }
  if (tail[0] === "default") {
    if (method !== "POST") return notAllowed();
    return send(200, detail(setDefault(state, templateId)));
  }
  if (tail[0] === "copy") {
    if (method !== "POST") return notAllowed();
    return withBody((body) => send(201, detail(copyTemplate(state, templateId, body))));
  }
  return send(404, { detail: "Not Found" });
}

// ------------------------------------------------------------------------------------------ tohum

interface SeedTemplate {
  name: string;
  description: string | null;
  overheadPct: string | null;
  profitPct: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  groups: ReadonlyArray<{ name: string; catalogNames: readonly string[] }>;
}

/** Görsel kareler (F4.8) bu veriye dayanır: DETERMİNİSTİK tarih, saat/clock'a bağlı DEĞİL. Fiyat/miktar yok (T12). */
const SEED_TEMPLATES: readonly SeedTemplate[] = [
  {
    name: "Kaba İnşaat Standart",
    description: "Betonarme kaba yapı: temel, kolon/perde, döşeme ve duvar kalemleri.",
    overheadPct: "10.00",
    profitPct: "18.00",
    isDefault: true,
    createdAt: "2026-09-10T08:00:00.000000Z",
    updatedAt: "2026-09-12T10:30:00.000000Z",
    groups: [
      { name: "Betonarme", catalogNames: ["Kalıp", "Demir", "Beton döküm"] },
      { name: "Duvar", catalogNames: ["Tuğla duvar"] },
    ],
  },
  {
    name: "Elektrik Tesisatı",
    description: null,
    overheadPct: null,
    profitPct: null,
    isDefault: false,
    createdAt: "2026-09-15T09:00:00.000000Z",
    updatedAt: "2026-09-15T09:00:00.000000Z",
    groups: [
      { name: "Elektrik", catalogNames: ["Kablo çekimi", "Buat/priz montajı"] },
      { name: "Topraklama", catalogNames: ["Topraklama"] },
    ],
  },
  {
    name: "İnce İşler — Sıva",
    description: "İç ve dış sıva paketi.",
    overheadPct: "12.00",
    profitPct: null,
    isDefault: false,
    createdAt: "2026-09-20T11:15:00.000000Z",
    updatedAt: "2026-09-25T14:45:00.000000Z",
    groups: [{ name: "Sıva", catalogNames: ["İç sıva", "Dış sıva"] }],
  },
];

/** Tohum şablonlarını yazar; döner: şablon adı → kimlik (tohum teklifleri `template_id`yi buradan bağlar). */
export function seedTemplates(state: OffersState, catalog: ReadonlyMap<string, OfferCatalogEntry>): Map<string, string> {
  const ids = new Map<string, string>();
  for (const spec of SEED_TEMPLATES) {
    const groups = buildGroups(
      state,
      spec.groups.map((group) => ({
        name: group.name,
        catalogIds: group.catalogNames.map((name) => {
          const entry = catalog.get(name);
          if (entry === undefined) throw new Error(`tohum: katalogda yok → ${name}`);
          return entry.id;
        }),
      })),
    );
    const id = nextId(state, "template");
    ids.set(spec.name, id);
    state.templates = [
      ...state.templates,
      {
        id,
        name: spec.name,
        description: spec.description,
        overheadPct: spec.overheadPct,
        profitPct: spec.profitPct,
        isDefault: spec.isDefault,
        createdAt: spec.createdAt,
        updatedAt: spec.updatedAt,
        groups,
      },
    ];
  }
  return ids;
}
