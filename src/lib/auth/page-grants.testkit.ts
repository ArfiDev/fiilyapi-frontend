import type { HiddenCategory, PageGrant, PageKey } from "@/lib/api/models";
import type { MeResponse } from "@/lib/auth/types";

/** IZN-F2.x test yardımcıları — sayfa izni (`me.pages`) taşıyan sahte oturum yükü. */
export function pageGrant(level: PageGrant["level"], approve = false): PageGrant {
  return { level, approve };
}

export interface MeFixtureOptions {
  pages?: Partial<Record<PageKey, PageGrant>>;
  isSystemAdmin?: boolean;
  /** Eski modül izinleri (geri uyum düşüşü için). */
  permissions?: Record<string, string>;
  /** IZN-F3.2 · `true` = kişi her projeyi ana rolüyle görür. */
  allProjects?: boolean;
  /** IZN-F3.2 · proje ekibi satırları (proje UUID'si → o projedeki rol ANAHTARI). */
  projects?: ReadonlyArray<{ project_id: string; role_key: string }>;
  /** IZN-F3.2 · ekip rolü anahtarı → o rolün sayfa izinleri. */
  rolePages?: Record<string, Partial<Record<PageKey, PageGrant>>>;
  /** IZN-F4.2 · ana rolün gizli hassas alan kategorileri (`me.hidden_fields`). */
  hiddenFields?: readonly HiddenCategory[];
  /** IZN-F4.2 · ekip rolü anahtarı → o rolün gizli kategorileri (`rolePages` ile birlikte verilir). */
  roleHiddenFields?: Record<string, readonly HiddenCategory[]>;
}

/** `useSession().me` için kısmi yük; `pages` verilmezse alan HİÇ yoktur (eski oturum). */
export function meFixture({
  pages,
  isSystemAdmin = false,
  permissions,
  allProjects,
  projects,
  rolePages,
  hiddenFields,
  roleHiddenFields,
}: MeFixtureOptions = {}): MeResponse {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "test@ornek.com",
    full_name: "Test Kullanıcı",
    title: null,
    role_key: "procurement",
    status: "active",
    is_system_admin: isSystemAdmin,
    ...(pages === undefined ? {} : { pages }),
    ...(hiddenFields === undefined ? {} : { hidden_fields: hiddenFields }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(allProjects === undefined ? {} : { all_projects: allProjects }),
    ...(projects === undefined ? {} : { projects: projects.map((project) => ({ ...project, discipline_ids: [] })) }),
    ...(rolePages === undefined
      ? {}
      : {
          role_pages: Object.fromEntries(
            Object.entries(rolePages).map(([roleKey, pages]) => [roleKey, { pages, hidden_fields: roleHiddenFields?.[roleKey] ?? [] }]),
          ),
        }),
  } as unknown as MeResponse;
}
