import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import type { LabelValue, PrintFrame, TotalRow } from "./print-model";
import "./offer-print.css";

/**
 * TKL-F3.7 · yazdırma belgesinin İŞVEREN ve İÇ çıktıda ORTAK parçaları: başlık, künye, koşullar,
 * toplamlar, imza kutuları. 🔴 İşveren çıktısının ithal kapanışındadır (`offer-print-leak-guard`):
 * iç alan/etiket İÇERMEZ — yalnız aldığı `PrintFrame`/`TotalRow` verisini basar.
 */

export function PrintHeader({ frame }: { frame: PrintFrame }) {
  const { company } = frame;
  return (
    <header className="offer-print__header">
      <div className="offer-print__company">
        {company.logoSrc !== null ? (
          // Yazdırma belgesi: next/image optimizasyonu YOK (sabit uç, `/api/backend/company/logo`).
          // eslint-disable-next-line @next/next/no-img-element
          <img className="offer-print__logo" src={company.logoSrc} alt={company.title ?? ""} />
        ) : (
          company.title !== null && <h2 className="offer-print__company-name">{company.title}</h2>
        )}
        {company.lines.map((line) => (
          <p key={line} className="offer-print__company-line">
            {line}
          </p>
        ))}
      </div>
      <div className="offer-print__heading">
        <h1 className="offer-print__title">Teklif</h1>
        <p className="offer-print__number">{frame.heading}</p>
      </div>
    </header>
  );
}

export function PrintKunye({ rows }: { rows: readonly LabelValue[] }) {
  return (
    <dl className="offer-print__kunye">
      {rows.map((row) => (
        <div key={row.label} className="offer-print__kunye-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** İlk sayfa dışındaki sayfalarda küçük bağlam satırı (teklif no · işveren). */
export function PrintRunningHead({ frame }: { frame: PrintFrame }) {
  const employer = frame.kunye.find((row) => row.label === "İşveren")?.value;
  return (
    <p className="offer-print__running-head">
      {frame.heading}
      {employer !== undefined && ` · ${employer}`}
    </p>
  );
}

export function PrintTerms({ rows }: { rows: readonly LabelValue[] }) {
  return (
    <section className="offer-print__terms" aria-label="Koşullar">
      <h3 className="offer-print__block-title">Koşullar</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="offer-print__term">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PrintTotals({ rows }: { rows: readonly TotalRow[] }) {
  return (
    <dl className="offer-print__totals">
      {rows.map((row) => (
        <div key={row.label} className={cx("offer-print__total", row.tone !== undefined && `offer-print__total--${row.tone}`)}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PrintSignatures({ signatures }: { signatures: PrintFrame["signatures"] }) {
  return (
    <div className="offer-print__signatures">
      {signatures.map((signature) => (
        <section key={signature.role} className="offer-print__signature" aria-label={signature.role}>
          <h3 className="offer-print__block-title">{signature.role}</h3>
          {signature.name !== null && <p className="offer-print__signature-name">{signature.name}</p>}
          <div className="offer-print__signature-lines" aria-hidden="true">
            <span>Ad-soyad</span>
            <span>İmza</span>
            <span>Tarih</span>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Tablo gövdesinde `colSpan`lı tek hücrelik satır (grup başlığı / devam işareti). */
export function PrintSpanRow({ columns, children, className }: { columns: number; children: ReactNode; className: string }) {
  return (
    <tr className={className}>
      <td colSpan={columns}>{children}</td>
    </tr>
  );
}
