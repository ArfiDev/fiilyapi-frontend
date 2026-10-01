"use client";

import { useState } from "react";

import { CONTRACTOR_OPTIONS } from "@/components/catalog-shared/CatalogBits";
import { unitOptions } from "@/components/catalog-shared/catalog-units";
import { Button, Input, Segmented, Select } from "@/components/ui";
import { AlertIcon } from "@/components/ui/icons";
import { EMPTY_CELL } from "@/lib/format";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateCatalogItem, useUpdateCatalogItem } from "@/lib/api/hooks/useCatalogItems";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { NO_LAST_PRICE_SOURCE } from "./WorkItemRow";
import {
  buildWorkItemCreateBody,
  buildWorkItemUpdateBody,
  emptyWorkItemForm,
  firstWorkItemError,
  isWorkItemFormDirty,
  workItemFormFromItem,
  WORK_ITEM_NAME_MAX_LENGTH,
  type ContractorType,
  type WorkItemFormState,
} from "./work-item-form";

/** KIK:274 — Taşeron seçeneği satır içinde kısaltılır. */
const OWN_OPTIONS = CONTRACTOR_OPTIONS.map((option) => ({
  value: option.value,
  label: option.value === "subcon" ? "Taş." : option.label,
}));

/** ÜS-1 — sıradaki numara istemcide bilinmez (sayaç sunucuda, kilitli). */
const POZ_PENDING_LABEL = "Otomatik";
/** ÜS-2 — mockup'taki "GG.NNN · grup + sıra" ipucunun yerine. */
const POZ_HINT = "Poz no otomatik verilir · disiplin kodu + sıra (MIM-0001) · şirket genelinde tekil";

export type WorkItemEditMode =
  | { kind: "new"; discipline: WorkDisciplineRead | null }
  | { kind: "edit"; item: WorkItemRead };

interface WorkItemEditRowProps {
  mode: WorkItemEditMode;
  testId: string;
  /** Katalogdaki mevcut birimler (açılır listeye eklenir). */
  catalogUnits: readonly string[];
  onCancel: () => void;
  onSaved: (saved: WorkItemRead) => void;
}

function initialForm(mode: WorkItemEditMode): WorkItemFormState {
  return mode.kind === "edit"
    ? workItemFormFromItem(mode.item)
    : emptyWorkItemForm(mode.discipline?.default_contractor_type ?? "own");
}

/** ÜS-4 — disiplin alt satırı ("KOD · Ad"); yeni kalemde disiplin yoksa boş. */
function disciplineSubline(mode: WorkItemEditMode): string {
  const discipline = mode.kind === "edit" ? mode.item.discipline : mode.discipline;
  return discipline ? `${discipline.code} · ${discipline.name}` : "";
}

/**
 * KIK:149-176 — SATIR İÇİ düzenleme / yeni satır (modal değil). Poz no salt okunur;
 * mevcut kalemin disiplini bu ekrandan değişmez (ÜS-5).
 */
export function WorkItemEditRow({ mode, testId, catalogUnits, onCancel, onSaved }: WorkItemEditRowProps) {
  const [initial] = useState(() => initialForm(mode));
  const [form, setForm] = useState<WorkItemFormState>(initial);
  const [hasTried, setHasTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const createItem = useCreateCatalogItem();
  const updateItem = useUpdateCatalogItem();
  const isSaving = createItem.isPending || updateItem.isPending;

  useUnsavedChanges(isWorkItemFormDirty(initial, form), "İş kalemi");

  const disciplineId = mode.kind === "edit" ? mode.item.discipline.id : (mode.discipline?.id ?? "");
  const clientError = firstWorkItemError(form, disciplineId);
  const shownError = serverError ?? (hasTried ? (clientError?.message ?? null) : null);
  const errorField = hasTried ? clientError?.field : undefined;

  function patch(change: Partial<WorkItemFormState>) {
    setServerError(null);
    setForm((current) => ({ ...current, ...change }));
  }

  async function save() {
    setServerError(null);
    if (clientError) {
      setHasTried(true);
      return;
    }
    try {
      if (mode.kind === "new") {
        onSaved(await createItem.mutateAsync(buildWorkItemCreateBody(form, disciplineId)));
        return;
      }
      const body = buildWorkItemUpdateBody(initial, form);
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }
      onSaved(await updateItem.mutateAsync({ id: mode.item.id, body }));
    } catch (error) {
      setServerError(backendErrorMessage(error));
    }
  }

  const units = unitOptions(catalogUnits, form.uom);
  const subline = disciplineSubline(mode);

  return (
    <div role="rowgroup" className="wik-edit" data-testid={testId}>
      <div role="row" className="wik-grid wik-edit__grid">
        <div role="cell" className="wik-cell wik-cell--edit-poz">
          {mode.kind === "edit" ? (
            <span className="wik-poz" data-testid="wik-poz">
              {mode.item.poz_no}
            </span>
          ) : (
            <span className="wik-poz wik-poz--pending">{POZ_PENDING_LABEL}</span>
          )}
        </div>
        <div role="cell" className="wik-cell wik-cell--edit wik-cell--name">
          <Input
            size="row"
            aria-label="Tarif"
            placeholder="Tarif"
            value={form.name}
            maxLength={WORK_ITEM_NAME_MAX_LENGTH}
            status={errorField === "name" ? "error" : "default"}
            onChange={(event) => patch({ name: event.target.value })}
          />
          {subline && <span className="wik-sub">{subline}</span>}
        </div>
        <div role="cell" className="wik-cell wik-cell--edit">
          <Select
            size="row"
            aria-label="Birim"
            value={form.uom}
            onChange={(event) => patch({ uom: event.target.value })}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </div>
        <div role="cell" className="wik-cell wik-cell--edit">
          <Input
            size="row"
            numeric
            inputMode="decimal"
            aria-label="Referans fiyat"
            placeholder="0,00"
            value={form.refPrice}
            status={errorField === "refPrice" ? "error" : "default"}
            onChange={(event) => patch({ refPrice: event.target.value })}
          />
        </div>
        <div role="cell" className="wik-cell wik-cell--last wik-cell--readonly">
          <span className="wik-last wik-last--empty">{EMPTY_CELL}</span>
          <span className="wik-sub wik-sub--nowrap">{`salt okunur · ${NO_LAST_PRICE_SOURCE}`}</span>
        </div>
        <div role="cell" className="wik-cell wik-cell--edit">
          <Input
            size="row"
            numeric
            inputMode="decimal"
            aria-label="A-s / birim"
            placeholder="0,00"
            value={form.rate}
            status={errorField === "rate" ? "error" : "default"}
            onChange={(event) => patch({ rate: event.target.value })}
          />
        </div>
        <div role="cell" className="wik-cell wik-cell--edit">
          <Segmented<ContractorType>
            size="sm"
            aria-label="Vars. yüklenici"
            options={OWN_OPTIONS}
            value={form.own}
            onChange={(own) => patch({ own })}
          />
        </div>
        <div role="cell" className="wik-cell wik-cell--hint">
          kayıtta güncellenir
        </div>
        <div role="cell" className="wik-cell" />
      </div>
      <div role="row" className="wik-edit__foot">
        <div role="cell" className="wik-edit__message">
        {shownError ? (
          <span className="wik-edit__error">
            <AlertIcon width={12} height={12} aria-hidden="true" />
            <span>{shownError}</span>
          </span>
        ) : (
          <span className="wik-edit__hint">{POZ_HINT}</span>
        )}
        </div>
        <div role="cell" className="wik-edit__actions">
          <Button variant="secondary" size="sm" disabled={isSaving} onClick={onCancel}>
            Vazgeç
          </Button>
          <Button size="sm" disabled={isSaving} onClick={() => void save()}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
