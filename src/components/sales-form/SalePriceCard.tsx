import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { Field, Input, Select } from "@/components/ui";
import type { UnitResponse } from "@/lib/api/hooks/useProjectUnits";
import { formatAmount } from "@/lib/format";

import {
  EMPTY_METRIC,
  SALE_PROFIT_FORMULA,
  SALE_PROFIT_UNKNOWN_REASON,
  VAT_OPTIONS,
} from "./constants";
import { salePriceNumber, type SaleFormValues } from "./form-state";
import type { SaleFormErrors } from "./validate";
import { deriveUnitCost, deriveSaleProfit } from "./unit-info";

interface SalePriceCardProps {
  values: SaleFormValues;
  errors: SaleFormErrors;
  selectedUnit: UnitResponse | null;
  onChangeField: <K extends keyof SaleFormValues>(field: K, value: SaleFormValues[K]) => void;
  locked: boolean;
}

/**
 * "Satış Bedeli" kartı (DS 80-93) + "Bu Satıştan Kâr" türevi (89-92).
 *
 * ⚠️ Liste Fiyatı (84) readonly'dir ve seçili ünitenin `list_price`ından gelir;
 * kullanıcı DEĞİŞTİRMEZ. Satış Bedeli (86) serbesttir — `min_sale_price`
 * zorlaması YOK (P8 kararı), UI engellemez.
 *
 * ⚠️ "Bu Satıştan Kâr": maliyet SUNUCUDAN (`unit_cost`), bedel kullanıcıdan.
 * Maliyet yoksa "—" (istemci maliyet UYDURMAZ).
 */
export function SalePriceCard({
  values,
  errors,
  selectedUnit,
  onChangeField,
  locked,
}: SalePriceCardProps) {
  const listPrice = selectedUnit?.list_price ?? null;
  const cost = selectedUnit ? deriveUnitCost(selectedUnit) : { available: false, text: null, rawValue: null, pendingModule: null, isRestricted: false };
  const profit = deriveSaleProfit(salePriceNumber(values), cost);

  return (
    <section className="pf-card">
      <h2 className="pf-card__title">💰 Satış Bedeli</h2>

      <div className="pf-grid pf-grid--4">
        {/* 84 — readonly, üniteden */}
        <Field label="Liste Fiyatı (₺)">
          {(control) => (
            <Input
              {...control}
              className="sf-amount-input sf-price-readonly"
              data-testid="satis-form-liste-fiyat"
              readOnly
              value={listPrice === null ? "" : formatAmount(listPrice)}
              onChange={() => undefined}
            />
          )}
        </Field>

        {/* 85 */}
        <Field label="İndirim (₺)" error={errors.discountAmount}>
          {(control) => (
            <Input
              {...control}
              className="sf-amount-input"
              inputMode="decimal"
              data-testid="satis-form-indirim"
              readOnly={locked}
              value={values.discountAmount}
              onChange={(event) => onChangeField("discountAmount", event.target.value)}
            />
          )}
        </Field>

        {/* 86 — mor vurgulu, zorunlu */}
        <Field label="Satış Bedeli (₺)" required error={errors.salePrice}>
          {(control) => (
            <Input
              {...control}
              className="sf-amount-input sf-price-emphasis"
              inputMode="decimal"
              data-testid="satis-form-satis-bedeli"
              readOnly={locked}
              value={values.salePrice}
              onChange={(event) => onChangeField("salePrice", event.target.value)}
            />
          )}
        </Field>

        {/* 87 */}
        <Field label="KDV Oranı">
          {(control) => (
            <Select
              {...control}
              data-testid="satis-form-kdv"
              disabled={locked}
              value={values.vatPct}
              onChange={(event) => onChangeField("vatPct", event.target.value)}
            >
              {VAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* 89-92 — kâr kutusu */}
      <div
        className={`sf-profit${profit.isLoss ? " sf-profit--loss" : ""}`}
        data-testid="satis-form-kar"
      >
        <div>
          <div className="sf-profit__label">Bu Satıştan Kâr</div>
          <div className="sf-profit__formula">
            {profit.available ? SALE_PROFIT_FORMULA : cost.isRestricted ? HIDDEN_FIELD_HINT : SALE_PROFIT_UNKNOWN_REASON}
          </div>
        </div>
        <div>
          <div className="sf-profit__amount">
            {profit.available ? `₺${profit.amountText}` : EMPTY_METRIC}
            {!profit.available && cost.isRestricted && <HiddenMark />}
          </div>
          {profit.available && profit.marginPct !== null && (
            <div className="sf-profit__margin">%{profit.marginPct} marj</div>
          )}
        </div>
      </div>
    </section>
  );
}
