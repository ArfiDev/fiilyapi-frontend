/**
 * Form değerleri → openapi gövdeleri.
 *
 * `SubcontractorContractCreate` alan adları ve tipleri şemadan BİREBİR
 * alınmıştır. Ondalık alanlar (`late_penalty_daily`, `advance_pct`,
 * `retainage_pct`) şemada `number | string` kabul eder; STRING gönderilir —
 * kullanıcının yazdığı ondalık, `Number()` turundan geçerken kayba uğramasın.
 */

import type {
  SubcontractorContractCreateRequest,
  SubcontractorContractUpdateRequest,
} from "@/lib/api/hooks/useSubcontractorContractMutations";

import type { ContractTermsValues, SubcontractorContractFormValues } from "./form-state";
import { parseLatePenalty, parsePct, type TermsNumberParse } from "./validate";

/**
 * 🔴 TKL-F7a · T42: gecikme cezası ve oranlar HAM Türkçe girdidir ("1.234,5"); gövdeye T30 ile okunmuş
 * nokta-ondalık METİN girer. Okunamazsa fırlatılır (doğrulama atlanmıştır) — para/oran tahmin edilmez.
 */
function termsNumberOrThrow(parsed: TermsNumberParse): string | null {
  if (parsed.kind === "error") throw new Error(parsed.message);
  return parsed.value;
}

/** Boş/whitespace → `null`, aksi hâlde kırpılmış metin. */
function textOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** `payment_term_days` tamsayıdır; boşsa şema varsayılanına (30) düşülür. */
function intOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Şart alanlarının ORTAK gövde parçası — `Create` ve `Update` şemalarında
 * alan adları AYNIDIR, bu yüzden tek yerde üretilir (T7'nin PATCH'i de bunu
 * kullanır).
 */
function termsPayload(values: ContractTermsValues) {
  return {
    contract_no: textOrNull(values.contractNo),
    signature_date: textOrNull(values.signatureDate),
    is_notarized: values.isNotarized,
    start_date: textOrNull(values.startDate),
    end_date: textOrNull(values.endDate),
    late_penalty_daily: termsNumberOrThrow(parseLatePenalty(values.latePenaltyDaily)),
    materials_by_contractor: values.materialsByContractor,
    subcontractor_files_own_sgk: values.subcontractorFilesOwnSgk,
    vat_withholding: values.vatWithholding,
    payment_period: values.paymentPeriod,
  };
}

/**
 * Oran ve vade alanları şemada NULLABLE DEĞİLDİR ve `gen:api` çıktısında
 * ZORUNLU görünürler (varsayılanları olmasına rağmen — `is_active` tuzağının
 * aynısı). Bu yüzden HER ZAMAN gönderilirler; kullanıcı alanı boşaltırsa
 * ŞEMA VARSAYILANINA düşülür (mockup'ın ön dolu değerleriyle aynı: 99 "10",
 * 100 "5", 102 "30") — `null` gönderip alanı silmek şema dışıdır.
 */
const NUMERIC_FALLBACK = {
  advancePct: "10",
  retainagePct: "5",
  paymentTermDays: 30,
} as const;

function numericPayload(values: ContractTermsValues) {
  return {
    advance_pct: termsNumberOrThrow(parsePct(values.advancePct)) ?? NUMERIC_FALLBACK.advancePct,
    retainage_pct: termsNumberOrThrow(parsePct(values.retainagePct)) ?? NUMERIC_FALLBACK.retainagePct,
    payment_term_days: intOrUndefined(values.paymentTermDays) ?? NUMERIC_FALLBACK.paymentTermDays,
  };
}

/**
 * Mockup'ta kontrolü OLMAYAN ama `gen:api` çıktısında ZORUNLU görünen iki
 * alan. Değerler şemanın kendi varsayılanlarıdır — icat değildir ve mockup'ın
 * 107. satırındaki "%20" metniyle de tutarlıdır.
 */
const SCHEMA_DEFAULTS = {
  vat_pct: "20",
  status: "active",
} as const;

export interface BuildBodyOptions {
  isDraft: boolean;
}

/**
 * `POST /projects/{project_id}/subcontractor-contracts` gövdesi.
 *
 * `project_id` YOLDADIR, gövdede yer almaz. `items` GÖNDERİLMEZ: poz listesi
 * `load-from-employer` ve kalem uçlarıyla sözleşme kurulduktan SONRA yönetilir
 * (bkz. `SubcontractorContractCreateView`) — iç içe kalem göndermek aynı
 * satırları İKİ KEZ yaratırdı.
 *
 * `vat_pct` mockup'ta ÇİZİLİ DEĞİLDİR (107'deki "%20" yalnız kutucuk
 * metnidir) ve `status` da çizilmemiştir → forma ALAN EKLENMEZ. İkisi de
 * şemada varsayılanlıdır ama `gen:api` çıktısında ZORUNLU görünür
 * (`SubcontractorCreate.is_active` ile aynı tuzak), bu yüzden gövdeye ŞEMA
 * VARSAYILANLARIYLA sabit yazılırlar.
 */
export function buildContractCreateBody(
  values: SubcontractorContractFormValues,
  { isDraft }: BuildBodyOptions,
): SubcontractorContractCreateRequest {
  return {
    site_id: textOrNull(values.siteId),
    subcontractor_id: textOrNull(values.subcontractorId),
    work_category: textOrNull(values.workCategory),
    ...termsPayload(values),
    ...numericPayload(values),
    ...SCHEMA_DEFAULTS,
    is_draft: isDraft,
  };
}

/**
 * `PATCH /subcontractor-contracts/{id}` gövdesi — taslak kurulduktan sonraki
 * kaydetmelerde kullanılır. `project_id` YOKTUR (sözleşme başka projeye
 * taşınamaz, şema açıklaması).
 */
export function buildContractUpdateBody(
  values: SubcontractorContractFormValues,
  { isDraft }: BuildBodyOptions,
): SubcontractorContractUpdateRequest {
  return {
    site_id: textOrNull(values.siteId),
    subcontractor_id: textOrNull(values.subcontractorId),
    work_category: textOrNull(values.workCategory),
    ...termsPayload(values),
    ...numericPayload(values),
    is_draft: isDraft,
  };
}

/**
 * YALNIZ şart alanlarının PATCH gövdesi — TSD'nin (T7) "Sözleşme Şartları"
 * bölümünün Kaydet'i bunu kullanır; bağlam alanlarına (proje/şantiye/taşeron)
 * DOKUNMAZ.
 */
export function buildContractTermsUpdateBody(
  values: ContractTermsValues,
): SubcontractorContractUpdateRequest {
  return {
    ...termsPayload(values),
    ...numericPayload(values),
  };
}
