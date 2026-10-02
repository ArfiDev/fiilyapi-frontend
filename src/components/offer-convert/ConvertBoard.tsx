"use client";

import Link from "next/link";
import { useState } from "react";

import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { routes } from "@/lib/routes";

import { ConvertCatalogPickerHost } from "./ConvertCatalogPickerHost";
import { ConvertConfirmStep } from "./ConvertConfirmStep";
import { ConvertDoneBand } from "./ConvertDoneBand";
import { ConvertErrorBand } from "./ConvertErrorBand";
import { ConvertFooter } from "./ConvertFooter";
import { ConvertItemsStep } from "./ConvertItemsStep";
import { ConvertProjectStep } from "./ConvertProjectStep";
import { ConvertStepper } from "./ConvertStepper";
import { useConvertBoard, type ConvertMutation } from "./useConvertBoard";
import "./offer-convert.css";

interface ConvertBoardProps {
  detail: OfferDetailRead;
  revision: OfferRevisionRead;
  catalogItems: readonly WorkItemRead[];
  disciplines: readonly WorkDisciplineRead[];
  convert: ConvertMutation;
}

/** TDN:67-181 — başlık + adım çubuğu + güncel adım + bantlar + alt şerit. */
export function ConvertBoard({ detail, revision, catalogItems, disciplines, convert }: ConvertBoardProps) {
  const board = useConvertBoard({ detail, revision, catalogItems, convert });
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  return (
    <div className="convert">
      <header className="convert-head">
        <div className="convert-head__main">
          <div className="convert-head__titlerow">
            <h1 className="convert-head__title">Proje ve Sözleşmeye Dönüştür</h1>
            <span className="convert-chip">Kazanıldı</span>
          </div>
          <p className="convert-head__ref">
            <span className="convert-head__refno">
              {detail.offer_no} Rev.{revision.rev_no}
            </span>{" "}
            · {detail.title} · {detail.employer_name}
          </p>
        </div>
        <Link href={routes.offers.detail({ offerId: detail.id })} className="btn btn--secondary btn--md">
          Vazgeç, teklife dön
        </Link>
      </header>
      <ConvertStepper step={board.step} isDone={board.isDone} isLocked={board.isBusy} onStep={board.goTo} />
      {board.step === 1 && (
        <ConvertProjectStep
          form={board.form}
          errors={board.visible1}
          employerName={detail.employer_name}
          isDatesFromOffer={board.isDatesFromOffer}
          onChange={board.changeForm}
        />
      )}
      {board.step === 2 && (
        <ConvertItemsStep
          draft={board.draft}
          summary={board.summary}
          revNo={revision.rev_no}
          vatPct={revision.vat_pct}
          errors={board.visible2}
          isSiteOpen={board.form.openSite}
          disciplines={disciplines}
          isLocked={board.isBusy || board.isDone}
          onOpenCatalog={() => setIsCatalogOpen(true)}
          actions={board.actions}
        />
      )}
      {board.step === 2 && isCatalogOpen && !board.isBusy && !board.isDone && (
        <ConvertCatalogPickerHost
          draft={board.draft}
          contextLabel={`${detail.offer_no} Rev.${revision.rev_no}`}
          onAdd={board.actions.onAddCatalog}
          onClose={() => setIsCatalogOpen(false)}
        />
      )}
      {board.step === 3 && <ConvertConfirmStep form={board.form} summary={board.summary} employerName={detail.employer_name} />}
      {convert.data !== undefined && convert.variables !== undefined && board.isDone && (
        <ConvertDoneBand response={convert.data} projectName={convert.variables.project.name} contractNo={convert.variables.contract.contract_no} offerNo={detail.offer_no} />
      )}
      {board.failure !== null && <ConvertErrorBand failure={board.failure} onRetry={board.retry} />}
      <ConvertFooter
        step={board.step}
        note={board.footerNote}
        isBusy={board.isBusy}
        isDone={board.isDone}
        onBack={board.back}
        onNext={board.next}
        onCreate={board.create}
      />
    </div>
  );
}
