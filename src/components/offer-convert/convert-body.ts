/**
 * TKL-F5.2 · `POST /offers/{id}/convert` GÖVDE kurucusu (SAF). Plan §3 "Gövde".
 *
 * 🔴 Gönderilmeyenler (bilinçli): `amount` (sunucu Σ ROUND_HALF_UP yazar — ÜS-F5-12) · `vat_pct/advance_pct/retainage_pct/
 * late_penalty_daily` (ÜS-F5-13) · BOŞ `project.code` (K-F5-1/BD-2: isteğe bağlı; boşsa anahtar HİÇ yok, sunucu üretir) ·
 * adam-saat (sunucu `offer_item_id`den okur).
 * 🔴 Doğrulanmamış durumdan gövde KURULMAZ (`ConvertBuildError`): backend'in statik 422 dalları istemcide kapanır.
 */
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { parseQuantityInput } from "@/lib/tr-decimal";

import { includedRows, mixedGroupKeys, sentGroupKeys } from "./convert-model";
import { parsedRow } from "./convert-derive";
import type { ConvertDraft, ConvertForm, ConvertRequest, ConvertRow } from "./convert-types";
import { hasStep1Errors, hasStep2Errors, validateStep1, validateStep2, type Step1Errors, type Step2Errors } from "./convert-validate";

type Body = ConvertRequest;
type BodyItem = Body["groups"][number]["items"][number];

export class ConvertBuildError extends Error {
  constructor(
    readonly step1: Step1Errors,
    readonly step2: Step2Errors,
  ) {
    super("Doğrulanmamış dönüştürme durumundan istek gövdesi kurulamaz");
    this.name = "ConvertBuildError";
  }
}

function requireValue(parsed: { ok: true; value: string } | { ok: false; message: string }): string {
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

function bodyItem(row: ConvertRow): BodyItem {
  const { qty, bf } = parsedRow(row);
  return {
    catalog_item_id: row.catalogItemId,
    // Yalnız tekliften gelen satırda: katalogdan eklenen satırda anahtar HİÇ yok (adam-saat katalog standardı, SO-33).
    ...(row.offerItemId === null ? {} : { offer_item_id: row.offerItemId }),
    code: row.code.trim(),
    description: row.description.trim(),
    unit: row.unit.trim(),
    quantity: requireValue(qty),
    unit_price: requireValue(bf),
  };
}

function bodyGroups(draft: ConvertDraft): Body["groups"] {
  const included = includedRows(draft);
  return sentGroupKeys(draft).flatMap((groupKey) => {
    const group = draft.groups.find((candidate) => candidate.key === groupKey);
    const items = included.filter((row) => row.groupKey === groupKey).map(bodyItem);
    return group ? [{ name: group.name.trim(), items }] : [];
  });
}

/** `group_disciplines`: YALNIZ şantiye açıkken ∧ karışık ∧ seçilmiş grupta (anahtar kırpılmış ad, SO-52). */
function groupDisciplines(draft: ConvertDraft): Record<string, string> {
  const mixed = mixedGroupKeys(draft);
  const sent = new Set(sentGroupKeys(draft));
  return Object.fromEntries(
    draft.groups.flatMap((group) =>
      sent.has(group.key) && mixed.has(group.key) && group.disciplineId !== null
        ? [[group.name.trim(), group.disciplineId] as const]
        : [],
    ),
  );
}

function bodyContract(form: ConvertForm): Body["contract"] {
  const base = {
    contract_no: form.contractNo.trim(),
    signature_date: form.signatureDate,
    has_price_escalation: form.hasPriceEscalation,
  };
  if (!form.hasPriceEscalation || form.indexType === "") return base;
  const d0 = parseQuantityInput(form.baseIndexValue);
  return { ...base, index_type: form.indexType, ...(d0.kind === "ok" ? { base_index_value: d0.value } : {}) };
}

function siteFields(form: ConvertForm, draft: ConvertDraft): Pick<Body, "site_name" | "group_disciplines"> {
  if (!form.openSite) return {};
  const siteName = form.siteName.trim();
  const disciplines = groupDisciplines(draft);
  return {
    ...(siteName ? { site_name: siteName } : {}),
    ...(Object.keys(disciplines).length > 0 ? { group_disciplines: disciplines } : {}),
  };
}

function bodyProject(form: ConvertForm): Body["project"] {
  const code = form.projectCode.trim();
  return {
    name: form.projectName.trim(),
    city: form.city.trim(),
    start_date: form.startDate,
    end_date: form.endDate,
    ...(code === "" ? {} : { code }),
  };
}

export function buildConvertRequest(form: ConvertForm, draft: ConvertDraft, revision: OfferRevisionRead): ConvertRequest {
  const step1 = validateStep1(form);
  const step2 = validateStep2(draft, revision);
  if (hasStep1Errors(step1) || hasStep2Errors(step2)) throw new ConvertBuildError(step1, step2);
  return {
    project: bodyProject(form),
    contract: bodyContract(form),
    groups: bodyGroups(draft),
    open_site: form.openSite,
    ...siteFields(form, draft),
  };
}
