"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { LockIcon } from "@/components/ui/icons";
import type { PageCatalogEntry } from "@/lib/api/hooks/usePages";
import type { RolePagesResponse, RoleResponse } from "@/lib/api/models";
import { HiddenFieldsBox } from "./HiddenFieldsBox";
import { PageGroupSection } from "./PageGroupSection";
import { buildSections } from "./page-access-derive";
import { type AccessDraft } from "./page-access-draft";
import type { PageAccessEditor } from "./usePageAccessDraft";
import { PAGE_ACCESS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

interface RolePanelProps {
  role: RoleResponse;
  access: RolePagesResponse;
  catalog: readonly PageCatalogEntry[];
  /** `baseline` ve `draft` taban yüklenmeden null olamaz: panel yalnız veri varken çizilir. */
  editor: PageAccessEditor & { baseline: AccessDraft; draft: AccessDraft };
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
}

function changesLabel(count: number): string {
  return `${count} kaydedilmemiş değişiklik`;
}

export function RolePanel({ role, access, catalog, editor, isSaving, saveError, onSave }: RolePanelProps) {
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const sections = buildSections(catalog);
  const isLockedRole = access.is_locked || role.is_locked;
  // IZN-F2.x · Kaydet = ayarlar.sayfa_izinleri Düzenler (bugün KAPISIZ → grant yoksa serbest).
  const canEditPages = useButtonGate({ pages: PAGE_ACCESS_EDIT, need: "edit" });
  const isReadOnly = isLockedRole || !canEditPages;

  function toggleGroup(group: string) {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <section className="role-panel" aria-label={`${role.name} sayfa izinleri`}>
      <div className="role-panel__head">
        <span className="role-panel__emoji" aria-hidden="true">
          {role.emoji}
        </span>
        <div>
          <h2 className="role-panel__name">{role.name}</h2>
          <div className="role-panel__sub">
            {role.description ? `${role.description} · ` : ""}
            {role.user_count} kullanıcı
          </div>
        </div>
        <div className="role-panel__actions">
          {isReadOnly ? (
            <span className="role-panel__locked">
              <LockIcon /> {isLockedRole ? "Sistem rolü · değiştirilemez" : "Salt okunur · düzenleme yetkiniz yok"}
            </span>
          ) : (
            <>
              {editor.isDirty && (
                <span className="role-panel__dirty" role="status">
                  <span className="role-panel__dirty-dot" aria-hidden="true" />
                  {changesLabel(editor.changeCount)}
                </span>
              )}
              <Button variant="secondary" disabled={!editor.isDirty || isSaving} onClick={editor.reset}>
                Vazgeç
              </Button>
              <Button variant="primary" disabled={!editor.isDirty || isSaving} onClick={onSave}>
                Kaydet
              </Button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <p className="settings-note settings-note--error role-panel__error" role="alert">
          {saveError}
        </p>
      )}

      <HiddenFieldsBox
        hidden={editor.draft.hidden}
        disabled={isReadOnly}
        onToggle={editor.toggleHidden}
      />

      <div className="page-toolbar">
        <h2 className="page-toolbar__title">Sayfa erişimleri</h2>
        <span className="page-toolbar__sub">
          {catalog.length} sayfa · {sections.length} menü grubu
        </span>
        <span className="page-toolbar__tools">
          <span className="page-toolbar__legend">
            <span className="page-toolbar__legend-bar" aria-hidden="true" />
            değişti
          </span>
          <button
            type="button"
            className="page-toolbar__link"
            onClick={() => setOpenGroups(new Set(sections.map((section) => section.group)))}
          >
            Tümünü aç
          </button>
          <button type="button" className="page-toolbar__link" onClick={() => setOpenGroups(new Set())}>
            Tümünü daralt
          </button>
        </span>
      </div>
      <div className="page-columns" aria-hidden="true">
        <span>Sayfa</span>
        <span>Erişim düzeyi</span>
        <span>Onay</span>
      </div>
      <div className="page-groups">
        {sections.map((section) => (
          <PageGroupSection
            key={section.group}
            section={section}
            draft={editor.draft}
            baseline={editor.baseline}
            isOpen={openGroups.has(section.group)}
            readOnly={isReadOnly}
            onToggle={toggleGroup}
            onLevelChange={editor.setLevel}
            onApproveChange={editor.setApprove}
            onGroupLevelChange={editor.setGroupLevel}
          />
        ))}
      </div>
    </section>
  );
}
