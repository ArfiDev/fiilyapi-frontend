import { Button } from "@/components/ui";

import { visibleActionReasons, type OfferAction, type OfferActionVerdict } from "./offer-actions";
import "./offer-detail.css";

const PDF_SOON_TITLE = "Yakında · PDF çıktısı sonraki sürümde açılacak";
const EXCEL_SOON_TITLE = "Yakında · Excel desteği sonraki sürümde açılacak";

interface OfferActionBarProps {
  gate: Record<OfferAction, OfferActionVerdict>;
  /** Herhangi bir geçiş/kayıt uçuyor → TÜM eylemler kilitli (tek uçuş). */
  isBusy: boolean;
  isSaving: boolean;
  onSave: () => void;
  onNewRevision: () => void;
  onSend: () => void;
  onWin: () => void;
  onLose: () => void;
  onWithdraw: () => void;
}

/** TD:107-116, 404-411 — eylem şeridi. Düğme durumu YALNIZ `offerActionGate`ten gelir. */
export function OfferActionBar(props: OfferActionBarProps) {
  const { gate, isBusy } = props;
  function attrs(action: OfferAction) {
    const verdict = gate[action];
    return { disabled: isBusy || !verdict.enabled, title: verdict.enabled ? undefined : verdict.reason };
  }
  const reasons = visibleActionReasons(gate);
  return (
    <div className="offer-actions">
      <div className="offer-actions__row" role="group" aria-label="Teklif eylemleri">
        <Button variant="primary" onClick={props.onSave} {...attrs("save")}>
          {props.isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
        </Button>
        <Button variant="secondary" onClick={props.onNewRevision} {...attrs("newRevision")}>
          Yeni Revizyon
        </Button>
        <Button variant="secondary" disabled title={PDF_SOON_TITLE}>
          PDF
        </Button>
        <Button variant="secondary" disabled title={EXCEL_SOON_TITLE}>
          Excel
        </Button>
        <span className="offer-actions__sep" aria-hidden="true" />
        <Button variant="secondary" onClick={props.onSend} {...attrs("send")}>
          Gönderildi İşaretle
        </Button>
        <Button variant="success" onClick={props.onWin} {...attrs("win")}>
          Kazanıldı…
        </Button>
        <Button variant="danger" onClick={props.onLose} {...attrs("lose")}>
          Kaybedildi
        </Button>
        <Button variant="ghost" onClick={props.onWithdraw} {...attrs("withdraw")}>
          Vazgeçildi…
        </Button>
      </div>
      {reasons.length > 0 && (
        <ul className="offer-actions__why" aria-label="Kapalı eylemlerin gerekçesi">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
