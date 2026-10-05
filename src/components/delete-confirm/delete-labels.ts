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
