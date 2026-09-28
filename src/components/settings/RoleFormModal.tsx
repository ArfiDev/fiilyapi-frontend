"use client";

import { useRef, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { Modal } from "./Modal";
import { useCreateRole, useRenameRole } from "@/lib/api/hooks/useRoleMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { RoleResponse } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

const KEY_RE = /^[a-z][a-z0-9_]*$/;

interface RoleFormModalProps {
  mode: "create" | "edit";
  role?: RoleResponse;
  onClose: () => void;
}

export function RoleFormModal({ mode, role, onClose }: RoleFormModalProps) {
  const createRole = useCreateRole();
  const renameRole = useRenameRole();

  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [emoji, setEmoji] = useState(role?.emoji ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty = tercih 2 (tabana göre karşılaştırma). `role`
  // senkron prop'tur (ASYNC TABAN DEĞİL) — taban BİR KEZ (mount'ta) yakalanır.
  const initialRef = useRef({
    key: role?.key ?? "",
    name: role?.name ?? "",
    emoji: role?.emoji ?? "",
    description: role?.description ?? "",
  });
  const isDirty =
    key !== initialRef.current.key ||
    name !== initialRef.current.name ||
    emoji !== initialRef.current.emoji ||
    description !== initialRef.current.description;
  // KURAL 7 · Modal'a isDirty VERİLMEZ, doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Rol");

  const isPending = createRole.isPending || renameRole.isPending;

  function validate(): string | null {
    if (!name.trim()) return "Ad zorunludur.";
    if (mode === "create" && !KEY_RE.test(key)) return "Anahtar küçük harf/rakam/alt-çizgi olmalı ve harfle başlamalı.";
    return null;
  }

  function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    if (mode === "create") {
      createRole.mutate(
        { key, name, emoji, description },
        { onSuccess: onClose, onError: (err) => setFormError(backendErrorMessage(err)) },
      );
    } else if (role) {
      renameRole.mutate(
        { id: role.id, body: { name, emoji, description } },
        { onSuccess: onClose, onError: (err) => setFormError(backendErrorMessage(err)) },
      );
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Yeni Rol" : "Rolü Düzenle"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="settings-form">
        {mode === "create" && (
          <Field
            label="Anahtar (key)"
            required
            hint="Küçük harf, rakam ve alt çizgi; harfle başlamalı."
          >
            {(control) => (
              <Input
                {...control}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="or. saha_muduru"
              />
            )}
          </Field>
        )}
        <Field label="Ad" required>
          {(control) => <Input {...control} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Emoji">
          {(control) => <Input {...control} value={emoji} onChange={(e) => setEmoji(e.target.value)} />}
        </Field>
        <Field label="Açıklama">
          {(control) => (
            <Input {...control} value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
