"use client";

import Link from "next/link";

import { CheckIcon } from "@/components/ui/icons";
import type { OfferConvertResponse } from "@/lib/api/hooks/useOfferMutations";
import { routes } from "@/lib/routes";

import "./offer-convert.css";

interface ConvertDoneBandProps {
  response: OfferConvertResponse;
  projectName: string;
  contractNo: string;
  offerNo: string;
}

const NO_SITE_HINT = "Şantiye açılınca Planlama › Adam-saat bütçesi'nde 'Sözleşmeden doldur' ile oranlar aktarılır";

/** TDN:165-171 — yeşil başarı bandı + "Sözleşmeyi aç →" (+ şantiye açıldıysa "Adam-saat bütçesi →") + uyarılar madde madde (ÜS-F5-22). */
export function ConvertDoneBand({ response, projectName, contractNo, offerNo }: ConvertDoneBandProps) {
  return (
    <div className="convert-done" data-testid="convert-done" role="status" aria-live="polite">
      <span className="convert-done__tick" aria-hidden="true">
        <CheckIcon width={11} height={11} />
      </span>
      <p className="convert-done__text">
        <b>
          {response.project_code} · {projectName}
        </b>{" "}
        ve <b className="convert-done__mono">{contractNo}</b> oluşturuldu. {offerNo} arşive alındı.
      </p>
      <div className="convert-done__links">
        <Link href={routes.contracts.employerDetail({ projectId: response.project_id })}>Sözleşmeyi aç →</Link>
        {response.site_id !== null && response.site_id !== undefined && (
          <Link href={routes.planning.budget({ site: response.site_id })}>Adam-saat bütçesi →</Link>
        )}
      </div>
      {response.warnings.length > 0 && (
        <ul className="convert-done__more">
          {response.warnings.map((warning) => (
            <li key={`${warning.code}:${warning.group_name ?? ""}:${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      )}
      {(response.site_id === null || response.site_id === undefined) && <p className="convert-done__hint">{NO_SITE_HINT}</p>}
    </div>
  );
}
