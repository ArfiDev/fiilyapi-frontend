import Link from "next/link";

import { ArrowRightIcon, ClockIcon } from "@/components/ui/icons";
import type { EvDayView } from "@/lib/api/models";
import { cx } from "@/lib/cx";
import type { PfBandSettings } from "@/lib/earned-value";
import { EMPTY_CELL } from "@/lib/format";

import { draftFromView, hiddenAllocated, stripValues } from "../diary/allocation-model";
import { AllocationStrip } from "../diary/AllocationStrip";
import { formatHours, toCenti } from "../diary/hours";
import { formatEarned } from "../diary/line-progress";
import { PfBadge } from "../diary/PfBadge";
import type { HourSummary, HourSummaryRow } from "./detail-progress";

/**
 * DET-1.3 · S6 — "Saat Dağıtımı · özet" (mockup 409-458 ← İ:386-491).
 *
 * Kişi × iş kodu ızgarası YERİNE iş kodu başına tek satır (İ:479-487 kolon
 * toplamı + "Bugün PF" satırlarının transpozu): kod · harcanan · kazanılmış ·
 * PF. Üstte 4'lü şerit (İ:393-396, `AllocationStrip` — günlük ekranıyla AYNI
 * bileşen), dağıtılmamış saatin gerekçesi (DayView.unallocated_reason) ve
 * S8 kuralıyla YALNIZ düzenleyebilene "Tam dağılım → Günlük kayıtta aç".
 */
export interface HourSummaryBlockProps {
  view: EvDayView;
  summary: HourSummary;
  bands: PfBandSettings;
  currentSectionName: string | null;
  openHref: string | undefined;
}

const RULE_CHIP = "Miktara göre dağıtılır";

function codeLine(row: HourSummaryRow): string {
  if (!row.isLeaf) return [row.code, "üst grup", `${formatHours(row.direct)} sa`].filter(Boolean).join(" · ");
  const direct = row.groupShare > 0 ? `${formatHours(row.direct)} + grup payı ${formatHours(row.groupShare)}` : null;
  return [row.code, direct, ...row.firms].filter((part): part is string => Boolean(part)).join(" · ");
}

function SpentCell({ row }: { row: HourSummaryRow }) {
  // Motor yaprağı yoksa (bugün miktar yok) harcanan = koda doğrudan yazılan saat.
  if (row.isLeaf) return <>{formatHours(row.spent === null ? row.direct : toCenti(row.spent))}</>;
  if (row.rule !== "prorata_by_daily_qty") return <span className="ev-detail-hours__muted">{EMPTY_CELL}</span>;
  // 435 — İ:672 grup PF metni "→ alt" (ok glif değil SVG)
  return (
    <span className="ev-detail-hours__muted" title="Yapraklara bugünkü miktar payıyla dağılır">
      <ArrowRightIcon className="ev-detail-hours__arrow" aria-hidden="true" /> alt
    </span>
  );
}

function SummaryRow({ row, bands, isOther }: { row: HourSummaryRow; bands: PfBandSettings; isOther: boolean }) {
  return (
    <tr className={cx("ev-detail-hours__row", !row.isLeaf && "ev-detail-hours__row--group", isOther && "ev-detail-hours__row--other")}>
      <td className="ev-detail-hours__name">
        <span className="ev-detail-hours__short">{row.short}</span>
        {!row.isLeaf && row.rule === "prorata_by_daily_qty" && <span className="ev-detail-hours__chip">{RULE_CHIP}</span>}
        <span className="ev-detail-hours__code">{codeLine(row)}</span>
      </td>
      <td className="ev-detail-hours__num">
        <SpentCell row={row} />
      </td>
      <td className="ev-detail-hours__num ev-detail-hours__earned">
        {row.isLeaf ? formatEarned(row.earned) : <span className="ev-detail-hours__muted">{EMPTY_CELL}</span>}
      </td>
      <td className="ev-detail-hours__num ev-detail-hours__pf">
        <PfBadge value={row.isLeaf ? row.pf : null} bands={bands} />
      </td>
    </tr>
  );
}

function Separator({ children, isCurrent }: { children: string; isCurrent: boolean }) {
  return (
    <tr className={cx("ev-detail-hours__sep", isCurrent && "ev-detail-hours__sep--current")}>
      <th scope="colgroup" colSpan={4}>
        {children}
      </th>
    </tr>
  );
}

function SummaryBody({ summary, bands, currentSectionName }: Pick<HourSummaryBlockProps, "summary" | "bands" | "currentSectionName">) {
  const hasGroups = currentSectionName !== null;
  if (summary.current.length === 0 && summary.others.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={4} className="ev-detail-hours__empty">
            Bu gün iş koduna saat dağıtılmamış.
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {hasGroups && summary.current.length > 0 && <Separator isCurrent>{`Bu bölüm · ${currentSectionName}`}</Separator>}
      {summary.current.map((row) => (
        <SummaryRow key={row.nodeId} row={row} bands={bands} isOther={false} />
      ))}
      {hasGroups && summary.others.length > 0 && <Separator isCurrent={false}>Diğer bölümler</Separator>}
      {summary.others.map((row) => (
        <SummaryRow key={row.nodeId} row={row} bands={bands} isOther={hasGroups} />
      ))}
    </tbody>
  );
}

export function HourSummaryBlock({ view, summary, bands, currentSectionName, openHref }: HourSummaryBlockProps) {
  const strip = stripValues(view, draftFromView(view), false);
  const reason = view.unallocated_reason?.trim() ?? "";
  const unallocated = strip.unallocated > 0 ? formatHours(strip.unallocated) : null;
  return (
    <section className="ev-diary-alloc ev-detail-hours" aria-labelledby="ev-detail-hours-title">
      <div className="ev-diary-alloc__head">
        <div className="ev-diary-alloc__title-wrap">
          <h2 id="ev-detail-hours-title" className="ev-diary-alloc__title">
            <ClockIcon aria-hidden="true" /> Saat Dağıtımı · özet
          </h2>
          <p className="ev-diary-alloc__subtitle">Günün saatlerinin iş kodlarına dağılımı · harcanan a-s buradan gelir</p>
        </div>
        <AllocationStrip values={strip} />
      </div>
      {unallocated !== null && reason !== "" && (
        <p className="ev-detail-hours__reason">
          {`Dağıtılmamış ${unallocated} a-s gerekçesi: `}
          <b>{reason}</b>
        </p>
      )}
      <div className="ev-detail-hours__scroll">
        <table className="ev-detail-hours__table">
          <thead>
            <tr>
              <th scope="col" className="ev-detail-hours__th ev-detail-hours__th--name">İş kodu</th>
              <th scope="col" className="ev-detail-hours__th">Harcanan</th>
              <th scope="col" className="ev-detail-hours__th ev-detail-hours__th--earned">Kazanılmış</th>
              <th scope="col" className="ev-detail-hours__th ev-detail-hours__th--pf">PF</th>
            </tr>
          </thead>
          <SummaryBody summary={summary} bands={bands} currentSectionName={currentSectionName} />
          <tfoot>
            <tr className="ev-detail-hours__total">
              <th scope="row" className="ev-detail-hours__name">
                Toplam
                {unallocated !== null && (
                  <>
                    {" · "}
                    <span className="ev-detail-hours__unallocated">{`${unallocated} a-s dağıtılmamış`}</span>
                  </>
                )}
              </th>
              {/* Görünen satırların toplamı: kısıtlıda `allocated` başka disiplin payını da içerir. */}
              <td className="ev-detail-hours__num">{formatHours(strip.allocated - hiddenAllocated(view))}</td>
              <td className="ev-detail-hours__num ev-detail-hours__earned">{formatEarned(view.progress?.earned_day ?? null)}</td>
              <td className="ev-detail-hours__num ev-detail-hours__pf">
                <PfBadge value={view.progress?.pf_day ?? null} bands={bands} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="ev-detail-hours__foot">
        <span className="ev-detail-hours__note">
          Kişi × iş kodu ayrıntısı günlük ekranındaki ızgarada. Üst gruba yazılan saat alt kalemlere bugünkü kazanılmış
          payına göre dağıtılır.
        </span>
        {openHref !== undefined && (
          <Link className="ev-detail-hours__open" href={openHref}>
            Tam dağılım <ArrowRightIcon aria-hidden="true" /> Günlük kayıtta aç
          </Link>
        )}
      </div>
    </section>
  );
}
