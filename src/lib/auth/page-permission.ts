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
};

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
}

export function decidePagePermission(
  me: PagePermissionMe | null | undefined,
  pageKeys: readonly PageKey[],
): PagePermission {
  const isSystemAdmin = me?.is_system_admin === true;
  const pages = me?.pages ?? {};
  const grants = pageKeys.map((key) => pages[key]).filter((grant): grant is PageGrant => grant !== undefined);
  const hasGrant = pageKeys.length === 0 ? Object.keys(pages).length > 0 : grants.length > 0;
  return {
    canView: isSystemAdmin || grants.some((grant) => grant.level !== "none"),
    canEdit: isSystemAdmin || grants.some((grant) => grant.level === "edit"),
    canApprove: isSystemAdmin || grants.some((grant) => grant.approve === true),
    isSystemAdmin,
    hasGrant,
  };
}

/**
 * Tek düğme kararı. Sistem yöneticisi her zaman geçer; grant yoksa (`hasGrant === false`)
 * `fallback` (bugünkü modül-izni kararı) kullanılır; aksi halde yeni sayfa-izni kararı.
 * `need: "sa"` yalnız sistem yöneticisini geçirir (grant varken).
 */
export function decideGate(permission: PagePermission, need: GateNeed, fallback: boolean): boolean {
  if (permission.isSystemAdmin) return true;
  if (!permission.hasGrant) return fallback;
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
