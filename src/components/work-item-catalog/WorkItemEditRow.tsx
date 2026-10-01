"use client";

import { CONTRACTOR_OPTIONS } from "@/components/catalog-shared/CatalogBits";
import { unitOptions } from "@/components/catalog-shared/catalog-units";
import { Button, Input, Segmented, Select } from "@/components/ui";
import { AlertIcon } from "@/components/ui/icons";
import { EMPTY_CELL } from "@/lib/format";
import type { WorkDisciplineRead } from "@/lib/api/models";

import { NO_LAST_PRICE_SOURCE } from "./WorkItemRow";
import type { WorkItemDraft } from "./work-item-drafts";
import {
  firstWorkItemError,
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

/** Satırın disiplin alt satırı ve kimliği için gereken en az alan. */
export type WorkItemDisciplineLabel = Pick<WorkDisciplineRead, "id" | "code" | "name">;

interface WorkItemEditRowProps {
  /** Taslak EKRAN düzeyindedir (KIK:233-236); bu bileşen yalnız çizer. */
  draft: WorkItemDraft;
  /** Düzenlemede kalemin poz no'su; yeni satırda null (ÜS-1). */
  pozNo: string | null;
  /** Düzenlemede kalemin, yeni satırda ŞİMDİKİ listeden çözülen disiplin (yoksa null). */
  discipline: WorkItemDisciplineLabel | null;
  testId: string;
  /** Katalogdaki mevcut birimler (açılır listeye eklenir). */
  catalogUnits: readonly string[];
  onPatch: (key: string, change: Partial<WorkItemFormState>) => void;
  onCancel: (key: string) => void;
  onSave: (key: string) => void;
}

/**
 * KIK:149-176 — SATIR İÇİ düzenleme / yeni satır (modal değil). Poz no salt okunur;
 * mevcut kalemin disiplini bu ekrandan değişmez (ÜS-5).
 */
export function WorkItemEditRow({
  draft,
  pozNo,
  discipline,
  testId,
  catalogUnits,
  onPatch,
  onCancel,
  onSave,
}: WorkItemEditRowProps) {
  const { form, isSaving } = draft;
  const clientError = firstWorkItemError(form, discipline?.id ?? "");
  const shownError = draft.serverError ?? (draft.hasTried ? (clientError?.message ?? null) : null);
  const errorField = draft.hasTried ? clientError?.field : undefined;
  const patch = (change: Partial<WorkItemFormState>) => onPatch(draft.key, change);

  const units = unitOptions(catalogUnits, form.uom);
  const subline = discipline ? `${discipline.code} · ${discipline.name}` : "";

  return (
    <div role="rowgroup" className="wik-edit" data-testid={testId}>
      <div role="row" className="wik-grid wik-edit__grid">
        <div role="cell" className="wik-cell wik-cell--edit-poz">
          {pozNo !== null ? (
            <span className="wik-poz" data-testid="wik-poz">
              {pozNo}
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
          <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => onCancel(draft.key)}>
            Vazgeç
          </Button>
          <Button size="sm" disabled={isSaving} onClick={() => onSave(draft.key)}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
