"use client";

import { useEffect, useState } from "react";

import { Badge, Input } from "@/components/ui";
import { formatAmount, formatDecimal, formatPeriod } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type {
  RentalInvoiceDetailResponse,
  RentalInvoiceLineResponse,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";

import {
  RENTAL_COLUMNS,
  RENTAL_COLUMN_LABEL,
  RENTAL_EMPTY_CELL,
  VARIANCE_BADGE_VARIANT,
} from "./rental-labels";
import {
  rentalHoursVarianceTotal,
  rentalPayableUnavailable,
  rentalRowCells,
  rentalUnknownWarning,
  rentalVarianceTotalLabel,
  type RentalCellContent,
  type RentalEditableField,
} from "./rental-derive";

export interface RentalLinesTableProps {
  detail: RentalInvoiceDetailResponse;
  /** `draft`/`pending_verification` dışında satır PATCH'i 409'dur. */
  isEditable: boolean;
  isSaving: boolean;
  onSaveLine: (lineId: string, field: RentalEditableField, value: string | null) => void;
}

/**
 * M5:80-174 — "Ekipman Kira Listesi" tablosu.
 *
 * 🔴 K3 — YIRTIK TABLO: mockup `thead`i DOKUZ kolon (M5:88-96) sayar ama
 * tbody'nin 3. ve 4. satırı yalnız YEDİ hücre, `tfoot`un dört satırı da SEKİZ
 * taşır. Kanon (MK-1 K15'in bu dilimdeki hâli): `thead` KAZANIR. Her satır
 * `rentalRowCells` ile tam dokuza tamamlanır, veri olmayan hücre mockup'ın
 * KENDİ işaretiyle (`—`, M5:135) basılır; `tfoot` satırları `colSpan` ile
 * dokuza hizalanır.
 */
export function RentalLinesTable({
  detail,
  isEditable,
  isSaving,
  onSaveLine,
}: RentalLinesTableProps) {
  const variance = rentalHoursVarianceTotal(detail.lines);
  const unknownWarning = rentalUnknownWarning(detail.totals);
  const payableUnavailable = rentalPayableUnavailable(detail.totals);

  return (
    <section className="makine-kira__card" aria-labelledby="makine-kira-lines-title">
      {/* M5:81-84 — başlık şeridi: "Ekipman Kira Listesi — Temmuz 2026". */}
      <header className="makine-kira__card-head">
        <span id="makine-kira-lines-title" className="makine-kira__card-title">
          Ekipman Kira Listesi {"—"} {formatPeriod(detail.period_year, detail.period_month)}
        </span>
        {/* M5:83 — satırların kaynağı: sunucu onları çalışma kaydından KURAR. */}
        <span className="makine-kira__card-note">Çalışma kaydından otomatik yüklendi</span>
      </header>

      <div className="makine-kira__table-scroll">
        <table className="makine-kira__lines" data-testid="makine-kira-lines">
          <thead>
            <tr>
              {RENTAL_COLUMNS.map((column) => (
                <th key={column} scope="col" className={`makine-kira__col--${column}`}>
                  {RENTAL_COLUMN_LABEL[column]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {detail.lines.map((line) => (
              <RentalLineRow
                key={line.id}
                line={line}
                isEditable={isEditable}
                isSaving={isSaving}
                onSaveLine={onSaveLine}
              />
            ))}
            {detail.lines.length === 0 && (
              <tr>
                <td colSpan={RENTAL_COLUMNS.length} className="makine-kira__empty">
                  Bu dönemde kiralanan ekipman kaydı bulunamadı.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            {/* M5:154-158 — "Bizim Hesap (Çalışma Kaydından)". */}
            <tr className="makine-kira__foot makine-kira__foot--ours">
              <td colSpan={6}>Bizim Hesap (Çalışma Kaydından)</td>
              <td className="makine-kira__num makine-kira__mono" data-testid="makine-kira-our-total">
                {"₺"}
                {formatAmount(detail.totals.our_total)}
              </td>
              <td colSpan={2} />
            </tr>

            {/* M5:159-163 — "Kiralama Firması Faturası (Gelen)" + varyans rozeti. */}
            <tr className="makine-kira__foot makine-kira__foot--theirs">
              <td colSpan={6}>Kiralama Firması Faturası (Gelen)</td>
              <td
                colSpan={2}
                className="makine-kira__num makine-kira__mono"
                data-testid="makine-kira-invoice-amount"
              >
                {detail.totals.invoice_amount === null
                  ? RENTAL_EMPTY_CELL
                  : `₺${formatAmount(detail.totals.invoice_amount)}`}
              </td>
              <td className="makine-kira__center">
                {/* 🔴 K6 — ROZET İSTEMCİDE TÜRETİLİR ve SAAT farkını basar.
                    `RentalInvoiceTotals`ta toplam varyans alanı YOKTUR (on alanı
                    ölçüldü); `lines[]`ten türer. Mockup M5:162 bu rozeti tutar
                    satırının yanına koymuş ama oradaki tutar farkı (20.416) tam
                    olarak KDV'ye eşittir (tesadüf) — 6 saatlik fark 1.680 ederdi.
                    Yani rozet tutarı DEĞİL saati anlatır. */}
                <Badge
                  variant={VARIANCE_BADGE_VARIANT[variance.status]}
                  data-testid="makine-kira-variance-total"
                >
                  {rentalVarianceTotalLabel(variance)}
                </Badge>
              </td>
            </tr>

            {/* M5:164-167 — KDV satırı. 🔴 K9: oran ve tutar SUNUCUDAN gelir,
                ekran yeniden HESAPLAMAZ (yapısal yasak `rental-derive.ts`te). */}
            <tr className="makine-kira__foot makine-kira__foot--vat">
              <td colSpan={8}>KDV (%{formatDecimal(detail.totals.vat_rate, 2)})</td>
              <td className="makine-kira__num makine-kira__mono" data-testid="makine-kira-vat">
                {detail.totals.vat_amount === null
                  ? RENTAL_EMPTY_CELL
                  : `₺${formatAmount(detail.totals.vat_amount)}`}
              </td>
            </tr>

            {/* M5:168-171 — ödenecek toplam. */}
            <tr className="makine-kira__foot makine-kira__foot--payable">
              <td colSpan={8}>KİRALAMA FİRMASINA ÖDENECEK TOPLAM</td>
              <td
                className="makine-kira__num makine-kira__mono makine-kira__payable"
                data-testid="makine-kira-payable"
              >
                {detail.totals.payable_total === null
                  ? RENTAL_EMPTY_CELL
                  : `₺${formatAmount(detail.totals.payable_total)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 🔴 K8 — fail-closed sayaçlar SESSİZ KALMAZ. Bedeli bilinmediği için
          toplama girmeyen satır varsa kullanıcı eksik bir parayı TAM sanırdı. */}
      {unknownWarning !== null && (
        <p className="makine-kira__warning" data-testid="makine-kira-unknown-warning">
          {unknownWarning}
        </p>
      )}

      {/* 🔴 K9 — matrah yoksa KDV ve ödenecek toplam da yoktur; uydurma sayı
          yerine görünür bir gerekçe basılır (zarif düşüş, sessiz atlama YOK). */}
      {payableUnavailable !== null && (
        <p className="makine-kira__warning" data-testid="makine-kira-payable-warning">
          {payableUnavailable}
        </p>
      )}
    </section>
  );
}

interface RentalLineRowProps {
  line: RentalInvoiceLineResponse;
  isEditable: boolean;
  isSaving: boolean;
  onSaveLine: (lineId: string, field: RentalEditableField, value: string | null) => void;
}

function RentalLineRow({ line, isEditable, isSaving, onSaveLine }: RentalLineRowProps) {
  const cells = rentalRowCells(line);
  return (
    <tr data-rental-line-id={line.id} data-line-kind={line.line_kind}>
      {cells.map((cell) => (
        <td
          key={cell.column}
          className={`makine-kira__col--${cell.column}`}
          data-column={cell.column}
        >
          <RentalCellView
            content={cell.content}
            lineId={line.id}
            isEditable={isEditable}
            isSaving={isSaving}
            onSaveLine={onSaveLine}
          />
        </td>
      ))}
    </tr>
  );
}

interface RentalCellViewProps {
  content: RentalCellContent;
  lineId: string;
  isEditable: boolean;
  isSaving: boolean;
  onSaveLine: (lineId: string, field: RentalEditableField, value: string | null) => void;
}

function RentalCellView({
  content,
  lineId,
  isEditable,
  isSaving,
  onSaveLine,
}: RentalCellViewProps) {
  switch (content.kind) {
    case "empty":
      return <span className="makine-kira__muted">{RENTAL_EMPTY_CELL}</span>;

    case "identity":
      return (
        <>
          <span className="makine-kira__line-name">{content.title}</span>
          {content.subtitle !== null && (
            <span className="makine-kira__line-sub">{content.subtitle}</span>
          )}
        </>
      );

    case "text":
      return <>{content.value}</>;

    case "badge":
      return <Badge variant={content.variant}>{content.label}</Badge>;

    case "amount":
      return (
        // M5:138 — hariç tutulan tutar ÜSTÜ ÇİZİLİ basılır (arıza satırı
        // faturaya dahil edilmedi); anlam yalnız çizgide kalmasın diye
        // `title` da taşır.
        <span
          className={content.excluded ? "makine-kira__amount--excluded" : "makine-kira__amount"}
          title={content.excluded ? "Hariç tutuldu — ödenecek toplama girmez" : undefined}
        >
          {formatAmount(content.value)}
        </span>
      );

    case "editable":
      return (
        <RentalEditableCell
          lineId={lineId}
          field={content.field}
          value={content.value}
          placeholder={content.placeholder}
          isEditable={isEditable}
          isSaving={isSaving}
          onSaveLine={onSaveLine}
        />
      );
  }
}

interface RentalEditableCellProps {
  lineId: string;
  field: RentalEditableField;
  value: string | null;
  placeholder: string | null;
  isEditable: boolean;
  isSaving: boolean;
  onSaveLine: (lineId: string, field: RentalEditableField, value: string | null) => void;
}

const FIELD_LABEL: Record<RentalEditableField, string> = {
  rate_amount: "Kira birim fiyatı",
  invoiced_hours: "Fatura saati",
};

/**
 * M5:109/111 — satır içi iki düzenlenebilir kutu (`Kira B.F.` + `Fatura Saati`).
 *
 * 🔴 F-İK "touched" dersi: sunucudaki değer, kullanıcı kutuya DOKUNMADIKÇA
 * ezilmez. Kutu yalnız `blur`da ve değer GERÇEKTEN değiştiyse PATCH atar;
 * dokunulmamış kutu hiçbir istek üretmez. Ayrıca sunucudan yeni bir değer
 * gelirse (başka bir kullanıcı ya da kendi kaydımız) taslak metin tazelenir.
 */
function RentalEditableCell({
  lineId,
  field,
  value,
  placeholder,
  isEditable,
  isSaving,
  onSaveLine,
}: RentalEditableCellProps) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  // SEKME-F1.3b — `PayrollLineRow` emsali: odak çıkışında anında kaydeden
  // hücrede de yazım ile blur arasında kısa bir pencere vardır; erken
  // dönüşten (`!isEditable`) ÖNCE çağrılır.
  useUnsavedChanges(draft.trim() !== (value ?? "").trim(), FIELD_LABEL[field]);

  if (!isEditable) {
    // Kilitli durumda (approved/paid) kutu YOKTUR — PATCH 409 döner, çalışmayan
    // bir kontrol göstermek kullanıcıyı yanıltırdı.
    return value === null ? (
      <span className="makine-kira__muted">{RENTAL_EMPTY_CELL}</span>
    ) : (
      <span className="makine-kira__mono">{formatAmount(value)}</span>
    );
  }

  return (
    <Input
      size="row"
      numeric
      inputMode="decimal"
      className={`makine-kira__row-input makine-kira__row-input--${field}`}
      aria-label={FIELD_LABEL[field]}
      data-testid={`makine-kira-${field}`}
      data-line-id={lineId}
      disabled={isSaving}
      value={draft}
      placeholder={placeholder ?? undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const next = trimmed === "" ? null : trimmed;
        // Dokunulmamış/değişmemiş kutu istek ÜRETMEZ.
        if (next === (value ?? null)) return;
        onSaveLine(lineId, field, next);
      }}
    />
  );
}
