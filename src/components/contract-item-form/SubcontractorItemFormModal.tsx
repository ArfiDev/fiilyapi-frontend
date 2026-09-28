"use client";

import { useRef, useState } from "react";

import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { backendErrorMessage } from "@/lib/api/error-message";
import { formatAmount } from "@/lib/format";
import { useCreateSubcontractorContractItem } from "@/lib/api/hooks/useSubcontractorContractMutations";
import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";

import { buildSubcontractorItemBody, nextSortOrder } from "./build-body";
import { lineTotalPreview } from "./line-total";
import {
  MAX_LENGTH,
  SUBCONTRACTOR_ITEM_TEXT as TEXT,
  UNIT_OPTIONS,
  UNIT_PLACEHOLDER_OPTION,
  UNPRICED_ITEM_WARNING_BODY,
  UNPRICED_ITEM_WARNING_LEAD,
} from "./constants";
import { SummaryRow } from "./SummaryRow";
import { validateSubcontractorItem, type ContractItemFormValues } from "./validate";
import "./contract-item-form.css";

/**
 * TAŞ · `Form - Poz Ekle Taseron.dc.html` (F-BLG T2a).
 * Uç: `POST /subcontractor-contracts/{contract_id}/items`.
 *
 * Mockup'ın FORM gövdesi (87-204) birebir; üst şerit/sol menü (40-70)
 * uygulamanın kabuğudur ve çizilmez, sözleşme bağlam bandı (78-85) da
 * altındaki TSD başlık kartıyla aynı bilgiyi taşıdığı için tekrarlanmaz.
 *
 * 🔴 `unit_price` BOŞ bırakılabilir (142) ve boş bırakıldığında mockup'ın
 * turuncu uyarısı (143-147) basılır — fiyatsız poz bilinçli bir karardır.
 */
export interface SubcontractorItemFormModalProps {
  contractId: string;
  /** Sıra varsayılanı + "Sözleşme Durumu" sayaçları buradan türetilir. */
  items: readonly SubcontractorContractItemResponse[];
  /** 182 · sunucunun türev toplamı (başlıktaki sabit sayı KOPYALANMAZ). */
  contractTotal: string | null;
  /** 180 · `items_missing_price`. */
  itemsMissingPrice: number;
  onClose: () => void;
}

const EMPTY_VALUES: ContractItemFormValues = {
  code: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  sortOrder: "",
};

export function SubcontractorItemFormModal({
  contractId,
  items,
  contractTotal,
  itemsMissingPrice,
  onClose,
}: SubcontractorItemFormModalProps) {
  const createItem = useCreateSubcontractorContractItem(contractId);

  const [values, setValues] = useState<ContractItemFormValues>(EMPTY_VALUES);
  // SEKME-F1.3b — taban anlık görüntüsü; `keepOpen` sonrası `setValues(EMPTY_VALUES)`
  // ile birlikte AYNI YERDE tazelenir.
  const [initialValues, setInitialValues] = useState(EMPTY_VALUES);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Taşeron poz formu");
  const [keepOpen, setKeepOpen] = useState(true); // 197 · varsayılan işaretli
  const [formError, setFormError] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);
  const sortOrderRef = useRef<HTMLInputElement>(null);

  // 101 · mockup'ın "6"sı GÖSTERMELİKtir; gerçek varsayılan listeden gelir.
  const defaultSortOrder = nextSortOrder(items.map((item) => item.sort_order));
  const hasPrice = values.unitPrice.trim().length > 0;
  const preview = lineTotalPreview(values.quantity, values.unitPrice);

  function set<K extends keyof ContractItemFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function focusField(field: string) {
    const map: Record<string, { focus: () => void } | null | undefined> = {
      code: codeRef.current,
      description: descriptionRef.current,
      unit: unitRef.current,
      quantity: quantityRef.current,
      unitPrice: unitPriceRef.current,
      sortOrder: sortOrderRef.current,
    };
    map[field]?.focus();
  }

  async function handleSubmit() {
    const problem = validateSubcontractorItem(values);
    if (problem) {
      setSavedCode(null);
      setFormError(problem.message);
      focusField(problem.field);
      return;
    }
    setFormError(null);

    const body = buildSubcontractorItemBody(values, defaultSortOrder);
    try {
      await createItem.mutateAsync(body);
    } catch (err) {
      setSavedCode(null);
      setFormError(backendErrorMessage(err));
      return;
    }

    // 198 · "Kaydettikten sonra yeni poz ekle" işaretliyse form boşalır ve
    // diyalog AÇIK kalır; değilse kapanır.
    if (!keepOpen) {
      onClose();
      return;
    }
    setSavedCode(body.code);
    setValues(EMPTY_VALUES);
    setInitialValues(EMPTY_VALUES);
    codeRef.current?.focus();
  }

  const pricedCount = items.length - itemsMissingPrice;

  return (
    <Modal
      title={TEXT.title}
      className="pif-modal"
      onClose={onClose}
      footer={
        <>
          {/* 196-199 · onay kutusu şeridin SOLUNDA */}
          <span className="pif__keep-open">
            <Checkbox
              size="lg"
              label={TEXT.keepOpen}
              checked={keepOpen}
              disabled={createItem.isPending}
              onChange={(event) => setKeepOpen(event.target.checked)}
              data-testid="tsi-keep-open"
            />
          </span>
          <Button variant="secondary" onClick={onClose} disabled={createItem.isPending}>
            {TEXT.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={createItem.isPending}>
            {TEXT.submit}
          </Button>
        </>
      }
    >
      <p className="pif__title">{TEXT.subtitle}</p>

      <div className="pif">
        {/* ── SOL: form (90-158) ─────────────────────────────────────────── */}
        <div>
          <section className="pif-card">
            <h3 className="pif-card__title">{TEXT.definitionCard}</h3>
            <div className="pif-grid pif-grid--code">
              <Field label={TEXT.code} required hint={TEXT.codeHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={codeRef}
                    numeric
                    maxLength={MAX_LENGTH.code}
                    placeholder={TEXT.codePlaceholder}
                    value={values.code}
                    onChange={(event) => set("code", event.target.value)}
                  />
                )}
              </Field>
              <Field label={TEXT.sortOrder} hint={TEXT.sortOrderHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={sortOrderRef}
                    type="number"
                    numeric
                    min={0}
                    placeholder={String(defaultSortOrder)}
                    value={values.sortOrder}
                    onChange={(event) => set("sortOrder", event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label={TEXT.description} required hint={TEXT.descriptionHint}>
              {(control) => (
                <Textarea
                  {...control}
                  ref={descriptionRef}
                  rows={3}
                  maxLength={MAX_LENGTH.description}
                  placeholder={TEXT.descriptionPlaceholder}
                  value={values.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              )}
            </Field>
          </section>

          <section className="pif-card">
            <h3 className="pif-card__title">{TEXT.amountCard}</h3>
            <div className="pif-grid pif-grid--two">
              <Field label={TEXT.unit} required hint={TEXT.unitHint}>
                {(control) => (
                  <Select
                    {...control}
                    ref={unitRef}
                    value={values.unit}
                    onChange={(event) => set("unit", event.target.value)}
                  >
                    <option value="">{UNIT_PLACEHOLDER_OPTION}</option>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={TEXT.quantity} required hint={TEXT.quantityHint}>
                {(control) => (
                  <Input
                    {...control}
                    ref={quantityRef}
                    type="number"
                    numeric
                    min={0}
                    placeholder={TEXT.quantityPlaceholder}
                    value={values.quantity}
                    onChange={(event) => set("quantity", event.target.value)}
                  />
                )}
              </Field>
            </div>

            {/* 140-148 · kritik alan: kehribar kutu + fiyatsız poz uyarısı */}
            <div className="pif-price">
              <Field label={TEXT.unitPrice}>
                {(control) => (
                  <Input
                    {...control}
                    ref={unitPriceRef}
                    type="number"
                    numeric
                    min={0}
                    className="pif-price__input"
                    placeholder={TEXT.unitPricePlaceholder}
                    value={values.unitPrice}
                    onChange={(event) => set("unitPrice", event.target.value)}
                  />
                )}
              </Field>
              {!hasPrice && (
                <p className="pif-warn" data-testid="tsi-unpriced-warning">
                  {/* Mockup 144'teki `⚠` — F-SEM kanonu: çıplak sembol yerine
                      inline SVG (alt-küme fontlarında bu glif YOK). */}
                  <span className="pif-warn__icon" aria-hidden="true">
                    <WarningTriangleIcon {...inlineSymbolProps} />
                  </span>
                  <span>
                    <strong>{UNPRICED_ITEM_WARNING_LEAD}</strong>
                    {UNPRICED_ITEM_WARNING_BODY}
                  </span>
                </p>
              )}
            </div>

            {/* 150-156 · yalnız GÖRÜNTÜ; hiçbir isteğe konmaz */}
            <div className="pif-total">
              <div className="pif-total__row">
                <span className="pif-total__label">{TEXT.lineTotal}</span>
                <span className="pif-total__value" data-testid="tsi-line-total">
                  {preview === null ? TEXT.lineTotalUnpriced : `₺ ${formatAmount(preview)}`}
                </span>
              </div>
              <p className="pif-total__hint">{TEXT.lineTotalHint}</p>
            </div>
          </section>
        </div>

        {/* ── SAĞ: özet (161-192) ────────────────────────────────────────── */}
        <aside className="pif__side">
          <section className="pif-card pif-card--flush">
            <h3 className="pif-card__subtitle">{TEXT.summaryCard}</h3>
            <div className="pif-summary">
              <SummaryRow label={TEXT.code} value={values.code.trim()} />
              <SummaryRow label={TEXT.quantity} value={values.quantity.trim()} />
              <div className="pif-summary__row">
                <span className="pif-summary__label">{TEXT.summaryUnitPrice}</span>
                <span
                  className={
                    hasPrice
                      ? "pif-summary__value pif-summary__value--filled"
                      : "pif-summary__value pif-summary__value--missing"
                  }
                  data-testid="tsi-summary-price"
                >
                  {hasPrice ? values.unitPrice.trim() : TEXT.summaryUnitPriceMissing}
                </span>
              </div>
              {/* 168-171 · mockup yalnız FİYATSIZ durumu çizmiştir. */}
              {!hasPrice && (
                <div className="pif-summary__status">
                  <span className="pif-summary__status-label">{TEXT.summaryStatus}</span>
                  <span className="pif-summary__status-badge" data-testid="tsi-summary-status">
                    {TEXT.summaryStatusUnpriced}
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="pif-card pif-card--flush pif-card--muted">
            <h3 className="pif-card__subtitle">{TEXT.contractCard}</h3>
            <div className="pif-stats">
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractItemCount}</span>
                <span className="pif-stats__value">{items.length}</span>
              </div>
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractPricedCount}</span>
                <span className="pif-stats__value pif-stats__value--ok">{pricedCount}</span>
              </div>
              <div className="pif-stats__row">
                <span className="pif-stats__label">{TEXT.contractUnpricedCount}</span>
                <span className="pif-stats__value pif-stats__value--warn">
                  {itemsMissingPrice}
                </span>
              </div>
              <div className="pif-stats__rule" />
              <div className="pif-stats__row">
                <span className="pif-stats__value">{TEXT.contractTotal}</span>
                <span className="pif-stats__total-value">₺ {formatAmount(contractTotal)}</span>
              </div>
            </div>
          </section>

          <p className="pif-note">
            <strong>{TEXT.noteLead}</strong> {TEXT.note}
          </p>
        </aside>
      </div>

      {formError && (
        <p className="pif__error" data-testid="tsi-error">
          {formError}
        </p>
      )}
      {savedCode && !formError && (
        <p className="pif__saved" data-testid="tsi-saved">
          {savedCode} pozu eklendi.
        </p>
      )}
    </Modal>
  );
}
