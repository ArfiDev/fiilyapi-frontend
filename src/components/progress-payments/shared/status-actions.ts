import type { PaymentLifecycleStatus } from "./status";

/** Durum aksiyon butonlarının türleri — İşveren (`ProgressPaymentStatusActions`)
 * ve Taşeron tarafının ORTAK kümesi (F-TH T1 §4 paylaşım kararı). */
export type PaymentActionKind = "submit" | "reject" | "approve" | "unapprove" | "markPaid";

/**
 * IZN-F6b · sayfa izni kararları (`useButtonGate`) — ZORUNLU.
 * Gönder = hakediş sayfaları Düzenler · Onayla/Reddet/Ödendi = hakediş Onaylar · Onayı Geri Al = yalnız SA.
 */
export interface PaymentActionGates {
  canSubmit: boolean;
  canApprove: boolean;
  canUnapprove: boolean;
}

/**
 * Durum + sayfa izin kapıları → izinli aksiyon kümesi. `ProgressPaymentStatusActions.tsx`
 * (P7 T4) içindeki koşullardan çıkarıldı — backend `transitions.py` §7
 * tablosunun görünürlük yansıması. Güvenlik sınırı HER ZAMAN backend'dedir;
 * bu yalnız çalışmayacak butonu göstermemek içindir.
 *
 * draft → submit (canSubmit) · pending_approval → reject+approve (canApprove) ·
 * approved → unapprove (canUnapprove) + markPaid (canApprove) · paid → (boş).
 */
export function permittedPaymentActions(
  status: PaymentLifecycleStatus,
  gates: PaymentActionGates,
): PaymentActionKind[] {
  const { canSubmit, canApprove, canUnapprove } = gates;
  switch (status) {
    case "draft":
      return canSubmit ? ["submit"] : [];
    case "pending_approval":
      return canApprove ? ["reject", "approve"] : [];
    case "approved": {
      const actions: PaymentActionKind[] = [];
      if (canUnapprove) actions.push("unapprove");
      if (canApprove) actions.push("markPaid");
      return actions;
    }
    case "paid":
      return [];
  }
}
