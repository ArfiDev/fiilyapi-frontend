"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button/Button";
import { Field } from "@/components/ui/field/Field";
import { Input } from "@/components/ui/input/Input";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { PlanPopover } from "./PlanPopover";

/** Backend `SitePlanSprintSave.name` tavanı 150 karakterdir. */
const MAX_SPRINT_NAME = 150;

export interface PlanSprintEditorProps {
  /** Taslaktaki ad; boş dize = aktif sprint yok. */
  name: string;
  canWrite: boolean;
  onChange: (name: string) => void;
}

/**
 * P107 · "Aktif Sprint: …" etiketi + kalem (F-PL T3, spec §3 onaylı tasarım).
 *
 * TÜREV (T2'den devam): ad boşken etiket HİÇ BASILMAZ — boş bir "Aktif Sprint:"
 * satırı mockup'ta olmayan bilgi uydururdu. Kalem butonu yine de durur, aksi
 * halde sprinti olmayan şantiyede sprint AÇILAMAZDI.
 *
 * ⚠️ Boş ad aktif sprinti KAPATIR ve uç `null` döner — bu bir hata değildir.
 */
export function PlanSprintEditor({ name, canWrite, onChange }: PlanSprintEditorProps) {
  const [draftName, setDraftName] = useState<string | null>(null);
  const isEditing = draftName !== null;

  // SEKME-F1.3b · dirty (tercih 2): `name` senkron prop. Hook KOŞULSUZ
  // çağrılır (`isEditing` false iken de) — erken dönüş yok, ifade `isEditing
  // && ...` ile "düzenleniyor değilken" false'a düşer. `usePlanDraft` bu
  // popover'ın DIŞINDA, çift kayıt yok (yalnız "Uygula" `onChange`i çağırır).
  useUnsavedChanges(isEditing && draftName !== name, "Sprint");

  return (
    <span className="plan-pop-anchor plan-week-nav__sprint-slot">
      {name.length > 0 && <span className="plan-week-nav__sprint">Aktif Sprint: {name}</span>}
      <Button
        variant="ghost"
        size="sm"
        className="plan-week-nav__sprint-edit"
        aria-label="Aktif sprinti düzenle"
        disabled={!canWrite}
        onClick={() => setDraftName(name)}
      >
        ✎
      </Button>
      {isEditing && (
        <PlanPopover
          label="Aktif sprinti düzenle"
          onClose={() => setDraftName(null)}
          className="plan-pop--sprint"
        >
          <form
            className="plan-pop__form"
            onSubmit={(event) => {
              event.preventDefault();
              onChange(draftName.trim());
              setDraftName(null);
            }}
          >
            <Field label="Sprint adı" hint="Boş bırakmak aktif sprinti kapatır.">
              {(control) => (
                <Input
                  {...control}
                  size="row"
                  value={draftName}
                  maxLength={MAX_SPRINT_NAME}
                  placeholder="Örn. Kat 8–9 Tamamlama"
                  onChange={(event) => setDraftName(event.target.value)}
                />
              )}
            </Field>
            <div className="plan-pop__actions">
              <Button variant="ghost" size="sm" onClick={() => setDraftName(null)}>
                Vazgeç
              </Button>
              <Button type="submit" size="sm">
                Uygula
              </Button>
            </div>
          </form>
        </PlanPopover>
      )}
    </span>
  );
}
