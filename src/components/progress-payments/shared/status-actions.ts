import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";

import type { PaymentLifecycleStatus } from "./status";

/** Durum aksiyon butonlarının türleri — İşveren (`ProgressPaymentStatusActions`)
 * ve Taşeron tarafının ORTAK kümesi (F-TH T1 §4 paylaşım kararı). */
export type PaymentActionKind = "submit" | "reject" | "approve" | "unapprove" | "markPaid";

/**
 * IZN-F2.x · sayfa izni kararları (`useButtonGate`): verilen kapı seviye eşiğinin YERİNE geçer.
 * Gönder = hakediş sayfaları Düzenler · Onayla/Reddet/Ödendi = hakediş Onaylar · Onayı Geri Al = yalnız SA.
 */
export interface PaymentActionGates {
  canSubmit?: boolean;
  canApprove?: boolean;
  canUnapprove?: boolean;
}

/**
 * Durum + izin seviyesi → izinli aksiyon kümesi. `ProgressPaymentStatusActions.tsx`
 * (P7 T4) içindeki koşullardan çıkarıldı — backend `transitions.py` §7
 * tablosunun görünürlük yansıması. Güvenlik sınırı HER ZAMAN backend'dedir;
 * bu yalnız çalışmayacak butonu göstermemek içindir.
 *
 * draft → submit (≥draft) · pending_approval → reject+approve (≥approve) ·
 * approved → unapprove (≥admin) + markPaid (≥approve) · paid → (boş).
 */
export function permittedPaymentActions(
  status: PaymentLifecycleStatus,
  level: AccessLevel | undefined,
  gates: PaymentActionGates = {},
): PaymentActionKind[] {
  const canSubmit = gates.canSubmit ?? hasAtLeast(level, "draft");
  const canApprove = gates.canApprove ?? hasAtLeast(level, "approve");
  const canUnapprove = gates.canUnapprove ?? hasAtLeast(level, "admin");
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
