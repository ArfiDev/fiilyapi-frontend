"use client";

import { Select } from "@/components/ui";
import type { DisciplineRef, ProjectResponse, RoleResponse } from "@/lib/api/models";
import { DisciplineChips } from "./DisciplineChips";
import { selectableRoles } from "./user-access-roles";
import {
  withMember,
  withMemberDiscipline,
  withMemberRole,
  withoutMember,
  withoutMemberDiscipline,
  type AccessDraft,
} from "./user-access-draft";
import "./user-access-modal.css";

interface ProjectTeamTableProps {
  draft: AccessDraft;
  roles: readonly RoleResponse[] | undefined;
  /** Seçilebilecek projeler (zaten ekli olanlar burada süzülür). */
  projects: readonly ProjectResponse[];
  catalog: readonly DisciplineRef[];
  /** Taslak yüklenmediyse/kaydediliyorsa her kontrol kapalı. */
  disabled: boolean;
  onChange: (next: AccessDraft) => void;
}

/** Projeler tablosu (mockup Durum 2): proje · bu projedeki rol · disiplin çipleri · çıkar ×, altta "+ Projeye ekle". */
export function ProjectTeamTable({ draft, roles, projects, catalog, disabled, onChange }: ProjectTeamTableProps) {
  const addable = projects.filter((project) => !draft.members.some((member) => member.projectId === project.id));
  // Yeni satırın rolü: kişinin ana rolü (proje rolü olamıyorsa boş bırakılır, kayıt öncesi seçtirilir).
  const defaultRoleId = selectableRoles(roles, "", true).some((role) => role.id === draft.roleId) ? draft.roleId : "";

  return (
    <section className="uac-team" aria-label="Projeler">
      <div className="uac-team__head">
        <span className="uac-team__title">Projeler</span>
        <span className="uac-team__count">{draft.members.length} projede ekipte</span>
      </div>
      <div className="uac-grid" role="table" aria-label="Proje ekibi">
        <div className="uac-grid__row uac-grid__row--head" role="row">
          <span role="columnheader">Proje</span>
          <span role="columnheader">Bu projedeki rol</span>
          <span role="columnheader">
            Disiplin <span className="uac-grid__optional">(isteğe bağlı)</span>
          </span>
          <span role="columnheader" aria-label="İşlemler" />
        </div>
        {draft.members.map((member) => (
          <div key={member.projectId} className="uac-grid__row" role="row">
            <span className="uac-grid__project" role="cell">
              {member.projectName}
            </span>
            <span role="cell">
              <Select
                size="row"
                aria-label={`${member.projectName}: bu projedeki rol`}
                value={member.roleId}
                disabled={disabled}
                onChange={(event) => onChange(withMemberRole(draft, member.projectId, event.target.value))}
              >
                {member.roleId === "" && <option value="">Rol seçin…</option>}
                {selectableRoles(roles, member.roleId, true).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </span>
            <span role="cell">
              <DisciplineChips
                projectName={member.projectName}
                selected={member.disciplines}
                catalog={catalog}
                disabled={disabled}
                onAdd={(discipline) => onChange(withMemberDiscipline(draft, member.projectId, discipline))}
                onRemove={(disciplineId) => onChange(withoutMemberDiscipline(draft, member.projectId, disciplineId))}
              />
            </span>
            <span role="cell">
              <button
                type="button"
                className="uac-grid__remove"
                title="Projeden çıkar"
                aria-label={`${member.projectName} projesinden çıkar`}
                disabled={disabled}
                onClick={() => onChange(withoutMember(draft, member.projectId))}
              >
                ×
              </button>
            </span>
          </div>
        ))}
        {draft.members.length === 0 && (
          <p className="uac-grid__empty">Henüz hiçbir projenin ekibinde değil — kişi hiçbir projeyi görmez.</p>
        )}
      </div>
      {addable.length > 0 && (
        <span className="uac-add uac-add--block">
          <Select
            aria-label="Projeye ekle"
            value=""
            disabled={disabled}
            onChange={(event) => {
              const chosen = addable.find((project) => project.id === event.target.value);
              if (chosen) {
                onChange(
                  withMember(draft, { projectId: chosen.id, projectName: chosen.name, roleId: defaultRoleId, disciplines: [] }),
                );
              }
            }}
          >
            <option value="">+ Projeye ekle</option>
            {addable.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </span>
      )}
    </section>
  );
}
