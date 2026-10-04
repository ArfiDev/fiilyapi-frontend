"use client";

import { useRef, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useCopyRole } from "@/lib/api/hooks/useRoleMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { RoleResponse } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

interface RoleCopyModalProps {
  role: RoleResponse;
  onClose: () => void;
}

/** Rol kopyalama: yalnız yeni ad sorulur; sayfa izinleri ve gizli alanlar sunucuda (`POST /roles/{id}/copy`) kopyalanır. */
export function RoleCopyModal({ role, onClose }: RoleCopyModalProps) {
  const copyRole = useCopyRole();
  const suggestedName = `${role.name} (Kopya)`;
  const initialName = useRef(suggestedName);
  const [name, setName] = useState(suggestedName);
  const [formError, setFormError] = useState<string | null>(null);

  // Kopya adı önerilen değerden farklıysa kullanıcı yazmıştır (taban mount'ta yakalanır).
  useUnsavedChanges(name !== initialName.current, "Rol kopyası");

  function handleSubmit() {
    if (!name.trim()) {
      setFormError("Ad zorunludur.");
      return;
    }
    setFormError(null);
    copyRole.mutate(
      { id: role.id, body: { name: name.trim(), emoji: role.emoji, description: role.description } },
      { onSuccess: onClose, onError: (error) => setFormError(backendErrorMessage(error)) },
    );
  }

  return (
    <Modal
      title="Rolü Kopyala"
      subtitle={`"${role.name}" rolünün sayfa izinleri ve gizli alanları yeni role aktarılır.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={copyRole.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={copyRole.isPending}>
            Kopyala
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <Field label="Yeni rol adı" required>
          {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} />}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
