import { expect, type Page } from "@playwright/test";

import type { ConvertedProjectResult, ConvertedProjectSpec, ConvertPort } from "./mock-offer-types";

// TKL-F5.6 · DÖNÜŞTÜRME SAHTE YAZIMI — SAYFAYA ÖZEL, PAYLAŞILAN MOCK'A YAZMAZ.
//
// Paylaşılan mock backend'in `convert` portu (`mock-backend.ts` `writeConvertedProject`) ANA durumu kalıcı değiştirir:
// proje listesi/şantiye/sözleşme kalemleri ve katalog "son fiyat"ı (SZL kaynağı) `fullyParallel` altında başka
// spec'lerin karelerini kaydırır. Bu yardımcı o portun YERİNE sayfaya özel bir port koyar (`installFakeOffersServer({ convert })`)
// ve dönüştürmeyle doğan projenin OKUMALARINI (`/projects/{id}`, `…/contract`, `…/contract/items`) yalnız bu sayfa için
// `page.route` ile yanıtlar. Okuma şekilleri paylaşılan mock'un `p-1` yanıtlarından ÖDÜNÇ alınır (alan kayması olmasın).
//
// ⚠️ `*.spec.ts` DEĞİLDİR. Giriş yapıldıktan SONRA, navigasyondan ÖNCE kurulur.

const BACKEND_PREFIX = "/api/backend";
const TEMPLATE_PROJECT_ID = "p-1";
/** Sahte projelerin kimlik öneki: paylaşılan mock'un `p-N` kimlikleriyle ÇAKIŞMAZ. */
const LOCAL_ID_PREFIX = "p-e2e-";
const LOCAL_PROJECT_ROUTE = new RegExp(`/api/backend/projects/(${LOCAL_ID_PREFIX}\\d+)(/contract(/items)?)?(\\?.*)?$`);
const CODE_YEAR = 2026;
const CODE_PAD = 3;
const MONEY_PLACES = 2;

type Json = Record<string, unknown>;

export interface ConvertedRecord {
  readonly spec: ConvertedProjectSpec;
  readonly result: ConvertedProjectResult;
}

export interface LocalConvert {
  readonly port: ConvertPort;
  /** Yazılan dönüştürmeler (sırayla). */
  readonly created: ConvertedRecord[];
}

async function readJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(`${BACKEND_PREFIX}${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

function slugOf(name: string): string {
  return name
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `PRJ-{yıl}-{NNN}` max+1 (paylaşılan mock `nextConvertedProjectCode` ikizi; kaynak: mevcut kodlar + bu sayfanın yazdıkları). */
function nextCode(taken: ReadonlySet<string>): string {
  const prefix = `PRJ-${CODE_YEAR}-`;
  const top = [...taken].reduce((max, code) => {
    const suffix = code.startsWith(prefix) ? code.slice(prefix.length) : "";
    return /^\d+$/.test(suffix) ? Math.max(max, parseInt(suffix, 10)) : max;
  }, 0);
  return `${prefix}${String(top + 1).padStart(CODE_PAD, "0")}`;
}

/** Sayfaya özel dönüştürme portu. Mevcut proje kodları paylaşılan mock'tan OKUNUR (409 kod çakışması için). */
export async function createLocalConvert(page: Page): Promise<LocalConvert> {
  const listed = await readJson(page, "/projects");
  const items = (Array.isArray(listed) ? listed : (listed.items ?? [])) as Array<{ code?: string }>;
  const taken = new Set(items.flatMap((item) => (typeof item.code === "string" ? [item.code] : [])));
  const created: ConvertedRecord[] = [];
  const port: ConvertPort = {
    disciplineExists: () => true,
    disciplineOfCatalog: () => null,
    projectCodeExists: (code) => taken.has(code),
    createConvertedProject: (spec) => {
      const projectId = `${LOCAL_ID_PREFIX}${created.length + 1}`;
      const projectCode = spec.project.code ?? nextCode(taken);
      taken.add(projectCode);
      const result: ConvertedProjectResult = {
        projectId,
        projectSlug: slugOf(spec.project.name) || null,
        projectCode,
        siteId: spec.site === null ? null : `s-e2e-${created.length + 1}`,
      };
      created.push({ spec, result });
      return result;
    },
  };
  return { port, created };
}

function recordOf(local: LocalConvert, projectId: string): ConvertedRecord {
  const hit = local.created.find((entry) => entry.result.projectId === projectId);
  if (hit === undefined) throw new Error(`sahte proje yok: ${projectId}`);
  return hit;
}

function projectRead(template: Json, record: ConvertedRecord): Json {
  const { spec, result } = record;
  return {
    ...template,
    id: result.projectId,
    slug: result.projectSlug,
    code: result.projectCode,
    name: spec.project.name,
    project_type: "taahhut",
    status: "active",
    category: spec.project.category,
    city: spec.project.city,
    employer_name: spec.employerName,
    contract_no: spec.contract.contractNo,
    contract_amount: spec.contract.amount,
    start_date: spec.project.startDate,
    end_date: spec.project.endDate,
  };
}

function contractRead(template: Json, record: ConvertedRecord): Json {
  const { spec, result } = record;
  const { contract } = spec;
  return {
    ...template,
    project_id: result.projectId,
    contract_no: contract.contractNo,
    signature_date: contract.signatureDate,
    amount: contract.amount,
    advance_pct: contract.advancePct,
    retainage_pct: contract.retainagePct,
    vat_pct: contract.vatPct,
    late_penalty_daily: contract.latePenaltyDaily,
    has_price_escalation: contract.hasPriceEscalation,
    index_type: contract.indexType,
    start_date: spec.project.startDate,
    end_date: spec.project.endDate,
    employer_name: spec.employerName,
    items_total: contract.amount,
    items_total_diff: (0).toFixed(MONEY_PLACES),
    advance_amount: (0).toFixed(MONEY_PLACES),
    milestones: null,
    documents: null,
    pending_modules: [],
  };
}

function itemsRead(template: Json, record: ConvertedRecord): Json {
  const { spec, result } = record;
  return {
    ...template,
    groups: spec.groups.map((group, groupIndex) => ({
      id: `cg-e2e-${groupIndex + 1}`,
      name: group.name,
      sort_order: groupIndex,
      items: group.items.map((item, itemIndex) => ({
        id: `ci-e2e-${result.projectId}-${groupIndex + 1}-${itemIndex + 1}`,
        group_id: `cg-e2e-${groupIndex + 1}`,
        code: item.code,
        source_code: item.sourceCode,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        sort_order: itemIndex,
        catalog_item_id: item.catalogItemId,
        distributed_quantity: spec.site === null ? "0.000" : item.quantity,
        remaining_quantity: spec.site === null ? item.quantity : "0.000",
      })),
    })),
  };
}

/**
 * Dönüştürmeyle doğan projenin OKUMALARINI (proje · sözleşme · sözleşme kalemleri) bu sayfa için yanıtlar.
 * Şablonlar paylaşılan mock'un `p-1` yanıtlarıdır (yalnız OKUNUR).
 */
export async function installConvertedProjectReads(page: Page, local: LocalConvert): Promise<void> {
  const projectTemplate = await readJson(page, `/projects/${TEMPLATE_PROJECT_ID}`);
  const contractTemplate = await readJson(page, `/projects/${TEMPLATE_PROJECT_ID}/contract`);
  const itemsTemplate = await readJson(page, `/projects/${TEMPLATE_PROJECT_ID}/contract/items`);
  await page.route(LOCAL_PROJECT_ROUTE, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const match = LOCAL_PROJECT_ROUTE.exec(route.request().url());
    const projectId = match?.[1] ?? "";
    const record = recordOf(local, projectId);
    const tail = match?.[2] ?? "";
    const body =
      tail === "" ? projectRead(projectTemplate, record) : tail === "/contract" ? contractRead(contractTemplate, record) : itemsRead(itemsTemplate, record);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}
