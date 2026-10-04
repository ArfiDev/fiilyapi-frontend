/**
 * IZN-F3.1c — disiplin kapsamı kararı (SAF katman; hook sarmalayıcısı `useDisciplineScope.ts`).
 *
 * Disiplin ataması PROJE BAŞINADIR (`me.projects[].discipline_ids`); `me.disciplines` kalktı.
 * - Oturum yok, `all_projects === true` → kısıtsız (fail-open).
 * - PROJE bağlamı (`projectId` verildi): kişi o projenin ekibindeyse o satırın `discipline_ids`'i
 *   (boş = kısıtsız); ekipte DEĞİLSE kısıtsız.
 * - BAĞLAMSIZ (`projectId` yok): herhangi bir projede `discipline_ids` doluysa kısıtlı; kimlikler birleşim.
 */
export interface DisciplineScopeMe {
  all_projects?: boolean;
  projects?: ReadonlyArray<{ project_id: string; discipline_ids?: readonly string[] }>;
}

export interface DisciplineScopeDecision {
  isRestricted: boolean;
  /** Kısıtlıysa görünür disiplin kimlikleri (tekilleştirilmiş, ilk görülme sırasıyla). */
  disciplineIds: string[];
}

const UNRESTRICTED: DisciplineScopeDecision = { isRestricted: false, disciplineIds: [] };

export function decideDisciplineScope(
  me: DisciplineScopeMe | null | undefined,
  projectId?: string | null,
): DisciplineScopeDecision {
  if (!me || me.all_projects === true) return UNRESTRICTED;
  const projects = me.projects ?? [];
  const rows = projectId ? projects.filter((project) => project.project_id === projectId) : projects;
  const ids = [...new Set(rows.flatMap((project) => project.discipline_ids ?? []))];
  return ids.length > 0 ? { isRestricted: true, disciplineIds: ids } : UNRESTRICTED;
}
