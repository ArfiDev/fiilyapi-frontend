import { BASE_STATUS_LABELS as INVOICE_STATUS_LABELS } from "@/components/invoices/invoice-labels";
import { RENTAL_STATUS_BADGE } from "@/components/equipment-rental/rental-labels";
import { PAYMENT_STATUS_BADGE } from "@/components/progress-payments/shared/status";
import { JOURNAL_STATUS_LABELS } from "@/components/accounting/accounting-labels";
import type { DeleteKind } from "@/lib/api/hooks/useAdminDelete";

/** Önizleme gelmeden başlıkta kullanılan tür adı (gelince `kind_label` kazanır). */
export const DELETE_KIND_FALLBACK_LABELS: Record<DeleteKind, string> = {
  site: "Şantiye",
  section: "Bölüm",
  block: "Blok",
  unit: "Ünite",
  progress_payment: "İşveren hakedişi",
  subcontractor_progress_payment: "Taşeron hakedişi",
  invoice: "Fatura",
  payment: "Ödeme / tahsilat",
  journal_entry: "Muhasebe fişi",
  financial_instrument: "Çek / senet",
};

/** "Ahmet, Mehmet +3 daha" — `count` örnek sayısını aşarsa kalan sayı eklenir. */
export function formatSamples(samples: readonly string[], count: number): string {
  if (samples.length === 0) return "—";
  const remaining = count - samples.length;
  const joined = samples.join(", ");
  return remaining > 0 ? `${joined} +${remaining} daha` : joined;
}

/** Fiş durumu Türkçesi; tanınmayan durum (şema `string`) olduğu gibi basılır. */
export function journalStatusText(status: string): string {
  if (status === "draft" || status === "posted" || status === "reversed") return JOURNAL_STATUS_LABELS[status];
  return status;
}

const STATUS_CHANGE_KIND_LABELS: Readonly<Record<string, string>> = {
  invoice: "Fatura",
  progress_payment: "İşveren hakedişi",
  subcontractor_progress_payment: "Taşeron hakedişi",
  equipment_rental_invoice: "Kira faturası",
};

/** Türün KENDİ ekranındaki durum etiket haritası (yenisi yazılmaz). */
function statusLabels(kind: string): Readonly<Record<string, string>> {
  if (kind === "invoice") return INVOICE_STATUS_LABELS;
  if (kind === "equipment_rental_invoice") {
    return Object.fromEntries(Object.entries(RENTAL_STATUS_BADGE).map(([key, badge]) => [key, badge.label]));
  }
  // İşveren + taşeron hakedişi AYNI haritayı paylaşır (`shared/status.ts`).
  return Object.fromEntries(Object.entries(PAYMENT_STATUS_BADGE).map(([key, badge]) => [key, badge.label]));
}

/**
 * "Fatura F-0007: Tahsil Edildi → Gönderildi" satırının kayıt adı. Sunucu `label`ı çoğunlukla türün
 * adını zaten taşır ("Fatura F-0007"); taşımıyorsa tür adı öne eklenir. Bilinmeyen tür ham kalır.
 */
export function statusChangeSubject(kind: string, label: string): string {
  const kindLabel = STATUS_CHANGE_KIND_LABELS[kind];
  if (kindLabel === undefined || label.startsWith(kindLabel)) return label;
  return `${kindLabel} ${label}`;
}

/** Tanınmayan durum değeri HAM döner. */
export function statusChangeStateLabel(kind: string, raw: string): string {
  return Object.entries(statusLabels(kind)).find(([key]) => key === raw)?.[1] ?? raw;
}
