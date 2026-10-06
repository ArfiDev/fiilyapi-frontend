import type { PageGrant, PageKey } from "@/lib/api/models";

/**
 * IZN-F2.x — sayfa izinlerinden düğme kapısı kararı (SAF katman; hook sarmalayıcısı
 * `usePagePermission.ts`'te). Kaynak: backend "düğme → eşik" tablosu.
 *
 * - V (canView)    = en az bir anahtarda `level !== "none"`
 * - E (canEdit)    = en az bir anahtarda `level === "edit"`
 * - A (canApprove) = en az bir anahtarda `approve === true`
 * - SA             = `me.is_system_admin` (her kapıyı geçer; silme/geri al/parola yalnız SA)
 *
 * Birden çok anahtar VEYA'dır (aynı kapıyı paylaşan ikiz sayfalar).
 */
export type GateNeed = "view" | "edit" | "approve" | "sa";

/** Karar için gereken `/auth/me` alt kümesi (kısmi oturum sahteleri de geçer). */
export type PagePermissionMe = {
  is_system_admin?: boolean;
  pages?: Partial<Record<string, PageGrant>>;
  /** IZN-B3 · `true` ise kişi her projeyi ANA ROLÜYLE görür (proje rolü yok). Eski oturumda alan yoktur. */
  all_projects?: boolean;
  /** IZN-B3 · proje ekibi satırları: o projedeki rol ANAHTARI. */
  projects?: ReadonlyArray<{ project_id: string; role_key: string }>;
  /** IZN-B3 · ekip rolü anahtarı → o rolün sayfa izinleri. */
  role_pages?: Partial<Record<string, { pages?: Partial<Record<string, PageGrant>> }>>;
};

/**
 * IZN-F3.2 — hangi sayfa izin haritası geçerli?
 *
 * - `projectId` yok, `all_projects === true` ya da kişi o projenin ekibinde değil → ANA ROL (`me.pages`).
 * - Ekipteyse ve `role_pages`te o rolün haritası varsa → PROJE ROLÜNÜN haritası.
 * - `role_pages`te o rol yoksa → ana rol (bayat/eksik yük sessizce yetki daraltmasın).
 *
 * Şirket geneli sayfalar (menü, Ayarlar…) bu fonksiyonu ÇAĞIRMAZ: onlar her zaman ana rolledir.
 */
export function pagesForProject(
  me: PagePermissionMe | null | undefined,
  projectId?: string | null,
): Partial<Record<string, PageGrant>> {
  const mainPages = me?.pages ?? {};
  if (!me || !projectId || me.all_projects === true) return mainPages;
  const member = me.projects?.find((project) => project.project_id === projectId);
  if (!member) return mainPages;
  return me.role_pages?.[member.role_key]?.pages ?? mainPages;
}

/**
 * Proje bağlamlı sekme/menü görünürlüğü: grant'ı olmayan sayfa GÖRÜNÜR, `none` gizli, sistem
 * yöneticisi her şeyi görür (IZN-F1 `nav-visibility` kuralıyla aynı; ikiz kuralı YOK — anahtar
 * zaten proje düzeyindedir).
 */
export function isPageVisibleInProject(
  me: PagePermissionMe | null | undefined,
  pageKey: PageKey,
  projectId?: string | null,
): boolean {
  if (!me || me.is_system_admin === true) return true;
  const grant = pagesForProject(me, projectId)[pageKey];
  return grant === undefined || grant.level !== "none";
}

export interface PagePermission {
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  isSystemAdmin: boolean;
  /**
   * `true`: istenen anahtarlardan en az birinin grant'ı oturumda VAR (yeni sayfa-izni modeli devrede).
   * `false`: `me.pages` boş/yok ya da anahtarların HİÇBİRİNİN grant'ı yok (eski mock, hücresiz rol,
   * oturum yükleniyor) → çağıran bugünkü `useModulePermission` kararına DÜŞER (`decideGate`).
   * Anahtar verilmediyse (`[]`) "devrede mi" sorusu `me.pages`'in boş olup olmadığına bakar.
   */
  hasGrant: boolean;
  /**
   * IZN-F5c · sayfa-izni modeli bu oturumda DEVREDE mi (`me.pages` ANA ROL haritası dolu). Devredeyken
   * kümede hücre yokluğu "yetki yok" demektir (fail-closed); değilken (eski oturum/yükleniyor) fallback.
   */
  isModelActive: boolean;
}

export function decidePagePermission(
  me: PagePermissionMe | null | undefined,
  pageKeys: readonly PageKey[],
  projectId?: string | null,
): PagePermission {
  const isSystemAdmin = me?.is_system_admin === true;
  const pages = pagesForProject(me, projectId);
  const grants = pageKeys.map((key) => pages[key]).filter((grant): grant is PageGrant => grant !== undefined);
  const hasGrant = pageKeys.length === 0 ? Object.keys(pages).length > 0 : grants.length > 0;
  const isModelActive = Object.keys(me?.pages ?? {}).length > 0;
  return {
    canView: isSystemAdmin || grants.some((grant) => grant.level !== "none"),
    canEdit: isSystemAdmin || grants.some((grant) => grant.level === "edit"),
    canApprove: isSystemAdmin || grants.some((grant) => grant.approve === true),
    isSystemAdmin,
    hasGrant,
    isModelActive,
  };
}

/**
 * Tek düğme kararı. Sistem yöneticisi her zaman geçer. Grant yoksa (`hasGrant === false`): sayfa modeli
 * devredeyse KAPALI (IZN-F5c, fail-closed — hücresiz rol modül iznine düşüp UI'da açık görünmesin),
 * değilse `fallback` (bugünkü modül-izni kararı; eski oturum/yükleniyor). Aksi halde yeni sayfa-izni kararı.
 * `need: "sa"` yalnız sistem yöneticisini geçirir (grant varken).
 */
export function decideGate(permission: PagePermission, need: GateNeed, fallback: boolean): boolean {
  if (permission.isSystemAdmin) return true;
  if (!permission.hasGrant) return permission.isModelActive ? false : fallback;
  switch (need) {
    case "view":
      return permission.canView;
    case "edit":
      return permission.canEdit;
    case "approve":
      return permission.canApprove;
    case "sa":
      return false;
  }
}
