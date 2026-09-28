"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button/Button";
import { Field } from "@/components/ui/field/Field";
import { Input } from "@/components/ui/input/Input";
import { Select } from "@/components/ui/select/Select";
import type { PlanResourceKind } from "@/lib/api/hooks/useSitePlan";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import type { PlanDraftNewRow } from "./plan-draft-reducer";
import { planSectionsHint, type PlanSectionsState } from "./plan-sections";
import { PlanPopover } from "./PlanPopover";

/** Satır etiketi tavanı — ızgaranın etiket sütunu 140px'tir (P109). */
const MAX_ROW_LABEL = 60;
/** İşçi sayısı tavanı: mockup'ın en kalabalık ekibi 18 kişi (P139); 999 pay bırakır. */
const MAX_WORKER_COUNT = 999;

/** "Bölümsüz" seçeneğinin `<option>` değeri — `section_id: null` demektir. */
const NO_SECTION_VALUE = "";

export interface PlanRowAddPopoverProps {
  /** Popover bir grup başlığından açıldıysa o grubun türü; boş ızgarada "crew". */
  defaultKind: PlanResourceKind;
  /** Grubun bölümü ÖN SEÇİLİ gelir ama artık DEĞİŞTİRİLEBİLİR (T5 bulgusu). */
  defaultSectionId: string | null;
  sections: PlanSectionsState;
  onSubmit: (row: PlanDraftNewRow) => void;
  onClose: () => void;
}

/**
 * "+ Satır" (F-PL T3, spec §3 onaylı tasarım).
 *
 * Tür seçilebilir tutuldu (spec §3: "etiket + işçi sayısı + bölüm/ekipman
 * türü"), ama backend kuralı burada UYGULANIR: tür "ekipman" seçilirse satır
 * bölüme BAĞLANMAZ (`section_id: null`, aksi halde 422), bölüm seçicisi kapanır
 * ve işçi sayısı alanı da kapanır — ekipman satırında işçi sayısı kavramı
 * yoktur (P162).
 *
 * T5 DÜZELTMESİ: bölüm artık grubun bölümünden DEVRALINMAZ, seçilir. Aksi
 * halde henüz satırı olmayan bir bölüme (ızgarada grubu yoktur) satır açmak
 * imkânsızdı.
 */
export function PlanRowAddPopover({
  defaultKind,
  defaultSectionId,
  sections,
  onSubmit,
  onClose,
}: PlanRowAddPopoverProps) {
  const [kind, setKind] = useState<PlanResourceKind>(defaultKind);
  const [sectionId, setSectionId] = useState<string | null>(defaultSectionId);
  const [label, setLabel] = useState("");
  const [workerCount, setWorkerCount] = useState("");

  // SEKME-F1.3b · dirty (tercih 1): oluşturma popover'ı, taban `defaultKind`/
  // `defaultSectionId` (props, ASYNC TABAN DEĞİL). Taslağa (usePlanDraft)
  // yalnız "Ekle" ile yazılır — çift kayıt YOK. Modal kullanılmıyor.
  const isDirty =
    label.trim() !== "" || workerCount !== "" || kind !== defaultKind || sectionId !== defaultSectionId;
  useUnsavedChanges(isDirty, "Yeni plan satırı");

  const isEquipment = kind === "equipment";
  const parsedCount = Number.parseInt(workerCount, 10);
  const sectionsHint = planSectionsHint(sections);
  // Ön seçili bölüm listede yoksa (liste yüklenemedi/henüz gelmedi) seçici
  // "Bölümsüz"e düşmez — bilinen bölüm bağı sessizce KOPARILMAZ.
  const isDefaultMissing =
    defaultSectionId !== null && !sections.items.some((item) => item.id === defaultSectionId);

  return (
    <PlanPopover label="Yeni plan satırı" onClose={onClose} className="plan-pop--row">
      <form
        className="plan-pop__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim().length === 0) return;
          const selected = sections.items.find((item) => item.id === sectionId) ?? null;
          onSubmit({
            kind,
            sectionId: isEquipment ? null : sectionId,
            // Grup ızgarada YOKSA başlığı bu iki alandan kurulur (T5).
            sectionName: isEquipment ? null : (selected?.name ?? null),
            sectionManagerName: isEquipment ? null : (selected?.managerName ?? null),
            label: label.trim(),
            plannedWorkerCount: isEquipment || Number.isNaN(parsedCount) ? null : parsedCount,
          });
        }}
      >
        <Field label="Tür">
          {(control) => (
            <Select
              {...control}
              size="row"
              value={kind}
              onChange={(event) => setKind(event.target.value as PlanResourceKind)}
            >
              <option value="crew">Ekip</option>
              <option value="equipment">Makine / Ekipman</option>
            </Select>
          )}
        </Field>

        <Field
          label="Bölüm"
          hint={isEquipment ? "Ekipman satırı bir bölüme bağlanamaz." : (sectionsHint ?? undefined)}
        >
          {(control) => (
            <Select
              {...control}
              size="row"
              value={sectionId ?? NO_SECTION_VALUE}
              disabled={isEquipment}
              onChange={(event) =>
                setSectionId(event.target.value === NO_SECTION_VALUE ? null : event.target.value)
              }
            >
              <option value={NO_SECTION_VALUE}>Bölümsüz</option>
              {isDefaultMissing && defaultSectionId !== null && (
                <option value={defaultSectionId}>Bu grubun bölümü</option>
              )}
              {sections.items.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Etiket" required>
          {(control) => (
            <Input
              {...control}
              size="row"
              value={label}
              maxLength={MAX_ROW_LABEL}
              placeholder={isEquipment ? "Örn. Tower Crane" : "Örn. Kalıpçı"}
              onChange={(event) => setLabel(event.target.value)}
            />
          )}
        </Field>

        <Field
          label="İşçi sayısı"
          hint={isEquipment ? "Ekipman satırında işçi sayısı tutulmaz." : undefined}
        >
          {(control) => (
            <Input
              {...control}
              size="row"
              numeric
              type="number"
              min={0}
              max={MAX_WORKER_COUNT}
              value={workerCount}
              disabled={isEquipment}
              onChange={(event) => setWorkerCount(event.target.value)}
            />
          )}
        </Field>

        <div className="plan-pop__actions">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" size="sm" disabled={label.trim().length === 0}>
            Ekle
          </Button>
        </div>
      </form>
    </PlanPopover>
  );
}
