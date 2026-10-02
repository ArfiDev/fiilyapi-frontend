import type { OfferListItem, OfferRevisionRead, OfferSettingsRead } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { EMPTY_CELL } from "@/lib/format";

import { pctToInputText, type OfferFormValues } from "./offer-form";
import { formatLiraFixed } from "./offer-list-model";

/**
 * TKL-F4.7 · Yeni teklifin "Nereden başlansın?" modeli (TKL-F4-PLAN §4) — SAF, bileşenden bağımsız.
 *
 * ORAN/KOŞUL ÖNCELİĞİ (backend `create_offer_with_origin`): gövde ?? şablon ?? ayar (şablon) ·
 * gövde ?? kaynak revizyon (kopya). F3 formu oranları HER ZAMAN açık gönderdiği için seçim anında form
 * alanları şablon/kaynak değeriyle DOLDURULUR; yoksa şablon/kaynak oranı sessizce ezilirdi (risk 2, K-F4-3).
 *
 * ELLE GİRİLEN DEĞER KURALI (GECE KURALI varsayılanı): şablon/kaynak DEĞİŞİNCE oranlar yeniden doldurulur
 * (kullanıcının elle yazdığını da ezer); AYNI seçime tekrar tıklamak doldurmaz. Künye (işveren, iş adı,
 * kapsam, teklif tarihi) şablondan etkilenmez.
 */
export type OfferStartKind = "blank" | "template" | "copy";

/** Denetimli başlangıç seçimi (`OfferStartChoice`). */
export type OfferStart =
  | { kind: "blank" }
  | { kind: "template"; templateId: string }
  | { kind: "copy"; offerId: string; revNo: number };

/**
 * Gövde kurulurken kopya, kaynağın fiyat farkını da taşır: sabit `fixed` gönderimi (K-F3-5) kaynağın TÜİK'ini
 * ezerdi → kaynaktan AÇIKÇA gider.
 */
export type OfferBodyStart =
  | { kind: "blank" }
  | { kind: "template"; templateId: string }
  | {
      kind: "copy";
      offerId: string;
      revNo: number;
      priceEscalation: OfferRevisionRead["price_escalation"];
      priceIndexType: OfferRevisionRead["price_index_type"];
    };

/** Önseçim: istenen kimlik (URL/önceki seçim) → varsayılan şablon → listenin ilki → yok. */
export function pickTemplate(
  templates: readonly OfferTemplateListItem[],
  requestedId: string | null,
): OfferTemplateListItem | null {
  return (
    templates.find((entry) => entry.id === requestedId) ??
    templates.find((entry) => entry.is_default) ??
    templates[0] ??
    null
  );
}

/** Şablon ?? ayar: GG/Kâr (şablon boş oranı ayardan düşer); geçerlilik/KDV ve künye dokunulmaz. */
export function conditionsFromTemplate(
  values: OfferFormValues,
  template: Pick<OfferTemplateListItem, "overhead_pct" | "profit_pct">,
  settings: OfferSettingsRead,
): OfferFormValues {
  return {
    ...values,
    overheadPct: pctToInputText(template.overhead_pct ?? settings.default_overhead_pct),
    profitPct: pctToInputText(template.profit_pct ?? settings.default_profit_pct),
  };
}

/** Kaynak revizyonun koşulları: geçerlilik + GG + kâr + KDV. */
export function conditionsFromRevision(
  values: OfferFormValues,
  revision: Pick<OfferRevisionRead, "validity_days" | "overhead_pct" | "profit_pct" | "vat_pct">,
): OfferFormValues {
  return {
    ...values,
    validityDays: String(revision.validity_days),
    overheadPct: pctToInputText(revision.overhead_pct),
    profitPct: pctToInputText(revision.profit_pct),
    vatPct: pctToInputText(revision.vat_pct),
  };
}

/** Boş teklife dönüş: koşullar ayarda (geçerlilik + GG + kâr + KDV); künye korunur. */
export function conditionsFromSettings(values: OfferFormValues, settings: OfferSettingsRead): OfferFormValues {
  return {
    ...values,
    validityDays: String(settings.default_validity_days),
    overheadPct: pctToInputText(settings.default_overhead_pct),
    profitPct: pctToInputText(settings.default_profit_pct),
    vatPct: pctToInputText(settings.default_vat_pct),
  };
}

/** Kopya seçilince künye satırdan gelir (işveren, iş adı, kapsam özeti); koşullar kaynak REVİZYONDAN (ayrı doldurulur). */
export function kunyeFromOffer(
  values: OfferFormValues,
  offer: Pick<OfferListItem, "employer_id" | "title" | "scope_summary">,
): OfferFormValues {
  return {
    ...values,
    employerId: offer.employer_id,
    title: offer.title,
    scopeSummary: offer.scope_summary ?? "",
  };
}

/** Şablon/kopya henüz seçilmediğinde özet satırı ("Şablon · —"). */
export function pendingStartLabel(kind: Exclude<OfferStartKind, "blank">): string {
  return `${kind === "template" ? "Şablon" : "Kopya"} · ${EMPTY_CELL}`;
}

/** TY startLbl — özet kartı "Başlangıç" satırı. `label` = şablon adı ya da kaynak teklif no. */
export function startSummaryLabel(start: OfferStart, label: string | null): string {
  if (start.kind === "blank") return "Boş teklif";
  if (start.kind === "template") return `Şablon · ${label ?? EMPTY_CELL}`;
  return `Kopya · ${label ?? EMPTY_CELL} Rev.${start.revNo}`;
}

const MILLION = 1_000_000;
const COMPACT_FRACTION_DIGITS = 1;
const COMPACT_FORMAT = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: COMPACT_FRACTION_DIGITS });

/** TY:96-108 — kopya listesi tutarı: "₺48,8 M"; maskeli "—"; milyonun altı tam tutar. */
export function formatCompactNet(net: string | null): string {
  if (net === null) return EMPTY_CELL;
  const value = Number(net);
  if (!Number.isFinite(value) || Math.abs(value) < MILLION) return formatLiraFixed(net);
  return `₺${COMPACT_FORMAT.format(value / MILLION)} M`;
}
