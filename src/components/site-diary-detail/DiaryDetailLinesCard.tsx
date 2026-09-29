import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { ArrowRightIcon, ClockIcon } from "@/components/ui/icons";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { formatCurrency, formatCurrencyTight } from "@/lib/format";

import type { DiaryDetailLineColumns } from "./detail-extension";
import {
  DetailLineRowView,
  EmptyLinesBody,
  SeparatorRow,
  SubtotalRow,
  type LineTableShape,
} from "./DiaryDetailLineRows";
import type { DetailLineGroups } from "./lines-derive";

/**
 * DET-1.3 · "📋 Yapılan Miktarlar" — mockup 299-404 (İ:209-261 + İ-EK:209-357).
 *
 * Tam genişlik, SALT OKUNUR (giriş kutusu, "+ Bölüm", × yok — İ-EK hâl d).
 * Kural A: "Bu bölüm" grubu + ara toplam ÖNCE, "Diğer bölümler · aynı gün"
 * SOLUK ve AÇIK sonra (S5); altta günün toplamı (uzantı) ve "Bugünkü Hakediş
 * Katkısı" (K16). S10: hakediş izni yoksa ₺ kolonu/katkı/bant BASILMAZ.
 * Planlama kolonları (§2.7) `columns` yuvasından gelir, Hakediş ₺'den önce.
 */
export interface DiaryDetailLinesCardProps {
  groups: DetailLineGroups;
  columns: DiaryDetailLineColumns | null;
  /** Kart başlığı altı şerit (hâl i). */
  notice: ReactNode;
  isPaymentHidden: boolean;
  /** "Hakediş Durumu →" — şantiyenin Hakedişler sekmesi. */
  paymentsHref: string;
}

/** Çekirdek kolonlar ve genişlikleri (mockup .qh: ad min 140 · 44 · 72 · 84 · 76 · 72 · … · 88). */
const CORE_HEADERS = [
  { key: "name", label: "Kalem / bölüm", width: 0 },
  { key: "unit", label: "Birim", width: 44 },
  { key: "today", label: "Bugün", width: 72 },
  { key: "cumulative", label: "Kümülatif", width: 84 },
  { key: "planned", label: "Planlı", width: 76 },
  { key: "remaining", label: "Kalan", width: 72 },
] as const;
const NAME_MIN_WIDTH = 140;
const AMOUNT_WIDTH = 88;

function caption(groups: DetailLineGroups, suffix: string | undefined): string {
  const base =
    groups.current === null
      ? "Kalem × bölüm"
      : `Kalem × bölüm · önce bu bölüm (${groups.current.sectionName}), sonra günün diğer bölümleri`;
  return suffix === undefined ? base : `${base} · ${suffix}`;
}

function TableHead({ columns, isPaymentHidden }: { columns: DiaryDetailLineColumns | null; isPaymentHidden: boolean }) {
  return (
    <>
      <colgroup>
        {CORE_HEADERS.map((header) => (
          <col key={header.key} style={header.width === 0 ? undefined : { width: header.width }} />
        ))}
        {columns?.headers.map((header) => <col key={header.key} style={{ width: header.width }} />)}
        {!isPaymentHidden && <col style={{ width: AMOUNT_WIDTH }} />}
      </colgroup>
      <thead>
        <tr>
          {CORE_HEADERS.map((header) => (
            <th key={header.key} scope="col" className={`diary-detail-lines__th diary-detail-lines__th--${header.key}`}>
              {header.label}
            </th>
          ))}
          {columns?.headers.map((header) => (
            <th key={header.key} scope="col" className="diary-detail-lines__th diary-detail-lines__th--ext">
              {header.label}
            </th>
          ))}
          {!isPaymentHidden && (
            <th scope="col" className="diary-detail-lines__th diary-detail-lines__th--amount">
              Hakediş ₺
            </th>
          )}
        </tr>
      </thead>
    </>
  );
}

function TableBody({ groups, shape }: { groups: DetailLineGroups; shape: LineTableShape }) {
  const span = shape.columnCount;
  const { current, others } = groups;
  return (
    <tbody>
      {current !== null && (
        <>
          <SeparatorRow span={span} isCurrent>{`Bu bölüm · ${current.sectionName} · ${current.rows.length} satır`}</SeparatorRow>
          {current.rows.length === 0 ? (
            <tr>
              <td colSpan={span}>
                <EmptyLinesBody />
              </td>
            </tr>
          ) : (
            <>
              {current.rows.map((row) => (
                <DetailLineRowView key={row.lineId} row={row} shape={shape} isOther={false} />
              ))}
              <SubtotalRow sectionId={current.sectionId} sectionName={current.sectionName} amountTotal={current.amountTotal} shape={shape} />
            </>
          )}
          {others.length > 0 && (
            <SeparatorRow span={span} isCurrent={false}>{`Diğer bölümler · aynı gün · ${others.length} satır`}</SeparatorRow>
          )}
        </>
      )}
      {others.map((row) => (
        <DetailLineRowView key={row.lineId} row={row} shape={shape} isOther={current !== null} />
      ))}
    </tbody>
  );
}

function TableFoot({ groups, shape }: { groups: DetailLineGroups; shape: LineTableShape }) {
  const dayTotal = shape.columns?.dayTotal ?? null;
  const note =
    groups.current === null
      ? "· tüm bölümler"
      : `· bu bölüm ${formatCurrencyTight(groups.current.amountTotal)} · tüm bölümler`;
  return (
    <tfoot>
      {/* 387-393 — İ:249-253 günün toplam kazanılmış satırı (uzantı) */}
      {dayTotal !== null && (
        <tr className="diary-detail-lines__day-total">
          <th scope="row" colSpan={CORE_HEADERS.length}>
            {dayTotal.label}
          </th>
          {dayTotal.cells.map((cell, index) => (
            <td key={shape.columns?.headers[index]?.key ?? index} className="diary-detail-lines__ext">
              {cell}
            </td>
          ))}
          {!shape.isPaymentHidden && <td />}
        </tr>
      )}
      {/* 395 — İ-EK:354 ← GK:254-258 "Bugünkü Hakediş Katkısı" (K16) */}
      {!shape.isPaymentHidden && (
        <tr className="diary-detail-lines__payment">
          <th scope="row" colSpan={shape.columnCount - 1}>
            Bugünkü Hakediş Katkısı{" "}
            <span className="diary-detail-lines__payment-note">{note}</span>
          </th>
          <td className="diary-detail-lines__payment-value">{formatCurrency(groups.dayAmountTotal)}</td>
        </tr>
      )}
    </tfoot>
  );
}

/** 398-403 — İ:256-260 hakediş bilgi bandı. "#5" sabit numara BASILMAZ (günlük ekranı emsali). */
function PaymentBand({ href }: { href: string }) {
  return (
    <div className="diary-detail-lines__band">
      <ClockIcon className="diary-detail-lines__band-icon" aria-hidden="true" />
      <span className="diary-detail-lines__band-text">
        Bu miktarlar ay sonunda <strong>işveren hakedişine</strong> ve ilgili <strong>taşeron hakedişlerine</strong>{" "}
        işlenir.
      </span>
      <Link className="diary-detail-lines__band-link" href={href}>
        Hakediş Durumu
        <ArrowRightIcon aria-hidden="true" />
      </Link>
    </div>
  );
}

export function DiaryDetailLinesCard({ groups, columns, notice, isPaymentHidden, paymentsHref }: DiaryDetailLinesCardProps) {
  const extraWidth = (columns?.headers ?? []).reduce((sum, header) => sum + header.width, 0);
  const coreWidth = CORE_HEADERS.reduce((sum, header) => sum + header.width, NAME_MIN_WIDTH);
  const shape: LineTableShape = {
    columns,
    isPaymentHidden,
    columnCount: CORE_HEADERS.length + (columns?.headers.length ?? 0) + (isPaymentHidden ? 0 : 1),
  };
  const style = { minWidth: coreWidth + extraWidth + (isPaymentHidden ? 0 : AMOUNT_WIDTH) } as CSSProperties;
  // Disiplini atanmış kullanıcıda backend süzmesi tüm satırları boşaltabilir (DSC-F1.3).
  const scope = useDisciplineScope();
  return (
    <section className="diary-detail-card" aria-labelledby="diary-detail-lines">
      <div className="diary-detail-lines__head">
        <div>
          <h2 className="diary-detail-card__title" id="diary-detail-lines">
            📋 Yapılan Miktarlar
          </h2>
          <p className="diary-detail-card__sub">{caption(groups, columns?.captionSuffix)}</p>
        </div>
        <span className="diary-detail-lines__badge">Sözleşme BOQ&apos;a bağlı</span>
      </div>
      {notice}
      {groups.totalCount === 0 ? (
        scope.isRestricted ? <RestrictedEmptyNotice names={scope.names} /> : <EmptyLinesBody />
      ) : (
        <>
          <div className="diary-detail-lines__scroll">
            <table className="diary-detail-lines" style={style}>
              <TableHead columns={columns} isPaymentHidden={isPaymentHidden} />
              <TableBody groups={groups} shape={shape} />
              <TableFoot groups={groups} shape={shape} />
            </table>
          </div>
          {!isPaymentHidden && <PaymentBand href={paymentsHref} />}
        </>
      )}
    </section>
  );
}
