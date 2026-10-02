import { missingFieldsText, pctToInputText } from "@/components/offers/offer-form";
import type { OfferListItem } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";

import type { CreateInput } from "./template-create-flow";
import { parseTemplateRates, type RateField } from "./template-rates";

/**
 * TKL-F4.5 · "Yeni Şablon" modalı form modeli (SAF; TS:277-302). Hesaplanan değerler (ilk teklif/şablon seçimi,
 * ayar oranları) DURUMA yazılmaz, `checkCreateForm`/`effective*` ile TÜRETİLİR.
 */

export const NAME_MAX_LENGTH = 80;
export const MSG_NAME_REQUIRED = "Şablon adı zorunlu";
/** GECE KURALI: kaynak liste boşken (mockup'ta yok). */
export const MSG_SOURCE_REQUIRED = "Kaynak seçin";

export type SourceKind = "blank" | "offer" | "template";

export interface CreateFormState {
  name: string;
  description: string;
  source: SourceKind;
  /** `null` = seçilmedi → listenin ilki (TS: mockup ilk teklifi/şablonu önseçer). */
  offerId: string | null;
  templateId: string | null;
  /** Başlangıç grupları = seçilen katalog disiplin kimlikleri (ÜS-F4-8). */
  groupIds: readonly string[];
  /** `null` = dokunulmadı → ayar varsayılanı; `""` = bilerek boş (oran yok). */
  overhead: string | null;
  profit: string | null;
  makeDefault: boolean;
}

export interface RateDefaultTexts {
  overhead: string;
  profit: string;
}

export interface CreateContext {
  offers: readonly OfferListItem[];
  templates: readonly OfferTemplateListItem[];
  disciplines: readonly { id: string; name: string }[];
}

export type FormErrors = Partial<Record<RateField | "name" | "source", string>>;
export type FormCheck =
  | { ok: true; input: CreateInput; toast: string }
  | { ok: false; errors: FormErrors; count: number };

export function initialCreateForm(source: SourceKind): CreateFormState {
  return {
    name: "",
    description: "",
    source,
    offerId: null,
    templateId: null,
    groupIds: [],
    overhead: null,
    profit: null,
    makeDefault: false,
  };
}

function rateText(pct: string | null): string {
  return pct === null ? "" : pctToInputText(pct);
}

/** Kaynak türünü değiştirir; "Şablondan kopyala" seçilen şablonun oranlarını forma getirir. */
export function switchSource(
  state: CreateFormState,
  kind: SourceKind,
  context: CreateContext,
  templateId?: string,
): CreateFormState {
  if (kind !== "template") return { ...state, source: kind };
  const target = context.templates.find((t) => t.id === (templateId ?? state.templateId ?? context.templates[0]?.id));
  if (target === undefined) return { ...state, source: kind };
  return {
    ...state,
    source: kind,
    templateId: target.id,
    overhead: rateText(target.overhead_pct),
    profit: rateText(target.profit_pct),
  };
}

export function effectiveRates(state: CreateFormState, defaults: RateDefaultTexts): RateDefaultTexts {
  return { overhead: state.overhead ?? defaults.overhead, profit: state.profit ?? defaults.profit };
}

function resolveOffer(state: CreateFormState, context: CreateContext): OfferListItem | undefined {
  return context.offers.find((o) => o.id === state.offerId) ?? context.offers[0];
}

export function resolveTemplate(state: CreateFormState, context: CreateContext): OfferTemplateListItem | undefined {
  return context.templates.find((t) => t.id === state.templateId) ?? context.templates[0];
}

function buildSource(state: CreateFormState, context: CreateContext): CreateInput["source"] | null {
  if (state.source === "offer") {
    const offer = resolveOffer(state, context);
    return offer === undefined ? null : { kind: "offer", offerId: offer.id, revNo: offer.rev_no, offerNo: offer.offer_no };
  }
  if (state.source === "template") {
    const template = resolveTemplate(state, context);
    return template === undefined ? null : { kind: "template", templateId: template.id };
  }
  // Seçim SIRASI korunur (mockup `grps.concat`): ilk tıklanan A olur.
  const names = state.groupIds.flatMap((id) => context.disciplines.find((d) => d.id === id)?.name ?? []);
  return { kind: "blank", groupNames: names };
}

function toastFor(name: string, source: CreateInput["source"]): string {
  return source.kind === "offer"
    ? `${source.offerNo} kalemlerinden şablon oluşturuldu · miktarlar alınmadı`
    : `${name} şablonu oluşturuldu`;
}

export function checkCreateForm(state: CreateFormState, context: CreateContext, defaults: RateDefaultTexts): FormCheck {
  const rates = effectiveRates(state, defaults);
  const parsed = parseTemplateRates(rates.overhead, rates.profit);
  const source = buildSource(state, context);
  const name = state.name.trim();
  const errors: FormErrors = {
    ...(name === "" ? { name: MSG_NAME_REQUIRED } : {}),
    ...(parsed.ok ? {} : parsed.errors),
    ...(source === null ? { source: MSG_SOURCE_REQUIRED } : {}),
  };
  const count = Object.keys(errors).length;
  if (count > 0 || !parsed.ok || source === null) return { ok: false, errors, count };
  const input: CreateInput = {
    name,
    description: state.description,
    overhead: parsed.overhead,
    profit: parsed.profit,
    makeDefault: state.makeDefault,
    source,
  };
  return { ok: true, input, toast: toastFor(name, source) };
}

export { missingFieldsText };

/** TS:285 "Oluşacak şablon: N grup · M kalem · GG %a · Kâr %b" (teklif kaynağında sayı bilinmez → yalnız oranlar). */
export function previewText(state: CreateFormState, context: CreateContext, defaults: RateDefaultTexts): string {
  const rates = effectiveRates(state, defaults);
  const ratePart = `GG %${rates.overhead} · Kâr %${rates.profit}`;
  if (state.source === "offer") return ratePart;
  if (state.source === "template") {
    const template = resolveTemplate(state, context);
    return template === undefined ? ratePart : `${template.group_count} grup · ${template.item_count} kalem · ${ratePart}`;
  }
  const groups = context.disciplines.filter((d) => state.groupIds.includes(d.id)).length;
  return `${groups} grup · 0 kalem · ${ratePart}`;
}
