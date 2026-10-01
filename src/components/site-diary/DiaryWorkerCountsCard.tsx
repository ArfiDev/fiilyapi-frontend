import Link from "next/link";

import { Input } from "@/components/ui/input/Input";
import { Select } from "@/components/ui/select/Select";
import { ArrowRightIcon, XIcon } from "@/components/ui/icons";
import type { OwnCrewFromTimesheet } from "@/lib/api/hooks/useSiteDiary";
import { cx } from "@/lib/cx";
import { EMPTY_CELL, formatDecimal } from "@/lib/format";

import { DIARY_WORKER_COUNT_MAX, WORKER_SOURCE_LABELS } from "./diary-labels";
import type { DiaryFormState } from "./form-state";
import {
  diaryCrewTotals,
  firmManHours,
  isFirmRow,
  LEGACY_WORKER_LABEL,
  parseWorkerCount,
  parseWorkerHours,
  workerCountKey,
  type DiaryAddedFirm,
  type DiaryWorkerRow,
} from "./worker-counts";
import "./site-diary-progress.css";

/** Saat hücresinin metin tavanı ("23,5"). */
const WORKER_HOURS_MAX_LENGTH = 4;

export interface DiaryFirmOption {
  id: string;
  name: string;
}

export interface DiaryWorkerCountsCardProps {
  /** Günlük işçi satırları — firma + "Diğer (eski kayıt)" (`buildDiaryWorkerRows`). */
  rows: readonly DiaryWorkerRow[];
  /** G12a — kendi ekip, backend'in puantajdan türettiği satırlar (SALT OKUNUR). */
  ownCrew: readonly OwnCrewFromTimesheet[];
  /** Boş hâlin "Puantaja git" hedefi (o günün haftası seçili). */
  timesheetHref: string;
  form: DiaryFormState;
  onChange: (key: string, value: string) => void;
  /** Salt-okunur görünüm (izin yok, kayıt `submitted` ya da gün kilitli). */
  disabled: boolean;
  /** Firma satırının saat hücresi (İ:356-357). */
  onHoursChange?: (key: string, value: string) => void;
  /** G10 — firma satırı ekle/kaldır (formen `site_diary` yazma). */
  onAddFirm?: (firm: DiaryAddedFirm) => void;
  onRemoveRow?: (key: string) => void;
  /** Eklenebilecek (aktif) taşeron firmaları. */
  firmOptions?: readonly DiaryFirmOption[];
  /** Firma adı çözümleyicisi (satır yanıtında ad YOK — taşeron listesinden). */
  firmNameById?: ReadonlyMap<string, string>;
}

const SOURCE_BADGE_CLASS: Record<DiaryWorkerRow["source"], string> = {
  company: "diary-workers__badge--company",
  subcontractor: "diary-workers__badge--subcontractor",
  general: "diary-workers__badge--general",
  /* freelance/intern mockup'ta yok; genel (nötr) rozet stiline düşer. */
  freelance: "diary-workers__badge--general",
  intern: "diary-workers__badge--general",
};

function formatHours(value: string | null): string {
  return value === null ? EMPTY_CELL : formatDecimal(value, 1);
}

/** Günlük satırının ekran adı: firma adı (taşeron listesinden) ya da eski kayıt etiketi. */
function workerRowName(row: DiaryWorkerRow, firmNameById?: ReadonlyMap<string, string>): string {
  if (isFirmRow(row)) return firmNameById?.get(row.subcontractorId ?? "") ?? row.trade;
  return `${LEGACY_WORKER_LABEL} · ${row.trade}`;
}

function WorkerBadge({ source }: { source: DiaryWorkerRow["source"] }) {
  return <span className={cx("diary-workers__badge", SOURCE_BADGE_CLASS[source])}>{WORKER_SOURCE_LABELS[source]}</span>;
}

/** Kendi ekip satırı (İ:352-360, `isOwn`) — kişi ve saat puantajdan, SALT OKUNUR. */
function OwnCrewRow({ crew }: { crew: OwnCrewFromTimesheet }) {
  return (
    <div className="diary-workers__grid-row">
      <span className="diary-workers__name">
        <WorkerBadge source={crew.source} />
        <span className="diary-workers__name-text">{crew.trade}</span>
      </span>
      {/* Onaylı sapma: mockup İ:354 kişi hücresini input çizer; kendi ekipte kişi puantajdan gelir. */}
      <span className="diary-workers__count-ro" title="Puantajdan">
        {crew.headcount}
      </span>
      <span className="diary-workers__hours-ro" title="Puantajdan">
        {formatHours(crew.hours)}
      </span>
      <span className="diary-workers__as">{formatHours(crew.hours)}</span>
      <span />
    </div>
  );
}

/** G12a boş hâli — puantajsız gün kendi ekip bölümünü BOŞ bırakmaz. */
function OwnCrewEmpty({ timesheetHref }: { timesheetHref: string }) {
  return (
    <div className="diary-workers__empty">
      <span>Bu gün için puantaj girilmemiş</span>
      <span aria-hidden="true">·</span>
      <Link href={timesheetHref} className="diary-workers__empty-link">
        Puantaja git
        <ArrowRightIcon width={12} height={12} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * İ:344-372 · "👷 Bugünkü İşçi Dağılımı" (PLN-F2.2 genişlemesi → PLN-F2.1b G12a).
 *
 * Kolonlar Meslek·kaynak · Kişi · Saat · a-s. KENDİ EKİP satırları backend'in
 * `own_crew_from_timesheet`inden gelir — kişi ve saat SALT OKUNUR, rozet
 * satırın kendi kaynağından; puantajsız günde boş hâl puantaja yönlendirir.
 * Taşeron FİRMA satırında kişi × saat girilir (`subcontractor_id`, `hours`);
 * firma adı taşeron listesinden çözülür. Kayıtta sayısı > 0 olan firmasız
 * satır "Diğer (eski kayıt)" olarak düzenlenir/kaldırılır. G10: formen firma
 * satırı ekler/kaldırır (yalnız FİRMA eklenir). "Toplam" TÜREVDİR
 * (`diaryCrewTotals`): kişi = Σ headcount + Σ günlük satır; a-s = Σ puantaj
 * saati + Σ firma a-s.
 */
export function DiaryWorkerCountsCard({
  rows,
  ownCrew,
  timesheetHref,
  form,
  onChange,
  disabled,
  onHoursChange,
  onAddFirm,
  onRemoveRow,
  firmOptions = [],
  firmNameById,
}: DiaryWorkerCountsCardProps) {
  const hoursValues = form.workerHours ?? {};
  const totals = diaryCrewTotals(ownCrew, rows, form.workerCounts, hoursValues);
  const presentFirms = new Set(rows.flatMap((row) => (row.subcontractorId ? [row.subcontractorId] : [])));
  const addable = firmOptions.filter((firm) => !presentFirms.has(firm.id));

  return (
    <section className="diary-card diary-card--side" aria-labelledby="diary-workers-title">
      <h2 className="diary-card__title" id="diary-workers-title">
        👷 Bugünkü İşçi Dağılımı
      </h2>
      <p className="diary-workers__subtitle">Formenin bölümü · kendi ekip saati puantajdan gelir</p>
      <div className="diary-workers__grid-head" aria-hidden="true">
        <span>Meslek · kaynak</span>
        <span className="diary-workers__cell-center">Kişi</span>
        <span className="diary-workers__cell-center">Saat</span>
        <span className="diary-workers__cell-right">a-s</span>
        <span />
      </div>
      <div className="diary-workers__list">
        {ownCrew.length === 0 ? (
          <OwnCrewEmpty timesheetHref={timesheetHref} />
        ) : (
          ownCrew.map((crew) => <OwnCrewRow key={`own|${crew.source}|${crew.trade}`} crew={crew} />)
        )}
        {rows.map((row) => {
          const key = workerCountKey(row);
          const value = form.workerCounts[key] ?? "";
          const isInvalid = parseWorkerCount(value) === null;
          const isFirm = isFirmRow(row);
          const name = workerRowName(row, firmNameById);
          const label = `${WORKER_SOURCE_LABELS[row.source]} · ${name}`;
          const hoursText = hoursValues[key] ?? "";
          return (
            <div className="diary-workers__grid-row" key={key}>
              <span className="diary-workers__name">
                <WorkerBadge source={row.source} />
                <span className="diary-workers__name-text">{name}</span>
              </span>
              <Input
                className="diary-workers__count"
                size="row"
                inputMode="numeric"
                numeric
                status={isInvalid ? "error" : "default"}
                aria-label={`${label} işçi sayısı`}
                aria-invalid={isInvalid || undefined}
                maxLength={DIARY_WORKER_COUNT_MAX}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(key, event.target.value)}
              />
              {isFirm ? (
                <Input
                  className="diary-workers__hours-in"
                  size="row"
                  inputMode="decimal"
                  numeric
                  status={parseWorkerHours(hoursText).valid ? "default" : "error"}
                  aria-label={`${label} kişi başı saat`}
                  maxLength={WORKER_HOURS_MAX_LENGTH}
                  value={hoursText}
                  disabled={disabled}
                  onChange={(event) => onHoursChange?.(key, event.target.value)}
                />
              ) : (
                // Eski firmasız satır saat taşımaz (a-s'e girmez).
                <span className="diary-workers__hours-ro">{EMPTY_CELL}</span>
              )}
              <span className={cx("diary-workers__as", isFirm && "diary-workers__as--sub")}>
                {formatHours(isFirm ? firmManHours(value, hoursText) : null)}
              </span>
              {onRemoveRow && !disabled ? (
                <button
                  type="button"
                  className="diary-lines__remove"
                  aria-label={`${name} satırını kaldır`}
                  onClick={() => onRemoveRow(key)}
                >
                  <XIcon width={12} height={12} />
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
        {/* İ:365 */}
        <div className="diary-workers__sub-note">Taşeron: kişi × saat = a-s</div>
        {onAddFirm && !disabled && addable.length > 0 && (
          <div className="diary-workers__add-firm">
            <Select
              aria-label="Taşeron firma ekle"
              value=""
              onChange={(event) => {
                const firm = addable.find((option) => option.id === event.target.value);
                if (firm) onAddFirm({ subcontractorId: firm.id, trade: firm.name });
              }}
            >
              <option value="">+ Taşeron firma ekle</option>
              {addable.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {/* İ:366-371 */}
        <div className="diary-workers__total diary-workers__grid-row">
          <span className="diary-workers__total-label">Toplam</span>
          <span className="diary-workers__total-value diary-workers__cell-center">
            {totals.people === null ? EMPTY_CELL : totals.people}
          </span>
          <span />
          <span className="diary-workers__total-as">{formatHours(totals.manHours)}</span>
          <span />
        </div>
      </div>
      {totals.people === null && (
        <p className="diary-workers__note">
          İşçi sayısı yalnız tam sayı olabilir — toplam bu yüzden gösterilmiyor.
        </p>
      )}
    </section>
  );
}
