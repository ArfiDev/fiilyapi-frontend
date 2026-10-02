import { backendErrorMessage } from "@/lib/api/error-message";
import type {
  OfferTemplateContentBody,
  OfferTemplateCopyBody,
  OfferTemplateCreateBody,
  OfferTemplateFromOfferBody,
  OfferTemplateUpdateBody,
} from "@/lib/api/hooks/useOfferTemplateMutations";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { ratesDiffer } from "./template-rates";

/**
 * TKL-F4.5 · "Yeni Şablon" modalının ÇOK ADIMLI oluşturma akışı (TKL-F4-PLAN §3 son maddeler, §9-R3).
 * Atomik DEĞİL: adımlar sırayla, İLK HATA durdurur. İlk adım (şablonun kendisi) düşerse şablon yoktur;
 * sonrakilerden biri düşerse şablon VARDIR → çağıran onu seçer + "Şablon oluşturuldu ama … uygulanamadı: {metin}".
 * Her adım bir ÖNCEKİ adımın yanıtındaki `updated_at`i taşır (iyimser kilit; bayat damga = 409).
 *
 *   Boş ........ POST → [PUT içerik: seçili başlangıç grupları] → [POST default]
 *   Tekliften .. POST from-offer (son revizyon) → [PATCH: kaynaktan FARKLI oranlar] → [POST default]
 *   Kopya ...... POST copy{name} → [PATCH: açıklama/oran farkı] → [POST default]
 */

export type CreateSource =
  | { kind: "blank"; groupNames: readonly string[] }
  | { kind: "offer"; offerId: string; revNo: number; offerNo: string }
  | { kind: "template"; templateId: string };

export interface CreateInput {
  name: string;
  description: string;
  /** Doğrulanmış kayıpsız ondalık metin; `null` = oran yok (teklif ayarı). */
  overhead: string | null;
  profit: string | null;
  makeDefault: boolean;
  source: CreateSource;
}

export interface FlowDeps {
  createBlank: (body: OfferTemplateCreateBody) => Promise<OfferTemplateDetail>;
  fromOffer: (body: OfferTemplateFromOfferBody) => Promise<OfferTemplateDetail>;
  copy: (templateId: string, body: OfferTemplateCopyBody) => Promise<OfferTemplateDetail>;
  patch: (templateId: string, body: OfferTemplateUpdateBody) => Promise<OfferTemplateDetail>;
  putContent: (templateId: string, body: OfferTemplateContentBody) => Promise<OfferTemplateDetail>;
  setDefault: (templateId: string) => Promise<OfferTemplateDetail>;
}

export interface FlowResult {
  /** Son bilinen şablon; ilk adım düştüyse `null`. */
  template: OfferTemplateDetail | null;
  failure: { created: boolean; message: string } | null;
}

/** `Şablon oluşturuldu ama {etiket} uygulanamadı: {metin}` etiketleri (GECE KURALI, rapora yazıldı). */
const STEP_LABEL = { content: "gruplar", rates: "oranlar", default: "varsayılan şablon ayarı" } as const;

/** Oluşan şablonun oran/açıklamasından FARKLI olan alanlar; fark yoksa `null`. */
function diffPatch(
  template: OfferTemplateDetail,
  input: CreateInput,
  includeDescription: boolean,
): Omit<OfferTemplateUpdateBody, "expected_updated_at"> | null {
  const description = input.description.trim();
  const fields = {
    ...(includeDescription && description !== "" && description !== template.description ? { description } : {}),
    ...(ratesDiffer(input.overhead, template.overhead_pct) ? { overhead_pct: input.overhead } : {}),
    ...(ratesDiffer(input.profit, template.profit_pct) ? { profit_pct: input.profit } : {}),
  };
  return Object.keys(fields).length === 0 ? null : fields;
}

function blankBody(input: CreateInput): OfferTemplateCreateBody {
  const description = input.description.trim();
  return {
    name: input.name,
    ...(description !== "" ? { description } : {}),
    ...(input.overhead !== null ? { overhead_pct: input.overhead } : {}),
    ...(input.profit !== null ? { profit_pct: input.profit } : {}),
  };
}

async function createFirst(deps: FlowDeps, input: CreateInput): Promise<OfferTemplateDetail> {
  const { source } = input;
  if (source.kind === "offer") {
    const description = input.description.trim();
    return deps.fromOffer({
      offer_id: source.offerId,
      rev_no: source.revNo,
      name: input.name,
      ...(description !== "" ? { description } : {}),
    });
  }
  if (source.kind === "template") return deps.copy(source.templateId, { name: input.name });
  return deps.createBlank(blankBody(input));
}

type Step = { label: string; run: (current: OfferTemplateDetail) => Promise<OfferTemplateDetail> } | null;

function followUpSteps(deps: FlowDeps, input: CreateInput, first: OfferTemplateDetail): Step[] {
  const { source } = input;
  const groupsStep: Step =
    source.kind === "blank" && source.groupNames.length > 0
      ? {
          label: STEP_LABEL.content,
          run: (current) =>
            deps.putContent(current.id, {
              groups: source.groupNames.map((name) => ({ name, items: [] })),
              expected_updated_at: current.updated_at,
            }),
        }
      : null;
  const patchFields = source.kind === "blank" ? null : diffPatch(first, input, source.kind === "template");
  const ratesStep: Step =
    patchFields === null
      ? null
      : {
          label: STEP_LABEL.rates,
          run: (current) => deps.patch(current.id, { ...patchFields, expected_updated_at: current.updated_at }),
        };
  const defaultStep: Step =
    input.makeDefault && !first.is_default
      ? { label: STEP_LABEL.default, run: (current) => deps.setDefault(current.id) }
      : null;
  return [groupsStep, ratesStep, defaultStep];
}

export async function runTemplateCreate(deps: FlowDeps, input: CreateInput): Promise<FlowResult> {
  let template: OfferTemplateDetail;
  try {
    template = await createFirst(deps, input);
  } catch (error) {
    return { template: null, failure: { created: false, message: backendErrorMessage(error) } };
  }
  for (const step of followUpSteps(deps, input, template)) {
    if (step === null) continue;
    try {
      template = await step.run(template);
    } catch (error) {
      return {
        template,
        failure: {
          created: true,
          message: `Şablon oluşturuldu ama ${step.label} uygulanamadı: ${backendErrorMessage(error)}`,
        },
      };
    }
  }
  return { template, failure: null };
}
