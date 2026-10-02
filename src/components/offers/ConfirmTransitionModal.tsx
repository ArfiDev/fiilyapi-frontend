import { ConfirmDialog } from "@/components/settings/ConfirmDialog";

export type ConfirmTransitionKind = "send" | "win" | "withdraw";

interface ConfirmTransitionModalProps {
  kind: ConfirmTransitionKind;
  offerNo: string;
  revNo: number;
  /** `send` için: fiyatı girilmemiş kalem sayısı (onay yalnız > 0 iken sorulur). */
  unpricedCount: number;
  isPending: boolean;
  errorText: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

interface Copy {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

/** Metinler plan §4.2 / ÜS-F3-21 / ÜS-F3-4 (onaylı varsayılanlar). */
function copyFor(props: ConfirmTransitionModalProps): Copy {
  switch (props.kind) {
    case "send":
      return {
        title: "Gönderildi olarak işaretle",
        message: `${props.unpricedCount} kalemde fiyat yok; tutara dahil değil. Yine de gönderildi işaretlensin mi?`,
        confirmLabel: "Gönderildi İşaretle",
        danger: false,
      };
    case "win":
      return {
        title: "Kazanıldı olarak işaretle",
        message: `${props.offerNo} Rev.${props.revNo} kazanıldı olarak işaretlensin mi? Bu revizyon kesinleşir; projeye dönüştürme sonra yapılır.`,
        confirmLabel: "Kazanıldı",
        danger: false,
      };
    case "withdraw":
      return {
        title: "Vazgeçildi olarak işaretle",
        message: "Teklif vazgeçildi olarak kapanır; yeni revizyon açılamaz.",
        confirmLabel: "Vazgeçildi",
        danger: true,
      };
  }
}

/** Gönderildi (yalnız fiyatsız kalem varken) · Kazanıldı · Vazgeçildi onay penceresi. */
export function ConfirmTransitionModal(props: ConfirmTransitionModalProps) {
  const copy = copyFor(props);
  return (
    <ConfirmDialog
      title={copy.title}
      message={copy.message}
      confirmLabel={props.isPending ? "İşleniyor…" : copy.confirmLabel}
      danger={copy.danger}
      isPending={props.isPending}
      errorText={props.errorText}
      onConfirm={props.onConfirm}
      onClose={props.onClose}
    />
  );
}
