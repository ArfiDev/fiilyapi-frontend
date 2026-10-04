// TKL-F5.1 · SAHTE BACKEND — teklif → proje DÖNÜŞTÜRME (`POST /offers/{id}/convert`) — backend
// `offers/convert_{router,service,schemas}.py` ikizi (origin/main 7249b36). `mock-offers.ts` buraya TEK satırla
// yönlendirir; kurallar burada, proje/sözleşme/şantiye YAZIMI `OffersPort.convert` (ana sahte durum) arkasındadır.
//
// ## Hata sırası (FastAPI + `convert_service.convert_offer`)
//  1. path/gövde ŞEMA 422 (liste biçimi) — FastAPI handler'dan ÖNCE çözer: alan şeması, strip-sonrası boşluk,
//     pydantic MODEL doğrulayıcıları (bitiş<başlangıç, `site_name`⇒`open_site`, çakışan eşleme, 2000 kalem tavanı);
//  2. 404 "Teklif bulunamadı"                                   (`lock_offer`)
//  3. 409 "Teklif zaten dönüştürüldü"  — `project_id` doluysa; won-değil kontrolünden ÖNCE (SO-36)
//  4. 409 "Yalnız son revizyonu kazanılmış (won) …"
//  5. STATİK hatalar, tek 422 (`{"detail": "a; b", "errors": [{loc, message}]}`, `OfferValidationError` + TKL-B6.8 `_Issue`):
//     grup adı / kalem kodu tekilliği, `offer_item_id` ilişkisi, `group_disciplines` anahtarı, fiyat farkı tutarlılığı, bedel tavanı
//  6. 404 katalog iş tipi → 404 disiplin (ikisi de yazmadan önce)
//  6b. 409 "Bu proje kodu zaten kullanılıyor" — yalnız ELLE `project.code` verilmişse (TKL-B6.8 BD-2; yazmadan önce); gövde `detail` + `errors[{loc:["project","code"],message}]` (TKL-B6.9)
//  7. yaz (`port.convert.createConvertedProject`) → teklif `project_id`/`converted_at` (arşiv)
// Hata = HİÇBİR yazma (backend tek işlem, ara commit yok).
//
// ## Bedel (`_item_total`)
// Σ SATIR BAŞINA ROUND_HALF_UP(miktar × B.F., 0,01) — toplamda DEĞİL. `amount` gövdede varsa o yazılır (kuruşa kanonlanır).
//
// ⚠️ Mock'ta rol/izin YOKTUR (backend: `projects:admin` + `contracts:full` + kısıtsız): 403 TAKLİT EDİLMEZ
// (`mock-offer-views.ts` başlığı). EV tohumu (Rev.0 taslağı, oran yuvaları) sahte EV durumuna YAZILMAZ.
import type { components } from "@/lib/api/schema";

import { addDecimal, compareDecimal, isPositiveDecimal, multiplyDecimal, quantizeDecimal } from "./mock-offer-calc";
import { Failure, fail, invalid, uuidParam, validate } from "./mock-offer-guards";
import { findOffer } from "./mock-offer-service";
import type { ConvertedGroupSpec, OffersPort, OffersState, RevisionRec } from "./mock-offer-types";
import { latestRevision } from "./mock-offer-views";

type S = components["schemas"];
type Json = Record<string, unknown>;

export const CONVERT_MESSAGES = {
  alreadyConverted: "Teklif zaten dönüştürüldü",
  projectCodeTaken: "Bu proje kodu zaten kullanılıyor",
  notWon: "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir",
  amountTooLargeMessage: "Kalem toplamı sözleşme bedeli sınırını aşıyor",
  datesReversed: "project.end_date: Bitiş tarihi başlangıçtan önce olamaz",
  catalogMissing: "Katalog iş tipi bulunamadı",
  disciplineMissing: "Disiplin bulunamadı",
  disciplinesIgnored: "Şantiye açılmadığı için grup–disiplin eşlemesi saklanmadı; Planlama'da eşleyin",
  mixedGroup: "Grubun kalemleri birden çok disiplinde; Planlama'da disiplin elle eşlenmeli (eşlenmeden baseline dondurulamaz)",
  offerItemMissing: "Kalem teklifin son revizyonunda bulunamadı",
  offerItemCatalogMismatch: "Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor",
  indexRequired: "Fiyat farkı açıkken endeks türü zorunludur",
  baseIndexRequired: "Fiyat farkı açıkken baz endeks zorunludur",
  escalationClosed: "Fiyat farkı kapalıyken verilemez",
} as const;

const WARN_DISCIPLINES_IGNORED = "group_disciplines_ignored_without_site";
const WARN_MIXED_GROUP = "mixed_discipline_group";
const WARN_NO_RATE_SLOT = "no_rate_slot";

/** `CONVERT_MAX_ITEMS` (convert_schemas.py) ve `project_contracts.amount` = `Numeric(18, 2)` tavanı (1e16). */
const MAX_ITEMS = 2000;
const AMOUNT_LIMIT = "10000000000000000";
const MONEY_PLACES = 2;
const QUANTITY_PLACES = 3;
const BASE_INDEX_PLACES = 3;
/** Sözleşme şeması varsayılanları (SO-39; `ProjectContractInput`). */
const DEFAULT_ADVANCE_PCT = "20.00";
const DEFAULT_RETAINAGE_PCT = "5.00";

// ------------------------------------------------------------------------------ gövde çözümü

interface ItemIn {
  catalogItemId: string;
  offerItemId: string | null;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

interface GroupIn {
  name: string;
  items: ItemIn[];
}

interface Request {
  project: { code: string | null; name: string; city: string; startDate: string; endDate: string; category: string | null; parcel: string | null; address: string | null };
  contract: {
    contractNo: string;
    signatureDate: string;
    amount: string | null;
    vatPct: string | null;
    advancePct: string | null;
    retainagePct: string | null;
    latePenaltyDaily: string | null;
    hasPriceEscalation: boolean;
    indexType: string | null;
    baseIndexValue: string | null;
  };
  groups: GroupIn[];
  openSite: boolean;
  siteName: string | null;
  groupDisciplines: Map<string, string>;
}

const asText = (value: unknown): string => (typeof value === "string" ? value : String(value));
const strip = (value: unknown): string => asText(value).trim();
const optionalStrip = (value: unknown): string | null => (value === undefined || value === null ? null : strip(value));
const optionalDecimal = (value: unknown, places: number): string | null =>
  value === undefined || value === null ? null : quantizeDecimal(asText(value), places);

/** Strip sonrası boş kalan alanlar (pydantic `StringConstraints(strip_whitespace=True, min_length=1)`). */
function blankViolation(body: Json): ReturnType<typeof invalid> | null {
  const blank = (value: unknown, loc: ReadonlyArray<string | number>) =>
    typeof value === "string" && value.trim() === ""
      ? invalid({ detail: [{ type: "string_too_short", loc: ["body", ...loc], msg: "String should have at least 1 character", input: value, ctx: { min_length: 1 } }] })
      : null;
  const project = body.project as Json;
  const contract = body.contract as Json;
  const found: Array<ReturnType<typeof invalid> | null> = [
    ...["code", "name", "city", "category", "parcel", "address"].map((key) => blank(project[key], ["project", key])),
    blank(contract.contract_no, ["contract", "contract_no"]),
    blank(body.site_name, ["site_name"]),
  ];
  (body.groups as Json[]).forEach((group, g) => {
    found.push(blank(group.name, ["groups", g, "name"]));
    (group.items as Json[]).forEach((item, i) => {
      for (const key of ["code", "description", "unit"]) found.push(blank(item[key], ["groups", g, "items", i, key]));
    });
  });
  return found.find((entry) => entry !== null) ?? null;
}

/** Şema-sonrası pydantic doğrulayıcıları: `ValueError` → `value_error` + "Value error, …" (liste biçimi). */
function valueErrorOf(loc: ReadonlyArray<string | number>, message: string, input: unknown): ReturnType<typeof invalid> {
  return invalid({ detail: [{ type: "value_error", loc: ["body", ...loc], msg: `Value error, ${message}`, input, ctx: { error: {} } }] });
}

function groupDisciplineMap(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, id] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    const discipline = uuidParamBody(asText(id), name);
    const key = name.trim();
    const existing = out.get(key);
    if (existing !== undefined && existing !== discipline) {
      throw valueErrorOf(["group_disciplines"], `group_disciplines: «${key}» için birden çok eşleme var`, raw);
    }
    out.set(key, discipline);
  }
  return out;
}

function uuidParamBody(value: string, key: string): string {
  try {
    return uuidParam("group_disciplines", value);
  } catch {
    throw invalid({
      detail: [{ type: "uuid_parsing", loc: ["body", "group_disciplines", key], msg: "Input should be a valid UUID, invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-]", input: value }],
    });
  }
}

function parseRequest(body: Json): Request {
  validate("ConvertRequest", body);
  const blank = blankViolation(body);
  if (blank !== null) throw blank;
  const project = body.project as Json;
  const contract = body.contract as Json;
  if (asText(project.end_date) < asText(project.start_date)) {
    throw valueErrorOf(["project"], CONVERT_MESSAGES.datesReversed, project);
  }
  const groupDisciplines = groupDisciplineMap(body.group_disciplines);
  const groups = (body.groups as Json[]).map((group) => ({
    name: strip(group.name),
    items: (group.items as Json[]).map((item) => ({
      catalogItemId: asText(item.catalog_item_id).toLowerCase(),
      offerItemId: item.offer_item_id === undefined || item.offer_item_id === null ? null : asText(item.offer_item_id).toLowerCase(),
      code: strip(item.code),
      description: strip(item.description),
      unit: strip(item.unit),
      quantity: quantizeDecimal(asText(item.quantity), QUANTITY_PLACES),
      unitPrice: quantizeDecimal(asText(item.unit_price), MONEY_PLACES),
    })),
  }));
  if (groups.reduce((sum, group) => sum + group.items.length, 0) > MAX_ITEMS) {
    throw valueErrorOf([], `groups: en fazla ${MAX_ITEMS} kalem dönüştürülebilir`, body);
  }
  const openSite = body.open_site === true;
  if (body.site_name !== undefined && body.site_name !== null && !openSite) {
    throw valueErrorOf([], "site_name: yalnız open_site açıkken verilebilir", body);
  }
  return {
    project: {
      code: optionalStrip(project.code),
      name: strip(project.name),
      city: strip(project.city),
      startDate: asText(project.start_date),
      endDate: asText(project.end_date),
      category: optionalStrip(project.category),
      parcel: optionalStrip(project.parcel),
      address: optionalStrip(project.address),
    },
    contract: {
      contractNo: strip(contract.contract_no),
      signatureDate: asText(contract.signature_date),
      amount: optionalDecimal(contract.amount, MONEY_PLACES),
      vatPct: optionalDecimal(contract.vat_pct, MONEY_PLACES),
      advancePct: optionalDecimal(contract.advance_pct, MONEY_PLACES),
      retainagePct: optionalDecimal(contract.retainage_pct, MONEY_PLACES),
      latePenaltyDaily: optionalDecimal(contract.late_penalty_daily, MONEY_PLACES),
      hasPriceEscalation: contract.has_price_escalation === true,
      indexType: contract.index_type === undefined || contract.index_type === null ? null : asText(contract.index_type),
      baseIndexValue: optionalDecimal(contract.base_index_value, BASE_INDEX_PLACES),
    },
    groups,
    openSite,
    siteName: optionalStrip(body.site_name),
    groupDisciplines,
  };
}

// --------------------------------------------------------------------------------- bedel + statik

/** Backend `_item_total`: Σ SATIR BAŞINA ROUND_HALF_UP(miktar × B.F., 0,01). */
export function itemTotal(groups: readonly GroupIn[]): string {
  return groups
    .flatMap((group) => group.items)
    .reduce((sum, item) => addDecimal(sum, quantizeDecimal(multiplyDecimal(item.quantity, item.unitPrice), MONEY_PLACES)), "0");
}

function resolveIndexType(request: Request, revision: RevisionRec): string | null {
  if (request.contract.indexType !== null) return request.contract.indexType;
  return revision.priceEscalation === "tuik" ? revision.priceIndexType : null;
}

/** Backend `_Issue`: yapısal `loc` + mesaj; `detail` metni `label: mesaj` (etiket yoksa `loc`un `a[0].b` yolu). */
export interface Issue {
  loc: ReadonlyArray<string | number>;
  message: string;
  label?: string;
}

/** Backend `_path`: tamsayı parça `[i]`, metin parça `.ad` (ilk parça başında noktasız). */
export function locPath(loc: ReadonlyArray<string | number>): string {
  return loc.reduce<string>((out, part) => (typeof part === "number" ? `${out}[${part}]` : out === "" ? part : `${out}.${part}`), "");
}

const issueDetail = (issue: Issue): string => `${issue.label ?? locPath(issue.loc)}: ${issue.message}`;

function escalationErrors(request: Request, revision: RevisionRec): Issue[] {
  const { contract } = request;
  if (!contract.hasPriceEscalation) {
    return [
      ...(contract.indexType !== null ? [{ loc: ["contract", "index_type"], message: CONVERT_MESSAGES.escalationClosed }] : []),
      ...(contract.baseIndexValue !== null ? [{ loc: ["contract", "base_index_value"], message: CONVERT_MESSAGES.escalationClosed }] : []),
    ];
  }
  return [
    ...(resolveIndexType(request, revision) === null ? [{ loc: ["contract", "index_type"], message: CONVERT_MESSAGES.indexRequired }] : []),
    ...(contract.baseIndexValue === null ? [{ loc: ["contract", "base_index_value"], message: CONVERT_MESSAGES.baseIndexRequired }] : []),
  ];
}

function staticErrors(request: Request, revision: RevisionRec, offerItems: ReadonlyMap<string, string>): Issue[] {
  const errors: Issue[] = [];
  const names = new Set<string>();
  const codes = new Set<string>();
  request.groups.forEach((group, g) => {
    if (names.has(group.name)) errors.push({ loc: ["groups", g, "name"], message: `Aynı adlı grup var (${group.name})` });
    names.add(group.name);
    group.items.forEach((item, i) => {
      const where = ["groups", g, "items", i] as const;
      if (codes.has(item.code)) errors.push({ loc: [...where, "code"], message: `Kalem kodu tekrar ediyor (${item.code})` });
      codes.add(item.code);
      if (item.offerItemId === null) return;
      const sourceCatalog = offerItems.get(item.offerItemId);
      const loc = [...where, "offer_item_id"];
      if (sourceCatalog === undefined) errors.push({ loc, message: CONVERT_MESSAGES.offerItemMissing });
      else if (sourceCatalog !== item.catalogItemId) errors.push({ loc, message: CONVERT_MESSAGES.offerItemCatalogMismatch });
    });
  });
  for (const name of request.groupDisciplines.keys()) {
    if (!names.has(name)) errors.push({ loc: ["group_disciplines", name], message: `«${name}» adlı grup gövdede yok`, label: "group_disciplines" });
  }
  errors.push(...escalationErrors(request, revision));
  if (compareDecimal(itemTotal(request.groups), AMOUNT_LIMIT) >= 0 && request.contract.amount === null) {
    errors.push({ loc: ["contract", "amount"], message: CONVERT_MESSAGES.amountTooLargeMessage });
  }
  return errors;
}

// ------------------------------------------------------------------------------------ uyarılar

function warningsOf(
  request: Request,
  port: OffersPort,
  rates: ReadonlyMap<string, string>,
  offerItemMhr: ReadonlyMap<string, string>,
): S["ConvertWarning"][] {
  const convert = port.convert;
  const out: S["ConvertWarning"][] = [];
  if (!request.openSite && request.groupDisciplines.size > 0) {
    out.push({ code: WARN_DISCIPLINES_IGNORED, message: CONVERT_MESSAGES.disciplinesIgnored, group_name: null });
  }
  if (request.openSite && convert !== undefined) {
    for (const group of request.groups) {
      if (request.groupDisciplines.has(group.name)) continue;
      const found = new Set(group.items.map((item) => convert.disciplineOfCatalog(item.catalogItemId)).filter((id) => id !== null));
      if (found.size > 1) out.push({ code: WARN_MIXED_GROUP, message: CONVERT_MESSAGES.mixedGroup, group_name: group.name });
    }
  }
  const noSlot = request.groups
    .flatMap((group) => group.items)
    .filter((item) => !isPositiveDecimal(offerItemMhr.get(item.offerItemId ?? "") ?? rates.get(item.catalogItemId) ?? "0")).length;
  if (noSlot > 0) {
    out.push({ code: WARN_NO_RATE_SLOT, message: `${noSlot} kalemde adam-saat oranı yok (sözleşmeden doldurulamaz)`, group_name: null });
  }
  return out;
}

// --------------------------------------------------------------------------------------- giriş

/** `POST /offers/{id}/convert`. Port yoksa (bu harness dönüştürmeyi desteklemiyor) 404. */
export function handleConvert(
  state: OffersState,
  port: OffersPort,
  offerId: string,
  readBody: (run: (body: Json) => void) => void,
): void {
  const convert = port.convert;
  if (convert === undefined) return port.send(404, { detail: "Not Found" });
  readBody((body) => {
    const request = parseRequest(body);
    const offer = findOffer(state, offerId);
    if (offer.projectId !== null) throw fail(409, CONVERT_MESSAGES.alreadyConverted);
    const revision = latestRevision(state, offer.id);
    if (revision.status !== "won") throw fail(409, CONVERT_MESSAGES.notWon);

    const items = state.items.filter((item) => item.revisionId === revision.id);
    const errors = staticErrors(request, revision, new Map(items.map((item) => [item.id, item.catalogItemId])));
    if (errors.length > 0) {
      // Backend `OfferValidationError(detail, errors)`: `detail` `; ` birleşik METİN, `errors` yapısal (şema 422'leri bunu TAŞIMAZ).
      throw new Failure(422, { detail: errors.map(issueDetail).join("; "), errors: errors.map(({ loc, message }) => ({ loc: [...loc], message })) });
    }
    const rates = new Map(port.catalog().map((entry) => [entry.id.toLowerCase(), entry.standardUnitMhr]));
    const known = new Set(rates.keys());
    if (request.groups.some((group) => group.items.some((item) => !known.has(item.catalogItemId)))) {
      throw fail(404, CONVERT_MESSAGES.catalogMissing);
    }
    if ([...request.groupDisciplines.values()].some((id) => !convert.disciplineExists(id))) {
      throw fail(404, CONVERT_MESSAGES.disciplineMissing);
    }
    // BD-2: elle verilen kod yazmadan ÖNCE denetlenir (üretilen kod danışma kilidi altında çakışmaz).
    if (request.project.code !== null && convert.projectCodeExists(request.project.code)) {
      // TKL-B6.9 R5: backend `ConflictError(PROJECT_CODE_TAKEN, [{"loc": ["project","code"], ...}])` — `detail` AYNEN + yapısal `errors`.
      throw new Failure(409, { detail: CONVERT_MESSAGES.projectCodeTaken, errors: [{ loc: ["project", "code"], message: CONVERT_MESSAGES.projectCodeTaken }] });
    }

    const warnings = warningsOf(request, port, rates, new Map(items.map((item) => [item.id, item.unitMhr])));
    const groups: ConvertedGroupSpec[] = request.groups.map((group) => ({
      name: group.name,
      items: group.items.map(({ catalogItemId, offerItemId, code, description, unit, quantity, unitPrice }) => ({
        catalogItemId,
        code,
        // backend `convert_service`: Bakanlık no'su gövdeden DEĞİL teklif kaleminden kopyalanır (katalogdan eklenen satırda yok → null).
        sourceCode: offerItemId === null ? null : (items.find((item) => item.id === offerItemId)?.sourceCode ?? null),
        description,
        unit,
        quantity,
        unitPrice,
      })),
    }));
    const { contract } = request;
    const created = convert.createConvertedProject({
      offerNo: offer.offerNo,
      employerId: offer.employerId,
      employerName: offer.employerName,
      project: request.project,
      contract: {
        contractNo: contract.contractNo,
        signatureDate: contract.signatureDate,
        amount: contract.amount ?? itemTotal(request.groups),
        vatPct: contract.vatPct ?? revision.vatPct,
        advancePct: contract.advancePct ?? DEFAULT_ADVANCE_PCT,
        retainagePct: contract.retainagePct ?? DEFAULT_RETAINAGE_PCT,
        latePenaltyDaily: contract.latePenaltyDaily,
        hasPriceEscalation: contract.hasPriceEscalation,
        indexType: contract.hasPriceEscalation ? resolveIndexType(request, revision) : null,
        baseIndexValue: contract.baseIndexValue,
      },
      groups,
      site: request.openSite ? { name: request.siteName ?? request.project.name } : null,
    });

    const at = state.clock().toISOString();
    state.offers = state.offers.map((entry) => (entry.id === offer.id ? { ...entry, projectId: created.projectId, convertedAt: at, convertedByUserId: port.actor.id, project: { id: created.projectId, code: created.projectCode, name: request.project.name, slug: created.projectSlug }, updatedAt: at } : entry));
    const response: S["ConvertResponse"] = {
      project_id: created.projectId,
      project_slug: created.projectSlug,
      project_code: created.projectCode,
      site_id: created.siteId,
      contract_item_count: groups.reduce((sum, group) => sum + group.items.length, 0),
      warnings,
    };
    port.send(200, response);
  });
}
