"use client";

import { useRef, useState } from "react";

import { Badge, Input } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { PayrollLineResponse } from "@/lib/api/hooks/usePayroll";
import { useUpdatePayrollLineSplit } from "@/lib/api/hooks/usePayrollMutations";
import { formatAmount, formatDays } from "@/lib/format";
import { useSyncedFieldState } from "@/lib/hooks/useSyncedFieldState";
import { initials } from "@/lib/shell/initials";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  amountFieldValue,
  isAmountFieldDirty,
  isAmountInputValid,
  isLineSplitEditable,
  lineSplitDisabledReason,
  toAmountPayload,
} from "./payroll-derive";
import {
  COL_BANK,
  COL_CASH,
  EMPTY_VALUE,
  LINE_ERROR_FALLBACK,
  LINE_STATUS_LABELS,
  LINE_STATUS_VARIANTS,
  SOURCE_BADGE_LABELS,
} from "./payroll-labels";

interface PayrollLineRowProps {
  line: PayrollLineResponse;
  /** Yazma izni yoksa girdiler salt-okunur basılır (izin matrisi kararı). */
  canWrite: boolean;
}

/**
 * BY:130-149 — bordro tablosunun BİR satırı.
 *
 * 🔴 K5 uygulaması burada da geçerlidir: kolon başlıklarındaki emoji yerine
 * girdilerin `aria-label`ı düz sözcüktür (`Banka`/`Elden`).
 *
 * 🔴 KARŞILANAMAYAN ALAN: mockup her ismin altına meslek + taşeron adı yazar
 * (BY:134/182). `PayrollLineResponse` yalnız `personnel_name` taşır — meslek
 * UYDURULMAZ, alt satır BASILMAZ (zarif düşüş, F-IZN emsali).
 *
 * 🔴 K7 TEK UÇUŞ: `isPending` doğrudan mutasyondan okunur (ayrı local boolean
 * YOK) ve satırın İKİ girdisini birden devre dışı bırakır — çift `PATCH`
 * imkânsızdır.
 */
export function PayrollLineRow({ line, canWrite }: PayrollLineRowProps) {
  const updateSplit = useUpdatePayrollLineSplit();
  const isPending = updateSplit.isPending;

  // 🔴 triyaj #150 — `useState(() => amountFieldValue(...))` yalnız ilk
  // mount'ta kurulurdu; satır `key={line.id}` ile hiç remount olmadığı için
  // PATCH sonrası invalidation'la gelen yeni `bank_amount`/`cash_amount`
  // kutulara YANSIMIYORDU. `useSyncedFieldState` sunucu değeri değişince
  // senkronize eder, satır odaktayken (kullanıcı yazarken) EZMEZ.
  const isEditingRef = useRef(false);
  const [bank, setBank] = useSyncedFieldState(
    amountFieldValue(line.bank_amount),
    () => isEditingRef.current,
  );
  const [cash, setCash] = useSyncedFieldState(
    amountFieldValue(line.cash_amount),
    () => isEditingRef.current,
  );
  const [rowError, setRowError] = useState<string | null>(null);

  const editable = isLineSplitEditable(line) && canWrite;
  const disabledReason = lineSplitDisabledReason(line);
  // SEKME-F1.3-FIX O6 · ham metin eşitliği DEĞİL, ondalık NORMALİZASYONLU
  // karşılaştırma (`isAmountFieldDirty`) — sunucu "26538.00" gönderdiğinde
  // kullanıcı biçimi farklı ama SAYISAL OLARAK AYNI "26538" yazınca satır
  // artık KALICI kirli kalmıyor (bkz. `payroll-derive.ts`daki fonksiyon
  // yorumu). Görünür davranış değişikliği: aynı değerde blur artık PATCH
  // ATMAZ (öncesinde gereksiz tekrar `PATCH` atıyordu) — KABUL edilen sapma.
  const isDirty =
    isAmountFieldDirty(bank, line.bank_amount) || isAmountFieldDirty(cash, line.cash_amount);
  useUnsavedChanges(isDirty, "Bordro satırı");
  const isValid = isAmountInputValid(bank) && isAmountInputValid(cash);

  /**
   * Kayıt SATIRDAN ÇIKINCA yapılır (odak iki girdiden de ayrıldığında).
   * Alan bazında kaydetmek, kullanıcı bankadan eldene geçerken ARA bir
   * bölüşüm (yeni banka + eski elden) gönderirdi; iki alan sunucuya BİRLİKTE
   * gider (şema kararı), dolayısıyla ara durum hiç oluşmamalıdır.
   */
  function handleRowFocus(event: React.FocusEvent<HTMLTableRowElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    isEditingRef.current = true;
  }

  async function handleRowBlur(event: React.FocusEvent<HTMLTableRowElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    isEditingRef.current = false;
    if (!editable || !isDirty || isPending) return;
    if (!isValid) {
      setRowError("Tutar yalnız rakam ve tek ondalık ayracı içerebilir.");
      return;
    }
    setRowError(null);
    try {
      await updateSplit.mutateAsync({
        lineId: line.id,
        bankAmount: toAmountPayload(bank),
        cashAmount: toAmountPayload(cash),
      });
    } catch (error) {
      setRowError(backendErrorMessage(error, LINE_ERROR_FALLBACK));
    }
  }

  const testId = `bordro-line-${line.id}`;

  return (
    <tr
      className={`bor-row${line.status === "excluded" ? " bor-row--excluded" : ""}`}
      data-testid={testId}
      data-line-status={line.status}
      onFocus={handleRowFocus}
      onBlur={handleRowBlur}
    >
      {/* BY:131-136 — avatar + ad. */}
      <td className="bor-cell bor-cell--person">
        <span className="bor-person">
          <span className="bor-person__avatar" aria-hidden="true">
            {initials(line.personnel_name)}
          </span>
          <span className="bor-person__name">{line.personnel_name}</span>
        </span>
      </td>

      {/* BY:137 */}
      <td className="bor-cell bor-cell--center">
        <Badge variant="neutral" data-testid={`${testId}-source`}>
          {SOURCE_BADGE_LABELS[line.personnel_source]}
        </Badge>
      </td>

      {/* BY:138 — gün; `null` ise mockup'ın kendi `—`si (BY:254). */}
      <td
        className="bor-cell bor-cell--center bor-cell--days"
        data-testid={`${testId}-days`}
      >
        {dayCount(line.days)}
      </td>

      {/* BY:139-141 — para sütunları; `null` = "hesaplanamadı", 0 DEĞİL. */}
      <td className="bor-cell bor-cell--num">{money(line.gross_amount)}</td>
      <td className="bor-cell bor-cell--num bor-cell--deduction">
        {money(line.deduction_amount)}
      </td>
      <td className="bor-cell bor-cell--num bor-cell--net" data-testid={`${testId}-net`}>
        {money(line.net_amount)}
      </td>

      {/* BY:142-147 — iki düzenlenebilir tutar. Ham `<input>` YASAK. */}
      <td className="bor-cell bor-cell--num">
        <Input
          size="row"
          numeric
          inputMode="decimal"
          className="bor-amount bor-amount--bank"
          value={bank}
          disabled={!editable || isPending}
          title={disabledReason}
          aria-label={`${line.personnel_name} — ${COL_BANK}`}
          onChange={(event) => setBank(event.target.value)}
          data-testid={`${testId}-bank`}
        />
      </td>
      <td className="bor-cell bor-cell--num">
        <Input
          size="row"
          numeric
          inputMode="decimal"
          className="bor-amount bor-amount--cash"
          value={cash}
          disabled={!editable || isPending}
          title={disabledReason}
          aria-label={`${line.personnel_name} — ${COL_CASH}`}
          onChange={(event) => setCash(event.target.value)}
          data-testid={`${testId}-cash`}
        />
      </td>

      {/* BY:148 — 🔴 K3: beş durumun HEPSİ ayrı etiket/rozet. */}
      <td className="bor-cell bor-cell--center">
        <Badge
          variant={LINE_STATUS_VARIANTS[line.status]}
          data-testid={`${testId}-status`}
        >
          {LINE_STATUS_LABELS[line.status]}
        </Badge>
        {/* 🔴 Devre dışı bırakma gerekçesi SATIRDAN türer ve GÖRÜNÜRDÜR —
            `title`da saklanmaz (K11 kanonu). */}
        {disabledReason !== undefined && (
          <span className="bor-row__reason" data-testid={`${testId}-reason`}>
            {disabledReason}
          </span>
        )}
        {rowError !== null && (
          <span className="bor-row__error" data-testid={`${testId}-error`}>
            {rowError}
          </span>
        )}
      </td>
    </tr>
  );
}

/** `null` para = "hesaplanamadı" ⇒ `—`; sıfır ile karıştırılmaz (S4). */
function money(value: string | null): string {
  return value === null ? EMPTY_VALUE : formatAmount(value);
}

/**
 * 🔴 BOR-GUN (2026-08-30) — BY:138 Gün hücresi.
 *
 * KUSUR: PUAN-SAAT-3 `days`i `int` → `Decimal` yaptı (adam-gün = `saat ÷ 9`)
 * ve JSON'da Decimal STRING gelir. Hücre değeri HAM basıyordu, ekran `23.00`
 * yazıyordu; mockup ise düz `21`/`23` çizer (BY:138/155). Aynı satırdaki BEŞ
 * para sütununun hepsi `money()`den geçiyordu, gün sütunu geçmiyordu —
 * asimetri kusurun ta kendisiydi. Dört kapı da yeşil geçmişti: tip iki tarafta
 * da `string | null`, yani "sözleşme kısıtı tipte yaşamaz" kanonu.
 *
 * 🔴 `null` hâli DEĞİŞMEDİ: `money()` ile aynı ayrım — `null` "hesaplanamadı"
 * demektir (BY:254 taşeron/serbest satırı `—` çizer), `0` DEĞİL.
 */
function dayCount(value: string | null): string {
  return value === null ? EMPTY_VALUE : formatDays(value);
}
