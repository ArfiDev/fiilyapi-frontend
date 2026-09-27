"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import type { PlanCellTag } from "@/lib/api/hooks/useSitePlan";
import { cx } from "@/lib/cx";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import type { PlanDraftCell } from "./plan-draft";
import { planCellValue } from "./plan-draft-reducer";
import { PLAN_CELL_TAG_LABELS } from "./plan-labels";
import { PlanPopover } from "./PlanPopover";

/**
 * Metin tavanı. Backend `text` için sınır koymuyor; sınırı EKRAN belirliyor:
 * çip, ızgaranın 1/7'lik sütununda 10px yazıyla çizilir (P127) ve mockup'ın en
 * uzun çipi "Kat 10 Demir" (12 karakter). 40 karakter üç katı pay bırakır,
 * ötesi hücreyi okunmaz yükseklikte sarardı.
 */
const MAX_CELL_TEXT = 40;

/** Renk seçici sırası — `plan-labels.ts` TEK KAYNAK, burada yeniden adlanmaz. */
const CELL_TAGS = Object.keys(PLAN_CELL_TAG_LABELS) as PlanCellTag[];

export interface PlanCellPopoverProps {
  cell: PlanDraftCell | null;
  /** "Kalıpçı (14) · Pzt 3 Ağu" — diyalogun erişilebilir adı. */
  label: string;
  onSubmit: (value: PlanDraftCell | null) => void;
  onClose: () => void;
}

/**
 * P127 · hücre düzenleme yüzeyi (F-PL T3, spec §3 onaylı tasarım).
 *
 * Renk seçenekleri ızgaradaki ÇİPİN TA KENDİSİDİR: aynı `.plan-cell__chip--*`
 * sınıfları, dolayısıyla aynı token'lar. Seçim KALDIRILABİLİR — seçili çipe
 * yeniden tıklamak `tag: null` yapar (renksiz hücre düz metin olarak çizilir).
 *
 * Escape / dış tıklama İPTALDİR: değişiklikler bu bileşenin yerel durumunda
 * durur, yalnız "Uygula" taslağa yazar.
 */
export function PlanCellPopover({ cell, label, onSubmit, onClose }: PlanCellPopoverProps) {
  const [text, setText] = useState(cell?.text ?? "");
  const [tag, setTag] = useState<PlanCellTag | null>(cell?.tag ?? null);

  // SEKME-F1.3b · dirty (tercih 2): `cell` senkron prop'tur (ASYNC TABAN
  // DEĞİL). `usePlanDraft` ZATEN kayda bağlı (şantiye planı taslağı) — bu
  // popover taslağa YAZMAZ, yalnız "Uygula"ya kadar kendi yerel durumunu
  // taşır; çift kayıt YOK, yalnız popover'ın kendi commit edilmemiş girdisi
  // bağlanır. Modal kullanılmıyor (kendi PlanPopover sarmalayıcısı) —
  // doğrudan çağrı.
  const isDirty = text !== (cell?.text ?? "") || tag !== (cell?.tag ?? null);
  useUnsavedChanges(isDirty, "Plan hücresi");

  return (
    <PlanPopover label={`${label} — hücre düzenleme`} onClose={onClose} className="plan-pop--cell">
      <form
        className="plan-pop__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(planCellValue(text, tag));
        }}
      >
        <Input
          size="row"
          value={text}
          maxLength={MAX_CELL_TEXT}
          aria-label="Plan metni"
          placeholder="Örn. Kat 9 Kalıp"
          onChange={(event) => setText(event.target.value)}
        />

        <div className="plan-pop__tags" role="group" aria-label="Renk etiketi">
          {CELL_TAGS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={tag === option}
              aria-label={PLAN_CELL_TAG_LABELS[option]}
              className={cx(
                "plan-cell__chip",
                `plan-cell__chip--${option}`,
                "plan-pop__tag",
                tag === option && "plan-pop__tag--active",
              )}
              onClick={() => setTag(tag === option ? null : option)}
            >
              {PLAN_CELL_TAG_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="plan-pop__actions">
          <Button
            variant="ghost"
            size="sm"
            className="plan-pop__clear"
            onClick={() => onSubmit(null)}
          >
            Temizle
          </Button>
          <Button type="submit" size="sm">
            Uygula
          </Button>
        </div>
      </form>
    </PlanPopover>
  );
}
