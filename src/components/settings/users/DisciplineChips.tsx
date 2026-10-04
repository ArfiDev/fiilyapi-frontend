"use client";

import { Select } from "@/components/ui";
import type { DisciplineRef } from "@/lib/api/models";
import "@/components/settings/discipline-assignment.css"; // .dsc-chip / .dsc-dot ortak
import "./user-access-modal.css";

interface DisciplineChipsProps {
  projectName: string;
  /** O projedeki seçili disiplinler; boş = tüm disiplinler. */
  selected: readonly DisciplineRef[];
  /** Şirket disiplin kataloğu (seçilebilecekler). */
  catalog: readonly DisciplineRef[];
  disabled?: boolean;
  onAdd: (discipline: DisciplineRef) => void;
  onRemove: (disciplineId: string) => void;
}

/**
 * Proje satırının disiplin hücresi (mockup: ELK · Elektrik × + "+ Disiplin"). Boşken "Tüm disiplinler —".
 * "+ Disiplin" yerel `<select>`tir (açılır pencere/portal YOK): Escape modalı kapatmaz, klavyeyle çalışır.
 */
export function DisciplineChips({ projectName, selected, catalog, disabled = false, onAdd, onRemove }: DisciplineChipsProps) {
  const available = catalog.filter((discipline) => !selected.some((chosen) => chosen.id === discipline.id));

  return (
    <div className="uac-disc">
      {selected.length === 0 && <span className="uac-disc__all">Tüm disiplinler —</span>}
      {selected.map((discipline) => (
        <span key={discipline.id} className="dsc-chip">
          <span className="dsc-dot" aria-hidden="true" style={{ backgroundColor: discipline.color }} />
          <span className="dsc-chip__code">{discipline.code}</span>
          <span className="dsc-chip__sep" aria-hidden="true">
            ·
          </span>
          <span className="dsc-chip__name">{discipline.name}</span>
          <button
            type="button"
            className="uac-disc__remove"
            aria-label={`${projectName}: ${discipline.name} disiplinini kaldır`}
            disabled={disabled}
            onClick={() => onRemove(discipline.id)}
          >
            ×
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <span className="uac-add uac-add--chip">
          <Select
            size="row"
            aria-label={`${projectName}: disiplin ekle`}
            value=""
            disabled={disabled}
            onChange={(event) => {
              const chosen = available.find((discipline) => discipline.id === event.target.value);
              if (chosen) onAdd(chosen);
            }}
          >
            <option value="">+ Disiplin</option>
            {available.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.code} · {discipline.name}
              </option>
            ))}
          </Select>
        </span>
      )}
    </div>
  );
}
