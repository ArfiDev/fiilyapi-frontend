"use client";

import { useState } from "react";

import { useUserDisciplines } from "@/lib/api/hooks/useUserDisciplines";
import type { UserDisciplinesRead } from "@/lib/api/models";
import "@/components/settings/discipline-assignment.css"; // .dsc-dot ortak

type DisciplineRef = UserDisciplinesRead["disciplines"][number];

/** Hücrede kodla gösterilen en çok rozet; fazlası "+N" olur (mockup: `d.slice(0, 2)`). */
const MAX_CHIPS = 2;

interface DisciplineCellProps {
  userId: string;
  /** Yazma yetkisi yoksa hücre tıklanmaz (düğme çizilmez). */
  canEdit: boolean;
  onOpen: () => void;
}

function Chip({ discipline, withName }: { discipline: DisciplineRef; withName: boolean }) {
  return (
    <span className="dsc-chip">
      <span className="dsc-dot" aria-hidden="true" style={{ backgroundColor: discipline.color }} />
      <span className="dsc-chip__code">{discipline.code}</span>
      {withName && (
        <>
          <span className="dsc-chip__sep" aria-hidden="true">
            ·
          </span>
          <span className="dsc-chip__name">{discipline.name}</span>
        </>
      )}
    </span>
  );
}

// Kullanıcılar tablosu "Disiplin" sütunu — her satır kendi `useUserDisciplines`
// çağrısını yapan ayrı örnek (ProjectAccessCell deseni, client N+1).
export function DisciplineCell({ userId, canEdit, onOpen }: DisciplineCellProps) {
  const assignedQuery = useUserDisciplines(userId);
  const [isTipOpen, setTipOpen] = useState(false);

  if (assignedQuery.isLoading) return <span className="users-cell-access">…</span>;
  if (assignedQuery.isError || !assignedQuery.data) return <span className="users-cell-access">—</span>;

  // B0b: adlar/renkler atama yanıtındaki `disciplines`ten gelir — katalog (ve onun 403/yükleme hâli) GEREKMEZ.
  const assigned = assignedQuery.data.disciplines;
  const isOverflowing = assigned.length > MAX_CHIPS;

  const content =
    assigned.length === 0 ? (
      <span className="dsc-cell__none">Tümü (kısıtsız)</span>
    ) : (
      <>
        {assigned.slice(0, MAX_CHIPS).map((d) => (
          <Chip key={d.id} discipline={d} withName={assigned.length === 1} />
        ))}
        {isOverflowing && <span className="dsc-cell__more">+{assigned.length - MAX_CHIPS}</span>}
      </>
    );

  const summary = assigned.map((d) => d.code).join(", ");
  const tip = isOverflowing && isTipOpen && (
    <div className="dsc-tip" role="tooltip">
      <span className="dsc-tip__title">{assigned.length} disiplinle sınırlı</span>
      {assigned.map((d) => (
        <span key={d.id} className="dsc-tip__row">
          <span className="dsc-dot dsc-dot--on-dark" aria-hidden="true" style={{ backgroundColor: d.color }} />
          <span className="dsc-tip__code">{d.code}</span>
          <span className="dsc-tip__name">{d.name}</span>
        </span>
      ))}
    </div>
  );

  if (!canEdit) return <div className="dsc-cell dsc-cell--static">{content}</div>;

  return (
    <div className="dsc-cell">
      <button
        type="button"
        className="dsc-cell__button"
        title="Disiplin atamasını düzenle"
        aria-label={summary ? `Disiplin atamasını düzenle: ${summary}` : "Disiplin atamasını düzenle: tümü (kısıtsız)"}
        onClick={onOpen}
        onMouseEnter={() => setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        onFocus={() => setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
      >
        {content}
      </button>
      {tip}
    </div>
  );
}
