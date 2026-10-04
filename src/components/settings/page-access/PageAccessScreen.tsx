"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { RoleFormModal } from "@/components/settings/RoleFormModal";
import { usePages } from "@/lib/api/hooks/usePages";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useRolePageAccess } from "@/lib/api/hooks/useRolePageAccess";
import { useSaveRolePageAccess } from "@/lib/api/hooks/useSaveRolePageAccess";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { ROLE_PARAM } from "@/lib/navigation-params";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { PageAccessIntro } from "./PageAccessIntro";
import { RoleList } from "./RoleList";
import { RolePanel } from "./RolePanel";
import { toUpdateBody } from "./page-access-draft";
import { usePageAccessDraft } from "./usePageAccessDraft";
import "../settings.css";
import "./page-access.css";

/**
 * Ayarlar › Sayfa İzinleri: rol seç → 100 sayfa × Görmez/Görür/Düzenler (+ Onaylar) + 6 hassas alan.
 * Kaydet TEK atomik PUT'tur (100 anahtar + gizli alanlar). Seçili rol URL'de (`?rol={id}`) taşınır.
 */
export function PageAccessScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rolesQuery = useRoles();
  const pagesQuery = usePages();
  const save = useSaveRolePageAccess();

  // IZN-F1.3 — atanamaz roller listede yer almaz (süzgeç B2 sonrası da korunur).
  const roles = (rolesQuery.data ?? []).filter((role) => role.is_assignable !== false);
  const requestedId = searchParams.get(ROLE_PARAM);
  const selected =
    roles.find((role) => role.id === requestedId) ?? roles.find((role) => !role.is_locked) ?? roles[0] ?? null;

  const accessQuery = useRolePageAccess(selected?.id ?? null);
  const editor = usePageAccessDraft(accessQuery.data);
  useUnsavedChanges(editor.isDirty, "Sayfa İzinleri");

  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  function openRole(roleId: string) {
    save.reset();
    router.replace(routes.settings.permissionMatrixForRole(roleId), { scroll: false });
  }

  function handleSelect(roleId: string) {
    if (roleId === selected?.id) return;
    // En sade güvenli davranış: kaydedilmemiş değişiklik varken rol değişimi onay ister.
    if (editor.isDirty) {
      setPendingRoleId(roleId);
      return;
    }
    openRole(roleId);
  }

  function handleSave() {
    if (!selected || !editor.draft) return;
    save.mutate({ roleId: selected.id, body: toUpdateBody(editor.draft) }, { onSuccess: editor.reset });
  }

  if (rolesQuery.isLoading || pagesQuery.isLoading) {
    return <p className="settings-note">Yükleniyor…</p>;
  }
  if (isForbidden(rolesQuery.error) || isForbidden(pagesQuery.error) || isForbidden(accessQuery.error)) {
    return <AccessDenied />;
  }
  if (rolesQuery.isError || pagesQuery.isError || !pagesQuery.data) {
    return <p className="settings-note settings-note--error">Sayfa izinleri yüklenemedi.</p>;
  }

  const { baseline, draft } = editor;
  const access = accessQuery.data;
  return (
    <>
      <PageAccessIntro />
      <div className="page-access">
        <RoleList
          roles={roles}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
          onCreate={() => setIsCreating(true)}
        />
        <div className="page-access__panel">
          {selected && access && baseline && draft ? (
            <RolePanel
              role={selected}
              access={access}
              catalog={pagesQuery.data}
              editor={{ ...editor, baseline, draft }}
              isSaving={save.isPending}
              saveError={save.isError ? backendErrorMessage(save.error) : null}
              onSave={handleSave}
            />
          ) : accessQuery.isError ? (
            <p className="settings-note settings-note--error">Rolün sayfa izinleri yüklenemedi.</p>
          ) : (
            <p className="settings-note">Yükleniyor…</p>
          )}
        </div>
      </div>

      {isCreating && <RoleFormModal mode="create" onClose={() => setIsCreating(false)} />}
      {pendingRoleId !== null && (
        <ConfirmDialog
          title="Kaydedilmemiş değişiklikler"
          message="Bu rolde kaydedilmemiş değişiklikler var. Başka bir role geçerseniz kaybolur."
          confirmLabel="Değişiklikleri at"
          cancelLabel="Düzenlemeye dön"
          danger
          onConfirm={() => {
            const target = pendingRoleId;
            setPendingRoleId(null);
            openRole(target);
          }}
          onClose={() => setPendingRoleId(null)}
        />
      )}
    </>
  );
}
