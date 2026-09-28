// GIR-F1 · gün kutusu artık `useRef` ile takvim seçiciyi tetikliyor →
// istemci bileşeni ZORUNLU (bkz. `DateInput.tsx` başındaki aynı not —
// `use-client-directive-guard` bekçisi `components/earned-value` altını tarar).
"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button/Button";
import { NativeDatePicker, type NativeDatePickerHandle } from "@/components/ui/date-input";

import { formatDayWeek } from "../../diary/day-header";
import { formatDayLongWithWeekday, formatWeekRangeShort, shiftIsoDate } from "./report-date-format";
import "./report-date-nav.css";

interface DayNavProps {
  mode: "day";
  day: string;
  dayNo: number | null;
  weekNo: number | null;
  min?: string | null;
  max?: string | null;
  onChange: (day: string) => void;
}

interface WeekNavProps {
  mode: "week";
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  minWeek?: number;
  maxWeek?: number | null;
  onChange: (week: number) => void;
}

export type ReportDateNavProps = DayNavProps | WeekNavProps;

/** Q:90-95 / GİR:87-95 takvim ikonu — sabit dekoratif, glif alt kümesi DIŞI değil (inline SVG). */
function CalendarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="report-date-nav__glyph">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 7h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DayNav({ day, dayNo, weekNo, min, max, onChange }: DayNavProps) {
  const prevDay = shiftIsoDate(day, -1);
  const nextDay = shiftIsoDate(day, 1);
  const prevDisabled = min != null && prevDay < min;
  const nextDisabled = max != null && nextDay > max;
  const suffix = formatDayWeek(dayNo, weekNo);
  const pickerRef = useRef<NativeDatePickerHandle>(null);
  return (
    <nav className="report-date-nav" aria-label="Gün gezgini">
      <Button
        variant="ghost"
        size="sm"
        className="report-date-nav__arrow"
        aria-label="Önceki gün"
        disabled={prevDisabled}
        onClick={() => onChange(prevDay)}
      >
        ‹
      </Button>
      {/* LİDER DÜZELTMESİ (GIR-F1): `NativeDatePicker`in gizli `<input>`ı
          ARTIK düğmenin İÇİNDE değil — HTML içerik modeline göre `<button>`
          etkileşimli içerik barındıramaz (axe "nested-interactive"; `aria-
          hidden`/`tabIndex=-1` bunu GEÇERLİ KILMAZ, yalnız erişilebilirlik
          AĞACINDAN gizler, İÇERİK MODELİ ihlalini kapatmaz). Konumlandırma
          ebeveyni (`position: relative`) bu sarmalayıcıya taşındı; düğme
          kendisi artık `position: static`. */}
      <span className="report-date-nav__box-anchor">
        <button
          type="button"
          className="report-date-nav__box"
          aria-label={`Gün seç: ${formatDayLongWithWeekday(day)}`}
          onClick={() => pickerRef.current?.open()}
        >
          <CalendarGlyph />
          <span className="report-date-nav__label">{formatDayLongWithWeekday(day)}</span>
          {suffix !== null && <span className="report-date-nav__suffix">{suffix}</span>}
        </button>
        <NativeDatePicker ref={pickerRef} value={day} min={min} max={max} onPick={onChange} />
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="report-date-nav__arrow"
        aria-label="Sonraki gün"
        disabled={nextDisabled}
        onClick={() => onChange(nextDay)}
      >
        ›
      </Button>
    </nav>
  );
}

function WeekNav({ weekNo, weekStart, weekEnd, minWeek, maxWeek, onChange }: WeekNavProps) {
  const prevDisabled = minWeek !== undefined && weekNo - 1 < minWeek;
  const nextDisabled = maxWeek != null && weekNo + 1 > maxWeek;
  return (
    <nav className="report-date-nav" aria-label="Hafta gezgini">
      <Button
        variant="ghost"
        size="sm"
        className="report-date-nav__arrow"
        aria-label="Önceki hafta"
        disabled={prevDisabled}
        onClick={() => onChange(weekNo - 1)}
      >
        ‹
      </Button>
      <span className="report-date-nav__box">
        <CalendarGlyph />
        <span className="report-date-nav__label">Hafta {weekNo}</span>
        <span className="report-date-nav__suffix">{formatWeekRangeShort(weekStart, weekEnd)}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="report-date-nav__arrow"
        aria-label="Sonraki hafta"
        disabled={nextDisabled}
        onClick={() => onChange(weekNo + 1)}
      >
        ›
      </Button>
    </nav>
  );
}

/**
 * PLN-F3.5 · Rapor ekranlarının ortak gün/hafta gezgini.
 * Gün modu Günlük İlerleme Raporu (GİR:87-95), hafta modu QURR (Q:88-106).
 * Sınır dışına çıkan ok `disabled` olur; sınırın KENDİSİ (bir sonraki gün/hafta)
 * hesaplanıp karşılaştırılır — `PlanWeekNav`in `prevDis`/`nextDis` desenindeki
 * aynı "sınırı geçen taraf pasif" kuralı.
 */
export function ReportDateNav(props: ReportDateNavProps) {
  if (props.mode === "day") return <DayNav {...props} />;
  return <WeekNav {...props} />;
}
