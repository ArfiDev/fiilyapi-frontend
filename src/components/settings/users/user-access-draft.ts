import type { DisciplineRef, UserAccessInput, UserAccessResponse } from "@/lib/api/models";

/**
 * IZN-F3.2 · Kullanıcı erişim taslağı (SAF katman — React yok). Modal, sunucudaki erişimi bu şekle
 * çevirir, kullanıcı dokundukça YENİ taslak üretir (mutasyon yok) ve Kaydet'te `toAccessInput` ile
 * `PUT /users/{id}/access` gövdesine çevirir.
 */
export interface DraftMember {
  projectId: string;
  projectName: string;
  /** O projedeki rol (`roles.id`). Boş = henüz seçilmedi (kayıt öncesi doğrulama yakalar). */
  roleId: string;
  /** Boş = o projede TÜM disiplinler. */
  disciplines: readonly DisciplineRef[];
}

export interface AccessDraft {
  roleId: string;
  allProjects: boolean;
  members: readonly DraftMember[];
}

export const EMPTY_ACCESS_DRAFT: AccessDraft = { roleId: "", allProjects: false, members: [] };

export function draftFromAccess(access: UserAccessResponse): AccessDraft {
  return {
    roleId: access.role_id,
    allProjects: access.all_projects,
    members: access.projects.map((member) => ({
      projectId: member.project_id,
      projectName: member.project_name,
      roleId: member.role_id,
      disciplines: [...member.disciplines],
    })),
  };
}

/** `all_projects` iken ekip BOŞ gönderilir (backend aksi hâlde 422 verir); taslakta satırlar korunur. */
export function toAccessInput(draft: AccessDraft): UserAccessInput {
  return {
    role_id: draft.roleId,
    all_projects: draft.allProjects,
    projects: draft.allProjects
      ? []
      : draft.members.map((member) => ({
          project_id: member.projectId,
          role_id: member.roleId,
          discipline_ids: member.disciplines.map((discipline) => discipline.id),
        })),
  };
}

/** Karşılaştırma sırayı yok sayar (proje ve disiplin kümeleri); `all_projects` iken ekip karşılaştırılmaz. */
function normalized(draft: AccessDraft): string {
  const input = toAccessInput(draft);
  return JSON.stringify({
    role_id: input.role_id,
    all_projects: input.all_projects,
    projects: [...(input.projects ?? [])]
      .map((member) => ({ ...member, discipline_ids: [...(member.discipline_ids ?? [])].sort() }))
      .sort((a, b) => a.project_id.localeCompare(b.project_id)),
  });
}

export function isSameAccess(a: AccessDraft, b: AccessDraft): boolean {
  return normalized(a) === normalized(b);
}

export function withRole(draft: AccessDraft, roleId: string): AccessDraft {
  return { ...draft, roleId };
}

export function withAllProjects(draft: AccessDraft, allProjects: boolean): AccessDraft {
  return { ...draft, allProjects };
}

export function withMember(draft: AccessDraft, member: DraftMember): AccessDraft {
  if (draft.members.some((existing) => existing.projectId === member.projectId)) return draft;
  return { ...draft, members: [...draft.members, member] };
}

export function withoutMember(draft: AccessDraft, projectId: string): AccessDraft {
  return { ...draft, members: draft.members.filter((member) => member.projectId !== projectId) };
}

function mapMember(draft: AccessDraft, projectId: string, change: (member: DraftMember) => DraftMember): AccessDraft {
  return { ...draft, members: draft.members.map((member) => (member.projectId === projectId ? change(member) : member)) };
}

export function withMemberRole(draft: AccessDraft, projectId: string, roleId: string): AccessDraft {
  return mapMember(draft, projectId, (member) => ({ ...member, roleId }));
}

export function withMemberDiscipline(draft: AccessDraft, projectId: string, discipline: DisciplineRef): AccessDraft {
  return mapMember(draft, projectId, (member) =>
    member.disciplines.some((existing) => existing.id === discipline.id)
      ? member
      : { ...member, disciplines: [...member.disciplines, discipline] },
  );
}

export function withoutMemberDiscipline(draft: AccessDraft, projectId: string, disciplineId: string): AccessDraft {
  return mapMember(draft, projectId, (member) => ({
    ...member,
    disciplines: member.disciplines.filter((discipline) => discipline.id !== disciplineId),
  }));
}

/** Kaydet öncesi doğrulama: Türkçe kullanıcı metni ya da `null`. */
export function validateAccess(draft: AccessDraft): string | null {
  if (!draft.roleId) return "Ana rol seçin.";
  if (!draft.allProjects && draft.members.some((member) => !member.roleId)) return "Her proje için bir rol seçin.";
  return null;
}
