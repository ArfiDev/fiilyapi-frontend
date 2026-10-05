import { useId } from "react";

import { DateInput, Field, Input, Select } from "@/components/ui";
import { MaskedReadonlyField } from "@/components/ui/hidden-mark/MaskedReadonlyField";

import {
  DEPRECIATION_YEAR_OPTIONS,
  FINANCE_CARD_TITLE,
  FINANCING_OPTIONS,
  MARKET_VALUE_HINT,
  NO_SUPPLIER_LABEL,
  RATE_PERIOD_OPTIONS,
  RENT_BLOCK_TITLE,
  SUPPLIER_SHARED_NOTE,
} from "./constants";
import type { EquipmentFormValues } from "./form-state";
import type { MaskableEquipmentMoneyField } from "./omit-fields";
import { isPurchaseAmountRequired, type EquipmentFormErrors } from "./validate";

/** "Tedarikçi / Kiralama Firması" seçicisinin veri durumu. */
export interface SupplierPickerState {
  items: readonly { id: string; name: string }[];
  isLoading: boolean;
  isError: boolean;
}

interface FinanceCardProps {
  values: EquipmentFormValues;
  onChange: <K extends keyof EquipmentFormValues>(
    field: K,
    value: EquipmentFormValues[K],
  ) => void;
  suppliers: SupplierPickerState;
  errors?: EquipmentFormErrors;
  /** IZN-F4d.2 — maskeli para alanları: salt okunur "—" + kilit (PATCH gövdesine konmaz). */
  maskedMoney?: readonly MaskableEquipmentMoneyField[];
}

/** Sessiz boş açılır liste YASAK — seçicinin altında her durumda görünür not. */
export function supplierNote(state: SupplierPickerState): string {
  if (state.isLoading) return "Yükleniyor…";
  if (state.isError) {
    return "Tedarikçi listesi yüklenemedi — ekipmanı tedarikçi bağlamadan da kaydedebilirsiniz.";
  }
  if (state.items.length === 0) {
    return "Kayıtlı tedarikçi yok — ekipmanı tedarikçi bağlamadan kaydedebilirsiniz.";
  }
  return SUPPLIER_SHARED_NOTE;
}

/**
 * 💰 Mali Bilgiler (mockup satır 95-112) — üstte alış bloğu (97-104), ince
 * ayraç (105), altta kiralık bloğu (106-111).
 *
 * 🔴 **K8:** "Alış Bedeli"nin `*` işareti `ownership === "owned"` iken
 * GÖRÜNÜR, `rented`ta DÜŞER — görünen zorunluluk ile uygulanan zorunluluk
 * (`validate.ts`) AYNI kaynaktan (`isPurchaseAmountRequired`) beslenir.
 *
 * 🔴 **MK-1 K3:** "Tedarikçi / Satıcı" (101) ve "Kiralama Firması" (108)
 * mockup'ta iki alandır ama TEK `supplier_id`dir — iki kontrol de AYNI form
 * durumunu okur/yazar, ikinci bir state YOKTUR. Mockup 101'i serbest metin
 * çiziyor; FK olduğu için seçiciye çevrildi (onaylı sapma, not GÖRÜNÜR).
 */
export function FinanceCard({ values, onChange, suppliers, errors, maskedMoney = [] }: FinanceCardProps) {
  const supplierNoteId = useId();
  const purchaseRequired = isPurchaseAmountRequired(values);

  /** İki tedarikçi seçicisinin ORTAK seçenek listesi — tek yerde üretilir. */
  const supplierOptions = (
    <>
      <option value="">{NO_SUPPLIER_LABEL}</option>
      {/* Düzenleme kipinde kaydın tedarikçisi listede olmayabilir (pasif,
          yetki süzgeci) — seçim sessizce KIRPILMASIN diye korunur. */}
      {values.supplierId &&
        !suppliers.items.some((item) => item.id === values.supplierId) && (
          <option value={values.supplierId}>Kayıtlı tedarikçi (listede yok)</option>
        )}
      {suppliers.items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </>
  );

  return (
    <section className="pf-card">
      {/* 96 */}
      <h2 className="pf-card__title">{FINANCE_CARD_TITLE}</h2>

      {/* 97 — üç sütun */}
      <div className="pf-grid pf-grid--3">
        {/* 98 — K8 koşullu zorunluluk */}
        {maskedMoney.includes("purchase_amount") ? (
          <MaskedReadonlyField label="Alış Bedeli (₺)" inputClassName="eqf-amount" />
        ) : (
        <Field label="Alış Bedeli (₺)" required={purchaseRequired} error={errors?.purchaseAmount}>
          {(control) => (
            <Input
              {...control}
              type="number"
              numeric
              min={0}
              step="0.01"
              className="eqf-amount"
              value={values.purchaseAmount}
              placeholder="3800000"
              status={errors?.purchaseAmount ? "error" : "default"}
              onChange={(event) => onChange("purchaseAmount", event.target.value)}
            />
          )}
        </Field>
        )}

        {/* 99 */}
        <Field label="Alış Tarihi">
          {(control) => (
            <DateInput
              {...control}
              value={values.purchaseDate}
              onValueChange={(iso) => onChange("purchaseDate", iso)}
            />
          )}
        </Field>

        {/* 100 — boş seçenek YOK → K5 kapısı */}
        <Field label="Amortisman Süresi (Yıl)">
          {(control) => (
            <Select
              {...control}
              value={values.depreciationYears}
              onChange={(event) => onChange("depreciationYears", event.target.value)}
            >
              {/* Sunucudaki yıl mockup'ın üçlüsü DIŞINDA olabilir (serbest
                  tamsayı, MK-1 §2.1) — sessizce KIRPILMASIN diye korunur. */}
              {!DEPRECIATION_YEAR_OPTIONS.some(
                (option) => option.value === values.depreciationYears,
              ) && (
                <option value={values.depreciationYears}>
                  {values.depreciationYears} Yıl
                </option>
              )}
              {DEPRECIATION_YEAR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 101 — mockup serbest metin; FK olduğu için seçici (MK-1 K3) */}
        <Field label="Tedarikçi / Satıcı">
          {(control) => (
            <Select
              {...control}
              aria-describedby={
                [control["aria-describedby"], supplierNoteId].filter(Boolean).join(" ") ||
                undefined
              }
              value={values.supplierId}
              onChange={(event) => onChange("supplierId", event.target.value)}
            >
              {supplierOptions}
            </Select>
          )}
        </Field>

        {/* 102 — boş seçenek YOK → K5 kapısı */}
        <Field label="Kredi ile Alındı mı?">
          {(control) => (
            <Select
              {...control}
              value={values.financing}
              onChange={(event) =>
                onChange("financing", event.target.value as EquipmentFormValues["financing"])
              }
            >
              {FINANCING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 103 — ipucu mockup'tan AYNEN */}
        {maskedMoney.includes("market_value") ? (
          <MaskedReadonlyField label="Güncel Piyasa Değeri (₺)" inputClassName="eqf-amount" />
        ) : (
        <Field label="Güncel Piyasa Değeri (₺)" hint={MARKET_VALUE_HINT}>
          {(control) => (
            <Input
              {...control}
              type="number"
              numeric
              min={0}
              step="0.01"
              className="eqf-amount"
              value={values.marketValue}
              placeholder="3200000"
              onChange={(event) => onChange("marketValue", event.target.value)}
            />
          )}
        </Field>
        )}
      </div>

      {/* Sessiz boş açılır liste YASAK: iki tedarikçi seçicisinin ORTAK notu. */}
      <p className="eqf-picker-note" id={supplierNoteId}>
        {supplierNote(suppliers)}
      </p>

      {/* 105 — ince ayraç */}
      <div className="eqf-divider" />

      {/* 106 */}
      <p className="eqf-block-title">{RENT_BLOCK_TITLE}</p>

      {/* 107 — üç sütun */}
      <div className="pf-grid pf-grid--3">
        {/* 108 — 101 ile AYNI alan (`supplier_id`), ikinci state YOK */}
        <Field label="Kiralama Firması">
          {(control) => (
            <Select
              {...control}
              aria-describedby={
                [control["aria-describedby"], supplierNoteId].filter(Boolean).join(" ") ||
                undefined
              }
              value={values.supplierId}
              onChange={(event) => onChange("supplierId", event.target.value)}
            >
              {supplierOptions}
            </Select>
          )}
        </Field>

        {/* 109 — boş seçenek YOK → K5 kapısı */}
        <Field label="Kira Tipi">
          {(control) => (
            <Select
              {...control}
              value={values.ratePeriod}
              onChange={(event) =>
                onChange("ratePeriod", event.target.value as EquipmentFormValues["ratePeriod"])
              }
            >
              {RATE_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* 110 */}
        {maskedMoney.includes("rate_amount") ? (
          <MaskedReadonlyField label="Kira Bedeli (₺)" inputClassName="eqf-amount" />
        ) : (
        <Field label="Kira Bedeli (₺)">
          {(control) => (
            <Input
              {...control}
              type="number"
              numeric
              min={0}
              step="0.01"
              className="eqf-amount"
              value={values.rateAmount}
              placeholder="320"
              onChange={(event) => onChange("rateAmount", event.target.value)}
            />
          )}
        </Field>
        )}
      </div>
    </section>
  );
}
