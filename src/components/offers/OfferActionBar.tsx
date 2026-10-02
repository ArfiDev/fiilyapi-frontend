import { useState } from "react";

import { Button } from "@/components/ui";
import { ChevronDownIcon } from "@/components/ui/icons";
import { AnchoredPopover } from "@/components/ui/popover";
import { downloadOfferExport, type OfferExportView } from "@/lib/api/offer-export-client";
import { routes } from "@/lib/routes";
import { useFileDownload, type FileDownloadState } from "@/lib/use-file-download";

import { visibleActionReasons, type OfferAction, type OfferActionVerdict } from "./offer-actions";
import "./offers.css";
import "./offer-detail.css";

interface OfferActionBarProps {
  offerId: string;
  /** Görüntülenen revizyon — yazdırma salt okuma olduğundan eski revizyonda da açık. */
  revNo: number;
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

/** ÜS-F3-27: yazdırma sayfası; yeni sekmede açılır ki kaydedilmemiş form kaybolmasın. */
function PdfMenu({ offerId, revNo }: { offerId: string; revNo: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  const entries = [
    { kind: "isveren", label: "İşveren teklifi" },
    { kind: "ic", label: "İç döküm (maliyet + kâr)" },
  ] as const;
  return (
    <div className="offers-menu">
      <Button variant="secondary" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        PDF
        <ChevronDownIcon className="offer-revpicker__chevron" />
      </Button>
      {isOpen && (
        <AnchoredPopover label="PDF çıktısı" onClose={close} className="offers-menu__pop" escapeOverflow>
          {entries.map((entry) => (
            <a
              key={entry.kind}
              href={routes.offers.print({ offerId, rev: revNo, kind: entry.kind })}
              target="_blank"
              rel="noopener noreferrer"
              className="offers-menu__item"
              onClick={close}
            >
              {entry.label}
            </a>
          ))}
        </AnchoredPopover>
      )}
    </div>
  );
}

const EXCEL_ENTRIES: ReadonlyArray<{ view: OfferExportView; label: string }> = [
  { view: "employer", label: "İşveren teklifi (.xlsx)" },
  { view: "internal", label: "İç döküm (maliyet + kâr)" },
];

/** TKL-F4.3 · ÜS-F4-18: görüntülenen revizyonun Excel'i; yazdırma gibi salt okuma → eski revizyonda da açık. */
function ExcelMenu({ offerId, revNo, download }: { offerId: string; revNo: number; download: FileDownloadState }) {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  return (
    <div className="offers-menu">
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={download.isBusy}
        onClick={() => setIsOpen((open) => !open)}
      >
        {download.isBusy ? "İndiriliyor…" : "Excel"}
        {!download.isBusy && <ChevronDownIcon className="offer-revpicker__chevron" />}
      </Button>
      {isOpen && (
        <AnchoredPopover label="Excel çıktısı" onClose={close} className="offers-menu__pop" escapeOverflow>
          {EXCEL_ENTRIES.map((entry) => (
            <button
              key={entry.view}
              type="button"
              className="offers-menu__item"
              onClick={() => {
                close();
                void download.start(() => downloadOfferExport(offerId, revNo, entry.view));
              }}
            >
              {entry.label}
            </button>
          ))}
        </AnchoredPopover>
      )}
    </div>
  );
}

/** TD:107-116, 404-411 — eylem şeridi. Düğme durumu YALNIZ `offerActionGate`ten gelir. */
export function OfferActionBar(props: OfferActionBarProps) {
  const { gate, isBusy } = props;
  function attrs(action: OfferAction) {
    const verdict = gate[action];
    return { disabled: isBusy || !verdict.enabled, title: verdict.enabled ? undefined : verdict.reason };
  }
  const reasons = visibleActionReasons(gate);
  const download = useFileDownload();
  return (
    <div className="offer-actions">
      <div className="offer-actions__row" role="group" aria-label="Teklif eylemleri">
        <Button variant="primary" onClick={props.onSave} {...attrs("save")}>
          {props.isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
        </Button>
        <Button variant="secondary" onClick={props.onNewRevision} {...attrs("newRevision")}>
          Yeni Revizyon
        </Button>
        <PdfMenu offerId={props.offerId} revNo={props.revNo} />
        <ExcelMenu offerId={props.offerId} revNo={props.revNo} download={download} />
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
      {(download.notice ?? download.error) !== null && (
        <p className="offer-actions__why" role="status">
          {download.notice ?? download.error}
        </p>
      )}
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
