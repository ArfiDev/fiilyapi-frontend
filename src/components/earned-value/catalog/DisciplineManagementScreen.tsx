"use client";

import { useState } from "react";

import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EV_CATALOG_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useEvDisciplines } from "@/lib/api/hooks/useEvDisciplines";
import type { EvDisciplineRead } from "@/lib/api/models";

import { DisciplineDeleteDialog } from "./DisciplineDeleteDialog";
import { DisciplineFormModal } from "./DisciplineFormModal";
import { DisciplineListPanel } from "./DisciplineListModal";
import "./catalog.css";
import "./catalog-modals.css";

/** B1-8: disiplin YAZMA = full; SİLME = admin (B1-9) — Birim Oran Kataloğu ile aynı. */
const WRITE_LEVEL = "full";
const DELETE_LEVEL = "admin";

type OpenModal = { kind: "form"; discipline: EvDisciplineRead | null } | { kind: "delete"; discipline: EvDisciplineRead };

/**
 * NAV-F2 · `/planlama/disiplin-yonetimi` — M6 disiplin listesi sayfa gövdesinde; ekle / düzenle / sil
 * yine M6 modalları. Birim Oran Kataloğu'ndaki "Disiplinler" modalı (DisciplineManager) yerinde kalır.
 */
export function DisciplineManagementScreen() {
  const { level } = useModulePermission("earned_value");
  // IZN-F2.x · disiplin ekle/düzenle = planlama.disiplin_yonetimi/birim_oran_katalogu Düzenler; SİLME = yalnız SA.
  const canWrite = useButtonGate({ pages: EV_CATALOG_EDIT, need: "edit", fallback: hasAtLeast(level, WRITE_LEVEL) });
  const canDelete = useButtonGate({ pages: EV_CATALOG_EDIT, need: "sa", fallback: hasAtLeast(level, DELETE_LEVEL) });

  const disciplines = useEvDisciplines();
  const [modal, setModal] = useState<OpenModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function open(next: OpenModal) {
    setToast(null);
    setModal(next);
  }

  function done(message: string | null = null) {
    setModal(null);
    setToast(message);
  }

  return (
    <div className="ev-cat">
      <header className="ev-cat__head">
        <h1 className="ev-cat__title">Disiplin Yönetimi</h1>
      </header>

      <section className="ev-cat__card ev-cat-dpage" aria-label="Disiplinler">
        <DisciplineListPanel
          disciplines={disciplines.data}
          isLoading={disciplines.isLoading}
          isError={disciplines.isError}
          onRetry={() => void disciplines.refetch()}
          canWrite={canWrite}
          canDelete={canDelete}
          toast={toast}
          onAdd={() => open({ kind: "form", discipline: null })}
          onEdit={(discipline) => open({ kind: "form", discipline })}
          onDelete={(discipline) => open({ kind: "delete", discipline })}
        />
      </section>

      {modal?.kind === "form" && (
        <DisciplineFormModal
          discipline={modal.discipline}
          existing={disciplines.data ?? []}
          onClose={() => done()}
          onSaved={done}
        />
      )}
      {modal?.kind === "delete" && (
        <DisciplineDeleteDialog discipline={modal.discipline} onClose={() => done()} onDeleted={done} />
      )}
    </div>
  );
}
