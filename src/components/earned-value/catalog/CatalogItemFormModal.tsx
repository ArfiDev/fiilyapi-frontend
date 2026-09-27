"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { Alert, Button, Field, Input, Segmented, Select, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatUnitRate } from "@/lib/earned-value";
import { normalizeDecimalInput } from "@/lib/decimal";
import { backendErrorMessage } from "@/lib/api/error-message";
import { EMPTY_CELL, formatDateDots, toIstanbulDateOnly } from "@/lib/format";
import { useCreateEvCatalogItem, useUpdateEvCatalogItem } from "@/lib/api/hooks/useEvCatalog";
import type { EvCatalogItemRead, EvDisciplineRead } from "@/lib/api/models";

import { CONTRACTOR_LABEL, CONTRACTOR_OPTIONS, DiffBadge } from "./CatalogBits";
import { FormErrorBanner, groupProps } from "./FormErrorBanner";
import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  buildCatalogCreateBody,
  buildCatalogUpdateBody,
  catalogFormFromItem,
  catalogOwnHint,
  catalogRateChanged,
  emptyCatalogForm,
  unitOptions,
  validateCatalogForm,
  type CatalogFormState,
  type ContractorType,
} from "./catalog-item-form";

export type CatalogFormMode = { kind: "create"; disciplineId: string | null } | { kind: "edit"; item: EvCatalogItemRead };

interface CatalogItemFormModalProps {
  mode: CatalogFormMode;
  disciplines: readonly EvDisciplineRead[];
  /** Katalogda kullanılan birimler — açılır listeye eklenir. */
  catalogUnits: readonly string[];
  /** full altı: form salt okunur açılır, Kaydet yok (KAT:398). */
  readOnly: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function initialForm(mode: CatalogFormMode, disciplines: readonly EvDisciplineRead[]): CatalogFormState {
  if (mode.kind === "edit") return catalogFormFromItem(mode.item);
  // KAT:528 — yeni iş tipi: seçili süzgeç disiplini, yoksa ilki; yapan disiplinin varsayılanı.
  const discipline = disciplines.find((d) => d.id === mode.disciplineId) ?? disciplines[0];
  return emptyCatalogForm(discipline?.id ?? "", discipline?.default_contractor_type ?? "own");
}

function formTitle(mode: CatalogFormMode, readOnly: boolean): string {
  if (readOnly) return "İş Tipi";
  return mode.kind === "edit" ? "İş Tipi Düzenle" : "İş Tipi Ekle";
}

/** KAT:473-475 — oran ipucu: düzenlemede geçmiş ortalama varsa onu söyler. */
function rateHint(mode: CatalogFormMode): string {
  if (mode.kind === "edit" && mode.item.actual.avg !== null) {
    return `Geçmiş ort. ${formatUnitRate(mode.item.actual.avg)} · ${mode.item.actual.site_count} şantiye`;
  }
  return "Bir birim iş için planlanan adam-saat";
}

/** KAT:234-296 — "İş Tipi Ekle / Düzenle" modalı. */
export function CatalogItemFormModal({
  mode,
  disciplines,
  catalogUnits,
  readOnly,
  onClose,
  onSaved,
}: CatalogItemFormModalProps) {
  const create = useCreateEvCatalogItem();
  const update = useUpdateEvCatalogItem();
  const [initial] = useState(() => initialForm(mode, disciplines));
  const [form, setForm] = useState(initial);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const isPending = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  // SEKME-F1.3b — readOnly dalında dirty ZORLA false (salt-okunur görünümde
  // uyarı çıkmaz); aksi hâlde taban `initial` ile kıyaslanır.
  const isDirty = !readOnly && JSON.stringify(form) !== JSON.stringify(initial);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "İş tipi formu");

  const errors = isSubmitted ? validateCatalogForm(form) : {};
  const errorCount = Object.keys(errors).length;
  const units = unitOptions(catalogUnits, form.uom);
  const selectedDiscipline = disciplines.find((d) => d.id === form.disciplineId);
  const ownHint = catalogOwnHint(
    selectedDiscipline
      ? {
          code: selectedDiscipline.code,
          defaultContractorLabel: CONTRACTOR_LABEL[selectedDiscipline.default_contractor_type],
          defaultContractorType: selectedDiscipline.default_contractor_type,
        }
      : null,
    form.own,
  );
  const rateHasChanged = mode.kind === "edit" && catalogRateChanged(mode.item, form);
  const normalizedRate = normalizeDecimalInput(form.rate);

  function patch(changes: Partial<CatalogFormState>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function chooseDiscipline(discipline: EvDisciplineRead) {
    // KAT:472 — disiplin seçimi varsayılan yapanı disiplinden alır.
    patch({ disciplineId: discipline.id, own: discipline.default_contractor_type });
  }

  function save() {
    setIsSubmitted(true);
    if (Object.keys(validateCatalogForm(form)).length > 0) return;
    const name = form.name.trim();
    if (mode.kind === "create") {
      create.mutate(buildCatalogCreateBody(form), { onSuccess: () => onSaved(`${name} kataloğa eklendi`) });
      return;
    }
    const body = buildCatalogUpdateBody(initial, form);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: mode.item.id, body }, { onSuccess: () => onSaved(`${name} güncellendi`) });
  }

  const footer = readOnly ? (
    <Button variant="secondary" onClick={onClose}>
      Kapat
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose} disabled={isPending}>
        Vazgeç
      </Button>
      <Button onClick={save} disabled={isPending}>
        Kaydet
      </Button>
    </>
  );

  return (
    <Modal
      title={formTitle(mode, readOnly)}
      onClose={onClose}
      footer={footer}
      className="ev-cat-modal--form"
    >
      <div className="ev-cat-modal__body">
        <p className="ev-cat-modal__subtitle">Şirket kataloğu · bütün şantiyelerde öneri olarak görünür</p>
        {errorCount > 0 && (
          <FormErrorBanner
            lead={`${errorCount} alan eksik ya da hatalı.`}
            text="Kaydetmeden önce işaretli alanları düzeltin."
          />
        )}
        {saveError && <FormErrorBanner text={backendErrorMessage(saveError)} />}

        {mode.kind === "edit" && (
          <div className="ev-cat-use-box">
            <div className="ev-cat-use-grid">
              <div className="ev-cat-use-col">
                <span className="ev-cat-use-label">Standart son güncelleme</span>
                <span className="ev-cat-use-value ev-cat-mono">
                  {formatDateDots(toIstanbulDateOnly(mode.item.standard_updated_at))}
                </span>
              </div>
              <div className="ev-cat-use-col">
                <span className="ev-cat-use-label">Kullanım</span>
                <span className="ev-cat-use-value">
                  <span className="ev-cat-mono">{mode.item.used_by_site_count}</span> şantiyede kullanılıyor
                </span>
              </div>
              <div className="ev-cat-use-col ev-cat-use-col--actual">
                <span className="ev-cat-use-label">Gerçekleşen · {mode.item.actual.site_count} tamamlanan şantiye</span>
                <div className="ev-cat-use-avg">
                  <span>
                    Ort. <b className="ev-cat-mono">{formatUnitRate(mode.item.actual.avg)}</b>
                  </span>
                  <DiffBadge ratio={mode.item.diff_pct} />
                  <span className="ev-cat-use-muted">standarttan</span>
                </div>
                <span className="ev-cat-use-muted">
                  en düşük{" "}
                  <span className="ev-cat-mono">
                    {mode.item.actual.min !== null ? formatUnitRate(mode.item.actual.min) : EMPTY_CELL}
                  </span>{" "}
                  · en yüksek{" "}
                  <span className="ev-cat-mono">
                    {mode.item.actual.max !== null ? formatUnitRate(mode.item.actual.max) : EMPTY_CELL}
                  </span>{" "}
                  a-s/{mode.item.uom}
                </span>
              </div>
            </div>
            {rateHasChanged && (
              <Alert variant="warning" className="ev-cat-use-warn">
                Standart oran <b className="ev-cat-mono">{formatUnitRate(mode.item.standard_unit_mhr)}</b> →{" "}
                <b className="ev-cat-mono">{formatUnitRate(normalizedRate ?? form.rate)}</b>. Bu iş tipini kullanan{" "}
                <b>{mode.item.used_by_site_count} şantiye</b> etkilenir: taslak bütçelerde yeni öneri olarak görünür;
                dondurulmuş baseline&#39;lar değişmez.
              </Alert>
            )}
          </div>
        )}

        <Field
          label="İş tipi adı"
          required
          labelAside={
            <span className="ev-cat-count">{`${form.name.length}/${CATALOG_NAME_MAX_LENGTH}`}</span>
          }
          hint={errors.name ? undefined : "Aynı disiplinde tekil olmalı"}
          error={errors.name}
        >
          {(control) => (
            <Input
              {...control}
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              readOnly={readOnly}
              maxLength={CATALOG_NAME_MAX_LENGTH}
              placeholder="Örn. Beton döküm"
              status={errors.name ? "error" : "default"}
            />
          )}
        </Field>

        <div className="ev-cat-form__row">
          <Field
            label="Disiplin"
            required
            error={disciplines.length > 0 ? errors.discipline : undefined}
            hint={disciplines.length === 0 ? "Katalogda henüz disiplin yok · iş tipi bir disipline bağlı olmalı" : undefined}
          >
            {(control) =>
              disciplines.length === 0 ? (
                <div className="ev-cat-empty-disc">
                  <span>Önce disiplin ekleyin</span>
                </div>
              ) : (
                <div {...groupProps(control)} className="ev-cat-chips" role="group" aria-label="Disiplin">
                  {disciplines.map((discipline) => (
                    <button
                      key={discipline.id}
                      type="button"
                      className="ev-cat-chip"
                      aria-pressed={form.disciplineId === discipline.id}
                      disabled={readOnly}
                      onClick={() => chooseDiscipline(discipline)}
                    >
                      <span
                        className="ev-cat-chip__dot"
                        aria-hidden="true"
                        style={{ backgroundColor: discipline.color }}
                      />
                      <span className="ev-cat-mono">{discipline.code}</span>
                      <span>{discipline.name}</span>
                    </button>
                  ))}
                </div>
              )
            }
          </Field>
          <Field label="Birim" required>
            {(control) => (
              <Select
                {...control}
                value={form.uom}
                onChange={(event) => patch({ uom: event.target.value })}
                disabled={readOnly}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="ev-cat-form__pair">
          <div className={cx("ev-cat-rate", errors.rate && "ev-cat-rate--error")}>
            <Field
              label="Standart oran"
              required
              hint={errors.rate ? undefined : rateHint(mode)}
              error={errors.rate}
            >
              {(control) => (
                <span className="ev-cat-rate__input">
                  <Input
                    {...control}
                    value={form.rate}
                    onChange={(event) => patch({ rate: event.target.value })}
                    readOnly={readOnly}
                    inputMode="decimal"
                    placeholder="0,00"
                    numeric
                    status={errors.rate ? "error" : "default"}
                  />
                  <span className="ev-cat-rate__suffix">{`a-s/${form.uom}`}</span>
                </span>
              )}
            </Field>
          </div>
          <Field label="Varsayılan yapan" hint={ownHint}>
            {(control) => (
              <div {...groupProps(control)}>
                <Segmented<ContractorType>
                  aria-label="Varsayılan yapan"
                  options={CONTRACTOR_OPTIONS}
                  value={form.own}
                  onChange={(own) => patch({ own })}
                  disabled={readOnly}
                  fill
                />
              </div>
            )}
          </Field>
        </div>

        <Field
          label="Açıklama"
          labelAside={
            <span className="ev-cat-count">{`${form.description.length}/${CATALOG_DESCRIPTION_MAX_LENGTH}`}</span>
          }
        >
          {(control) => (
            <Textarea
              {...control}
              value={form.description}
              onChange={(event) => patch({ description: event.target.value })}
              readOnly={readOnly}
              rows={3}
              maxLength={CATALOG_DESCRIPTION_MAX_LENGTH}
              placeholder="Kapsam: neler dahil, neler hariç"
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
