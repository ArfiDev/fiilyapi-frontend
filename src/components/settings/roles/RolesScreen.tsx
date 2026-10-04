"use client";

import { useState } from "react";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useDeleteRole } from "@/lib/api/hooks/useRoleMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import type { RoleResponse } from "@/lib/api/models";
import { RoleCard } from "./RoleCard";
import { RoleCopyModal } from "./RoleCopyModal";
import { RolesIntroNote } from "./RolesIntroNote";
import "./roles-screen.css";

type ActiveDialog = { type: "copy"; role: RoleResponse } | { type: "delete"; role: RoleResponse } | null;

/** Ayarlar › Rol Yönetimi: rollerin kendisi (kart ızgarası). İzinler Sayfa İzinleri ekranında ayarlanır. */
export function RolesScreen() {
  const rolesQuery = useRoles();
  const deleteRole = useDeleteRole();
  const [modal, setModal] = useState<ActiveDialog>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // IZN-F1.3 — atanamaz roller kart olmaz; yalnız `is_assignable` okunur.
  const roles = (rolesQuery.data ?? []).filter((role) => role.is_assignable !== false);

  function closeModal() {
    setDeleteError(null);
    setModal(null);
  }

  function handleDeleteConfirm(role: RoleResponse) {
    setDeleteError(null);
    deleteRole.mutate(role.id, {
      onSuccess: closeModal,
      onError: (error) => setDeleteError(backendErrorMessage(error)),
    });
  }

  let body: React.ReactNode;
  if (rolesQuery.isLoading) body = <p className="settings-note">Yükleniyor…</p>;
  else if (isForbidden(rolesQuery.error)) body = <AccessDenied />;
  else if (rolesQuery.isError) body = <p className="settings-note settings-note--error">Roller yüklenemedi.</p>;
  else {
    body = (
      <div className="role-card-grid">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            onCopy={(target) => setModal({ type: "copy", role: target })}
            onDelete={(target) => {
              setDeleteError(null);
              setModal({ type: "delete", role: target });
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <RolesIntroNote />
      {body}
      {modal?.type === "copy" && <RoleCopyModal role={modal.role} onClose={closeModal} />}
      {modal?.type === "delete" && (
        <ConfirmDialog
          title="Rolü Sil"
          message={`"${modal.role.name}" rolünü silmek istediğinize emin misiniz?`}
          confirmLabel="Sil"
          danger
          isPending={deleteRole.isPending}
          errorText={deleteError}
          onConfirm={() => handleDeleteConfirm(modal.role)}
          onClose={closeModal}
        />
      )}
    </>
  );
}
