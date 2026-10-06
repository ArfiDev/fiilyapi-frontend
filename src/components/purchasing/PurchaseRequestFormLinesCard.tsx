import { Button, Input, Select } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import type { StockSummaryRow } from "@/lib/api/hooks/useStockSummary";
import { formatAmount, formatQuantity } from "@/lib/format";

import {
  estimatePurchaseApproval,
  purchaseTotalIncompleteNote,
} from "./purchase-request-approval";
import {
  CURRENT_STOCK_FREE_TEXT_REASON,
  CURRENT_STOCK_UNKNOWN_REASON,
  CURRENT_STOCK_UNSELECTED_REASON,
  EMPTY_VALUE,
  MAX_LENGTH,
  STOCK_ITEMS_EMPTY,
  STOCK_ITEMS_LOAD_ERROR,
} from "./purchase-request-form-constants";
import {
  purchaseRequestLineTotal,
  type PurchaseRequestFormValues,
  type PurchaseRequestLineSource,
  type PurchaseRequestLineValues,
} from "./purchase-request-form-state";
import type { PurchaseRequestFormErrors } from "./purchase-request-validate";

interface PurchaseRequestFormLinesCardProps {
  values: PurchaseRequestFormValues;
  errors: PurchaseRequestFormErrors;
  /** `GET /stock/summary` satırları — künye + SUNUCU türevi bakiye/durum. */
  stockRows: readonly StockSummaryRow[];
  stockIsLoading: boolean;
  stockIsError: boolean;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onChangeLine: (
    key: string,
    patch: Partial<Omit<PurchaseRequestLineValues, "key">>,
  ) => void;
}

/** FST 85 kırmızı · 94 kehribar — renk SUNUCUNUN `status` damgasından türer. */
function stockToneClass(row: StockSummaryRow | undefined): string {
  if (!row?.status) return "";
  if (row.status === "critical") return "saf-stock--critical";
  if (row.status === "low") return "saf-stock--low";
  return "";
}

/**
 * "Talep Edilen Malzemeler" tablosu (FST 66-117).
 *
 * DÖRT kalıcı karar:
 *
 * 1. **İKİ KAPILI kalem (104):** satır ya STOK KARTINA bağlanır ya da
 *    KATALOGSUZDUR (`free_text_name` + `free_text_unit`). Şema XOR uygular;
 *    ekran da tek bir "kaynak" seçiciyle iki kapıyı ayırır.
 * 2. **"Mevcut Stok" (75) SUNUCUDAN gelir** (`GET /stock/summary` →
 *    `balance`; kayıttan sonra aynı türev `current_stock` olarak döner).
 *    **KATALOGSUZ kalemde YOKTUR ve "0" YAZILMAZ** — şema açıklaması: "stok
 *    karti yoksa bakiye de yoktur ve 0 yazmak 'stokta yok' ile 'stok karti
 *    bile yok'u ayni gosterirdi". Hücre "—" + görünür gerekçe basar.
 * 3. **"Tahmini Tutar" (88/97) TÜREVDİR** ve fiyat yoksa `null`dur; toplama
 *    GİRMEZ ve sessizce 0 SAYILMAZ. Eksiklik tfoot'ta AÇIKÇA yazılır.
 * 4. **Mockup'ın örnek satırları BASILMAZ** (82-99: "Nervürlü Demir Ø12",
 *    322.500 …). Tablo tek boş satırla açılır.
 */
export function PurchaseRequestFormLinesCard({
  values,
  errors,
  stockRows,
  stockIsLoading,
  stockIsError,
  onAddLine,
  onRemoveLine,
  onChangeLine,
}: PurchaseRequestFormLinesCardProps) {
  // IZN-F4d.2/F4d.3: fiyatı gizli SATIR (`line.isPriceMasked`) salt okunur "—"; en az biri gizliyse toplam bilinmez.
  const isAnyPriceMasked = values.lines.some((line) => line.isPriceMasked === true);
  const rowsById = new Map(stockRows.map((row) => [row.id, row]));
  // Bu kart HÜKÜM BASMAZ (yalnız toplam + eksiklik notu), o yüzden eşik
  // BİLİNÇLİ olarak geçilmez — `undefined` açıkça yazılır ki parametreyi
  // unutmakla bilerek atlamak karışmasın.
  const estimate = estimatePurchaseApproval(values.lines, undefined);
  const incompleteNote = isAnyPriceMasked ? null : purchaseTotalIncompleteNote(estimate);
  const stockNote = stockIsError
    ? STOCK_ITEMS_LOAD_ERROR
    : !stockIsLoading && stockRows.length === 0
      ? STOCK_ITEMS_EMPTY
      : null;
  const stockDisabled = stockIsLoading || stockIsError;

  return (
    <section className="pf-card saf-lines">
      {/* 67-70 */}
      <header className="saf-lines__head">
        <span className="saf-lines__title">Talep Edilen Malzemeler</span>
        <Button
          variant="ghost"
          size="sm"
          className="saf-lines__add"
          data-testid="talep-kalem-ekle"
          onClick={onAddLine}
        >
          + Malzeme Ekle
        </Button>
      </header>

      {stockNote && (
        <p className="saf-lines__note" data-testid="talep-stok-note">
          {stockNote}
        </p>
      )}
      {errors.lines && (
        <p
          className="saf-lines__note saf-lines__note--error"
          data-testid="talep-kalem-hata"
        >
          {errors.lines}
        </p>
      )}

      <table className="saf-table">
        <thead>
          {/* 72-80 */}
          <tr>
            <th scope="col">Malzeme</th>
            <th scope="col" className="saf-table__center">
              Birim
            </th>
            <th scope="col" className="saf-table__right">
              Mevcut Stok
            </th>
            <th scope="col" className="saf-table__right saf-table__accent">
              Talep Miktarı
            </th>
            <th scope="col" className="saf-table__right">
              Tahmini B.Fiyat
              {isAnyPriceMasked && <HiddenMark />}
            </th>
            <th scope="col" className="saf-table__right">
              Tahmini Tutar
            </th>
            <th scope="col">
              <span className="sr-only">Satırı sil</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {values.lines.map((line, index) => {
            const stockRow =
              line.source === "stock"
                ? rowsById.get(line.stockItemId)
                : undefined;
            const lineErrors = errors.lineErrors[line.key];
            const total = line.isPriceMasked === true ? null : purchaseRequestLineTotal(line);
            const isCritical = stockRow?.status === "critical";
            // 84 — birim stok kartlı kalemde KARTIN birimidir, elle girilmez.
            const unit =
              line.source === "stock"
                ? stockRow?.unit
                : line.freeTextUnit.trim();
            const currentStockReason =
              line.source === "free"
                ? CURRENT_STOCK_FREE_TEXT_REASON
                : !line.stockItemId
                  ? CURRENT_STOCK_UNSELECTED_REASON
                  : CURRENT_STOCK_UNKNOWN_REASON;

            return (
              <tr
                key={line.key}
                data-testid={`talep-satir-${index}`}
                className={isCritical ? "saf-table__row--critical" : undefined}
              >
                {/* 83 / 92 */}
                <td>
                  <span className="saf-source">
                    <Select
                      size="row"
                      aria-label={`Kalem kaynağı (satır ${index + 1})`}
                      data-testid={`talep-kaynak-${index}`}
                      value={line.source}
                      onChange={(event) =>
                        onChangeLine(line.key, {
                          source: event.target
                            .value as PurchaseRequestLineSource,
                        })
                      }
                    >
                      {/* 104 — mockup'ın "Stok kartından seç veya yeni malzeme tanımla" ikiliği */}
                      <option value="stock">Stok kartından</option>
                      <option value="free">Serbest malzeme</option>
                    </Select>
                  </span>
                  {line.source === "stock" ? (
                    <>
                      <Select
                        size="row"
                        aria-label={`Malzeme (satır ${index + 1})`}
                        data-testid={`talep-malzeme-${index}`}
                        status={lineErrors?.stockItemId ? "error" : "default"}
                        disabled={stockDisabled}
                        value={line.stockItemId}
                        onChange={(event) =>
                          onChangeLine(line.key, {
                            stockItemId: event.target.value,
                          })
                        }
                      >
                        <option value="">Stok kartından malzeme seç…</option>
                        {stockRows.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name} · {row.code}
                          </option>
                        ))}
                      </Select>
                      {lineErrors?.stockItemId && (
                        <span className="saf-table__error">
                          {lineErrors.stockItemId}
                        </span>
                      )}
                      {/* 83 alt not (kritik) · 92 alt not (kart kodu) */}
                      {isCritical ? (
                        <span
                          className="saf-table__sub saf-table__sub--critical"
                          data-testid={`talep-kritik-stok-${index}`}
                        >
                          <WarningTriangleIcon {...inlineSymbolProps} /> Kritik
                          stok
                        </span>
                      ) : (
                        stockRow && (
                          <span className="saf-table__sub">
                            {stockRow.code}
                          </span>
                        )
                      )}
                    </>
                  ) : (
                    <>
                      <Input
                        size="row"
                        aria-label={`Malzeme adı (satır ${index + 1})`}
                        data-testid={`talep-serbest-ad-${index}`}
                        status={lineErrors?.freeTextName ? "error" : "default"}
                        maxLength={MAX_LENGTH.freeTextName}
                        placeholder="Yeni malzeme tanımla…"
                        value={line.freeTextName}
                        onChange={(event) =>
                          onChangeLine(line.key, {
                            freeTextName: event.target.value,
                          })
                        }
                      />
                      {lineErrors?.freeTextName && (
                        <span className="saf-table__error">
                          {lineErrors.freeTextName}
                        </span>
                      )}
                    </>
                  )}
                </td>

                {/* 84 / 93 */}
                <td className="saf-table__center saf-table__muted">
                  {line.source === "stock" ? (
                    (unit ?? EMPTY_VALUE)
                  ) : (
                    <>
                      <Input
                        size="row"
                        aria-label={`Birim (satır ${index + 1})`}
                        data-testid={`talep-serbest-birim-${index}`}
                        status={lineErrors?.freeTextUnit ? "error" : "default"}
                        maxLength={MAX_LENGTH.freeTextUnit}
                        placeholder="Adet"
                        value={line.freeTextUnit}
                        onChange={(event) =>
                          onChangeLine(line.key, {
                            freeTextUnit: event.target.value,
                          })
                        }
                      />
                      {lineErrors?.freeTextUnit && (
                        <span className="saf-table__error">
                          {lineErrors.freeTextUnit}
                        </span>
                      )}
                    </>
                  )}
                </td>

                {/* 85 / 94 — SUNUCU türevi; katalogsuz kalemde YOKTUR ("0" DEĞİL) */}
                <td
                  className={`saf-table__right saf-table__stock ${stockToneClass(stockRow)}`.trim()}
                  data-testid={`talep-mevcut-stok-${index}`}
                >
                  {stockRow ? (
                    formatQuantity(stockRow.balance)
                  ) : (
                    <>
                      {EMPTY_VALUE}
                      <span className="sr-only">{currentStockReason}</span>
                      <span className="saf-table__sub">
                        {currentStockReason}
                      </span>
                    </>
                  )}
                </td>

                {/* 86 / 95 */}
                <td className="saf-table__right">
                  <Input
                    size="row"
                    numeric
                    inputMode="decimal"
                    className="saf-table__input saf-table__input--accent"
                    aria-label={`Talep miktarı (satır ${index + 1})`}
                    data-testid={`talep-miktar-${index}`}
                    status={lineErrors?.quantity ? "error" : "default"}
                    value={line.quantity}
                    onChange={(event) =>
                      onChangeLine(line.key, { quantity: event.target.value })
                    }
                  />
                  {lineErrors?.quantity && (
                    <span className="saf-table__error">
                      {lineErrors.quantity}
                    </span>
                  )}
                </td>

                {/* 87 / 96 */}
                <td className="saf-table__right">
                  {line.isPriceMasked === true ? (
                    <span data-testid={`talep-fiyat-gizli-${index}`}>{EMPTY_VALUE}</span>
                  ) : (
                  <Input
                    size="row"
                    numeric
                    inputMode="decimal"
                    className="saf-table__input"
                    aria-label={`Tahmini birim fiyat (satır ${index + 1})`}
                    data-testid={`talep-fiyat-${index}`}
                    status={lineErrors?.unitPrice ? "error" : "default"}
                    value={line.unitPrice}
                    onChange={(event) =>
                      onChangeLine(line.key, { unitPrice: event.target.value })
                    }
                  />
                  )}
                  {lineErrors?.unitPrice && (
                    <span className="saf-table__error">
                      {lineErrors.unitPrice}
                    </span>
                  )}
                </td>

                {/* 88 / 97 — TÜREV; fiyat yoksa "—" (0 DEĞİL) */}
                <td
                  className="saf-table__right saf-table__amount"
                  data-testid={`talep-tutar-${index}`}
                >
                  {total === null ? EMPTY_VALUE : formatAmount(total)}
                </td>

                {/* 89 / 98 */}
                <td className="saf-table__center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="saf-table__remove"
                    aria-label={`Satırı sil (satır ${index + 1})`}
                    data-testid={`talep-satir-sil-${index}`}
                    onClick={() => onRemoveLine(line.key)}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            );
          })}

          {/* 100-107 */}
          <tr className="saf-table__adder">
            <td colSpan={7}>
              <Button
                variant="secondary"
                size="sm"
                className="saf-table__pick"
                data-testid="talep-kalem-ekle-alt"
                onClick={onAddLine}
              >
                + Stok kartından seç veya yeni malzeme tanımla
              </Button>
            </td>
          </tr>
        </tbody>

        <tfoot>
          {/* 110-114 */}
          <tr>
            <td colSpan={5}>TAHMİNİ TOPLAM</td>
            <td
              className="saf-table__right saf-table__total"
              data-testid="talep-toplam"
            >
              {isAnyPriceMasked ? EMPTY_VALUE : `₺${formatAmount(estimate.knownTotal)}`}
            </td>
            <td />
          </tr>
          {incompleteNote && (
            <tr>
              <td
                colSpan={7}
                className="saf-table__incomplete"
                data-testid="talep-toplam-eksik"
              >
                {incompleteNote}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </section>
  );
}
