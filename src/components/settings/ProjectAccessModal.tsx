"use client";

import { useEffect, useState } from "react";
import { Button, Toggle, Checkbox } from "@/components/ui";
import { Modal } from "./Modal";
import { useProjects, useProjectAccess, PROJECT_LIST_MAX_LIMIT } from "@/lib/api/hooks/useProjects";
import { useSetProjectAccess } from "@/lib/api/hooks/useUserMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { UserResponse } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

export function ProjectAccessModal({ user, onClose }: { user: UserResponse; onClose: () => void }) {
  // Sunucu varsayılanı 50; limit gönderilmezse 51. proje onay kutusu
  // listesinde HİÇ görünmez ve yöneticiye "böyle bir proje yok" der.
  const projectsQuery = useProjects({ limit: PROJECT_LIST_MAX_LIMIT });
  const accessQuery = useProjectAccess(user.id);
  const setAccess = useSetProjectAccess();

  const [allProjects, setAllProjects] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b · dirty = tercih 2, taban `accessQuery` GET'inden gelir.
  // 🔴 ASYNC TABAN: `baseline` `null` iken (GET henüz dönmedi) dirty FALSE —
  // aşağıdaki tohumlama efekti taban VE değeri AYNI ANDA (accessQuery.data
  // geldiğinde) hizalar.
  const [baseline, setBaseline] = useState<{ allProjects: boolean; selectedIds: string[] } | null>(null);
  const isDirty =
    baseline !== null &&
    (allProjects !== baseline.allProjects ||
      JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...baseline.selectedIds].sort()));
  useUnsavedChanges(isDirty, "Proje erişimi");

  useEffect(() => {
    if (accessQuery.data) {
      setAllProjects(accessQuery.data.all_projects);
      setSelectedIds(accessQuery.data.project_ids);
      setBaseline({ allProjects: accessQuery.data.all_projects, selectedIds: accessQuery.data.project_ids });
    }
  }, [accessQuery.data]);

  function toggleProject(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit() {
    setFormError(null);
    setAccess.mutate(
      { id: user.id, body: { all_projects: allProjects, project_ids: allProjects ? [] : selectedIds } },
      { onSuccess: onClose, onError: (err) => setFormError(backendErrorMessage(err)) },
    );
  }

  return (
    <Modal
      title={`Proje Erişimi — ${user.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={setAccess.isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={setAccess.isPending || accessQuery.isLoading || !accessQuery.data}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <div className="settings-field-row">
          <Toggle
            label="Tüm projeler"
            checked={allProjects}
            onChange={(e) => setAllProjects(e.target.checked)}
          />
        </div>
        {!allProjects && (
          <div className="settings-checklist">
            {projectsQuery.data?.items.map((project) => (
              <label key={project.id} className="settings-checklist__item">
                <Checkbox checked={selectedIds.includes(project.id)} onChange={() => toggleProject(project.id)} />
                <span>
                  {project.code} — {project.name}
                </span>
              </label>
            ))}
          </div>
        )}
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
