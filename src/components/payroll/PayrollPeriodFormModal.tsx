"use client";

import { useState } from "react";

import { Alert, Button, DateInput, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { PayrollPeriodListRow } from "@/lib/api/hooks/usePayroll";
import { useCreatePayrollPeriod } from "@/lib/api/hooks/usePayrollMutations";
import { PERIOD_MONTHS } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  MAX_PAYROLL_YEAR,
  MIN_PAYROLL_YEAR,
  nextPeriodSuggestion,
  periodFormBlockReason,
} from "./payroll-derive";
import {
  OPEN_PERIOD_CANCEL_LABEL,
  OPEN_PERIOD_DUE_HINT,
  OPEN_PERIOD_DUE_LABEL,
  OPEN_PERIOD_ERROR_FALLBACK,
  OPEN_PERIOD_MONTH_ARIA,
  OPEN_PERIOD_MONTH_LABEL,
  OPEN_PERIOD_MONTH_PLACEHOLDER,
  OPEN_PERIOD_NOTICE_BODY,
  OPEN_PERIOD_NOTICE_TITLE,
  OPEN_PERIOD_STEP,
  OPEN_PERIOD_SUBMIT_LABEL,
  OPEN_PERIOD_TITLE,
  OPEN_PERIOD_YEAR_ARIA,
  OPEN_PERIOD_YEAR_LABEL,
} from "./payroll-labels";
import "./payroll.css";

/**
 * F-BORDRO T2 · **DÖNEM AÇ** diyaloğu — uç: `POST /payroll/periods`.
 *
 * 🟢 **F-BORDONEM · ONAYLI SAPMA KAPANDI.** Bu form bir tur boyunca mockup'sız
 * yaşadı (kanonik form kabuğundan türetilmişti, serbest tasarım değil). Kanon
 * artık VARDIR: `projedesign/Form - Donem Ac.dc.html` ("FDA"); yorumlardaki
 * `FDA:n` O dosyanın satır numaralarıdır ve her yüzey ona çekildi.
 *
 * 🔴 **MOCKUP'IN HTML YORUMU ÜÇ YERDE BAYAT — SÖZLEŞMEDEN ÖLÇÜLDÜ, YORUMDAN
 * KOPYALANMADI** (`openapi/openapi.json`, 232 yol / 340 operasyon):
 *   1. FDA:27 `due_date` diyor → alanın gerçek adı **`payment_due_date`**
 *      (`PayrollPeriodCreate.payment_due_date`).
 *   2. FDA:28 `POST .../calculate` diyor → gerçek yol **`.../compute`**
 *      (`/payroll/periods/{period_id}/compute`; `calculate` diye bir yol YOK).
 *   3. FDA:82 *"girilirse gösterge panelinde hatırlatma çıkar"* → gösterge
 *      paneli yalnız ONAYLANMIŞ dönemleri listeler; **taslak dönemin vadesi
 *      panelde çıkmaz**. Bu cümle EKRANA TAŞINMADI; yerine alanın gerçekte ne
 *      yaptığını söyleyen `OPEN_PERIOD_DUE_HINT` basılır.
 *
 * Kabuk `settings/Modal`dır — YENİ kabuk yazılmaz. Ham `<select>`/`<input>`
 * yoktur; `ui/` primitive'leri ve `ui/DateInput` kullanılır.
 *
 * 🔴 ALANLAR UÇTAN ÖLÇÜLDÜ, uydurulmadı (`PayrollPeriodCreate`):
 *   `year: number` (2000-2100) · `month: number` (1-12) ·
 *   `payment_due_date?: string | null` (OPSİYONEL).
 * Şema `extra="forbid"`dir: `status` GÖVDEYE GİRMEZ — yeni dönem her zaman
 * `draft`tır, aksi hâlde bir ay doğrudan `paid` açılıp onay zinciri atlanırdı.
 *
 * 🔴 **SÖZLEŞME KISITI TİPTE YAŞAMAZ.** `year` 2000-2100 ve `month` 1-12
 * üretilen TS tipinde İFADE EDİLEMEZ (`year: number`); `typecheck` yeşilken
 * canlı 422 verebilir. Korkuluk bu yüzden `periodFormBlockReason`dadır ve
 * sınırlar `payroll-period-contract.test.ts` ile **sözleşmeye çakılıdır** —
 * şema değişirse test kırmızı olur, sabitler sessizce bayatlamaz.
 *
 * 🔴 Ay ve yıl FDA:61-77'deki gibi İKİ AYRI `Field`tır (mockup'ta iki ayrı
 * `.lbl` + yılın kendi `.hint`i var); ay adları `PERIOD_MONTHS` TEK
 * kaynağından gelir, kopyalanmaz.
 */
export interface PayrollPeriodFormModalProps {
  /** Açık dönemler — öneri ve "zaten açılmış" uyarısı bundan türer. */
  rows: readonly PayrollPeriodListRow[];
  onClose: () => void;
  /** Açılan dönem çağırana bildirilir (ay gezgini oraya atlar). */
  onCreated: (periodId: string) => void;
}

/** Yıl girdisi ayrıştırılamıyorsa `null` — `0`a düşmek 422 üretirdi. */
function parseYear(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function PayrollPeriodFormModal({
  rows,
  onClose,
  onCreated,
}: PayrollPeriodFormModalProps) {
  const createPeriod = useCreatePayrollPeriod();
  // 🔴 Öneri VERİDEN türer, `new Date()`ten DEĞİL (gerekçe:
  // `nextPeriodSuggestion`). Hiç dönem yoksa alanlar boş açılır.
  const [suggestion] = useState(() => nextPeriodSuggestion(rows));

  const [yearText, setYearText] = useState(
    suggestion === undefined ? "" : String(suggestion.year),
  );
  const [month, setMonth] = useState<number | null>(suggestion?.month ?? null);
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = createPeriod.isPending;
  const year = parseYear(yearText);
  const blockReason = periodFormBlockReason({ year, month, rows });
  // SEKME-F1.3b · dirty = alanların ÖNERİ tabanından sapması (tercih 2).
  // `suggestion` senkron `rows` prop'undan türer (ASYNC TABAN DEĞİL) — ayrı
  // bir GET yarışı yok, `useState(() => nextPeriodSuggestion(rows))` ile
  // BİR KEZ yakalanır.
  const isDirty =
    yearText !== (suggestion === undefined ? "" : String(suggestion.year)) ||
    month !== (suggestion?.month ?? null) ||
    dueDate !== "";
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "Bordro dönemi");

  async function handleSubmit() {
    // Tip daraltması: `blockReason` ikisinin de dolu olduğunu zaten garanti
    // eder, ama derleyici bunu bilemez.
    if (blockReason !== undefined || year === null || month === null) return;
    setFormError(null);
    try {
      const created = await createPeriod.mutateAsync({
        year,
        month,
        // 🔴 Boş bırakılan alan gövdeye HİÇ eklenmez (`EmployerFormModal`
        // deseni): açıkça `null` göndermek "tarihi temizle" demektir ve bu bir
        // AÇMA isteğinde anlamsızdır.
        ...(dueDate === "" ? {} : { payment_due_date: dueDate }),
      });
      onCreated(created.id);
    } catch (error) {
      setFormError(backendErrorMessage(error, OPEN_PERIOD_ERROR_FALLBACK));
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={OPEN_PERIOD_TITLE}
      className="bor-modal"
      onClose={onClose}
      footer={
        <>
          {blockReason !== undefined && (
            <span className="bor-form__footer-note" data-testid="bordro-open-block-reason">
              <WarningTriangleIcon className="bor-form__footer-icon" />
              {blockReason}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {OPEN_PERIOD_CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={blockReason !== undefined || isPending}
            data-testid="bordro-open-submit"
          >
            {OPEN_PERIOD_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      {/* FDA:55 — başlık altındaki adım sayacı. `Modal` kabuğunun başlığı
          tek satırdır ve KABUK DEĞİŞTİRİLMEZ (ortak yüzey, başka dilimlerin
          kareleri ona bağlı); adım satırı gövdenin ilk satırı olarak basılır. */}
      <p className="bor-form__step" data-testid="bordro-open-step">
        {OPEN_PERIOD_STEP}
      </p>

      {/* FDA:61-77 — ay ve yıl İKİ KOLONLU ızgarada, her biri kendi etiketiyle. */}
      <div className="bor-form__grid">
        <Field label={OPEN_PERIOD_MONTH_LABEL} required>
          {(control) => (
            <Select
              {...control}
              value={month ?? ""}
              disabled={isPending}
              aria-label={OPEN_PERIOD_MONTH_ARIA}
              onChange={(event) => {
                setMonth(event.target.value === "" ? null : Number(event.target.value));
                setFormError(null);
              }}
              data-testid="bordro-open-month"
            >
              <option value="">{OPEN_PERIOD_MONTH_PLACEHOLDER}</option>
              {/* FDA:66-69 — seçenek metni `8 — Ağustos`. Ay ADI tek kaynaktan
                  (`PERIOD_MONTHS`) gelir; numara ÖNEK olarak TÜRETİLİR,
                  ikinci bir ay listesi yazılmaz. `—` (U+2014) glif
                  kapsamındadır (`2000-206F`). */}
              {PERIOD_MONTHS.map((option) => (
                <option key={option.value} value={option.value}>
                  {`${option.value} — ${option.label}`}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={OPEN_PERIOD_YEAR_LABEL}
          required
          // FDA:75 — yılın kendi ipucu sınır aralığını GÖSTERİR. Metin
          // sabitlerden TÜRER: sözleşme sınırı değişirse ipucu da değişir.
          hint={`${MIN_PAYROLL_YEAR} – ${MAX_PAYROLL_YEAR}`}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              numeric
              // FDA:74 `min="2000" max="2100"` — tarayıcının kendi kısıtı.
              // Bu bir KOLAYLIKTIR, korkuluk DEĞİL: `min`/`max` yazmayı
              // engellemez, yalnız artırıcı okları ve native doğrulamayı
              // sınırlar. Gerçek kapı `periodFormBlockReason`dadır.
              min={MIN_PAYROLL_YEAR}
              max={MAX_PAYROLL_YEAR}
              disabled={isPending}
              aria-label={OPEN_PERIOD_YEAR_ARIA}
              value={yearText}
              onChange={(event) => {
                setYearText(event.target.value);
                setFormError(null);
              }}
              data-testid="bordro-open-year"
            />
          )}
        </Field>
      </div>

      <Field label={OPEN_PERIOD_DUE_LABEL} hint={OPEN_PERIOD_DUE_HINT}>
        {(control) => (
          <DateInput
            {...control}
            value={dueDate}
            disabled={isPending}
            onValueChange={(iso) => {
              setDueDate(iso);
              setFormError(null);
            }}
            data-testid="bordro-open-due"
          />
        )}
      </Field>

      {/* 🔴 FDA:85-92 — diyaloğun ASIL mesajı. Bu kutu olmadan kullanıcı
          "kaydettim ama liste boş" hâline düşer; mockup'ın KARARI (FDA:29-31)
          iki işlemi ayırmak ve sonraki adımı AÇIKÇA söylemektir. */}
      <Alert
        variant="warning"
        title={OPEN_PERIOD_NOTICE_TITLE}
        className="bor-form__notice"
        data-testid="bordro-open-notice"
      >
        {OPEN_PERIOD_NOTICE_BODY}
      </Alert>

      {formError !== null && (
        <p className="bor-form__error" data-testid="bordro-open-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
