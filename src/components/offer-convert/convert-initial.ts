/**
 * TKL-F5.3 · Adım 1'in BAŞLANGIÇ formu (SAF). Plan §10: ÜS-F5-8 (il boş) · ÜS-F5-9 (fiyat farkı: teklif TÜİK ise AÇIK +
 * endeks tekliften, D0 boş zorunlu; sabit ise KAPALI) · ÜS-F5-10 (tarihler) · ÜS-F5-11 (şantiye açık).
 */
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { durationDays } from "@/lib/form/derive";

import type { ConvertForm } from "./convert-types";

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
const TUIK_ESCALATION = "tuik";

/** `YYYY-MM-DD` + gün (UTC takvim aritmetiği); geçersiz tarih → null. */
export function addCalendarDays(iso: string, days: number): string | null {
  if (durationDays(iso, iso) === null) return null;
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return moved.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Bitiş = başlangıç + teslim süresi − 1 (süre uç-dahildir: 420 gün = 420 takvim günü); süre yoksa boş. */
function defaultEndDate(start: string, deliveryDays: number | null): string {
  if (deliveryDays === null || deliveryDays < 1) return "";
  return addCalendarDays(start, deliveryDays - 1) ?? "";
}

export interface InitialConvertFormInput {
  /** Teklif başlığı = proje adı. */
  title: string;
  /** SON (kazanılmış) revizyon. */
  revision: OfferRevisionRead;
  /** İstanbul bugünü (`YYYY-MM-DD`). */
  today: string;
}

export function initialConvertForm({ title, revision, today }: InitialConvertFormInput): ConvertForm {
  const hasEscalation = revision.price_escalation === TUIK_ESCALATION;
  return {
    projectName: title,
    projectCode: "",
    city: "",
    contractNo: "",
    signatureDate: today,
    startDate: today,
    endDate: defaultEndDate(today, revision.delivery_days),
    hasPriceEscalation: hasEscalation,
    indexType: hasEscalation ? (revision.price_index_type ?? "") : "",
    baseIndexValue: "",
    openSite: true,
    siteName: "",
  };
}
