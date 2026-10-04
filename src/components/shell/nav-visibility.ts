import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import type { NavGroup, NavItem } from "./nav-config";

type PageKey = components["schemas"]["PageKey"];
type PageGrant = DeepScale<components["schemas"]["PageGrant"]>;
type PageResponse = DeepScale<components["schemas"]["PageResponse"]>;

/** Menü görünürlüğünün okuduğu `/auth/me` alt kümesi (kısmi oturum sahteleri de geçer). */
export type NavVisibilityMe = {
  is_system_admin?: boolean;
  pages?: Partial<Record<string, PageGrant>>;
};

/** Katalogdan yalnız ikiz listesi okunur. */
export type NavVisibilityPage = Pick<PageResponse, "key" | "twins">;

function hasAccess(grant: PageGrant | undefined): boolean {
  return grant !== undefined && grant.level !== "none";
}

/**
 * IZN-F1.2/F1.3 — tek öğenin menüde görünürlüğü.
 *
 * - KENDİ anahtarının grant'ı YOK (bilinmez/eksik anahtar, hücresiz rol) → GÖRÜNÜR.
 * - Öğenin anahtarlarından (`pageKey` + `extraPageKeys`) biri "none" değilse → görünür.
 * - KARAR 5: bir anahtar "none" ama katalogda ikizi (proje içi karşılığı) olan kök sayfaysa, ikizlerinden
 *   biri "none" değilse o anahtar erişim sayılır. Katalog yüklenmediyse (`pages` undefined) ikiz kuralı
 *   uygulanamaz: öğe yalnız kendi grant'larına bakar, hepsi "none" ise yüklenene kadar gizli.
 * - extra anahtarın grant'ı eksikse o anahtar erişim SAYILMAZ (yalnız kendi anahtarı eksikse görünür).
 */
function isItemVisible(
  item: NavItem,
  grants: Partial<Record<string, PageGrant>>,
  twinsByKey: ReadonlyMap<PageKey, readonly PageKey[]>,
): boolean {
  if (grants[item.pageKey] === undefined) return true;
  const keys: readonly PageKey[] = [item.pageKey, ...(item.extraPageKeys ?? [])];
  return keys.some(
    (key) => hasAccess(grants[key]) || (twinsByKey.get(key) ?? []).some((twin) => hasAccess(grants[twin])),
  );
}

/**
 * Menü gruplarını oturumun sayfa izinlerine göre süzer; boş kalan grup düşer.
 * Saf fonksiyondur — girdi dizilerini değiştirmez.
 *
 * `me` yoksa (oturum yükleniyor) menü eskisi gibi tam görünür; sistem yöneticisi her şeyi görür.
 */
export function visibleNavGroups(
  groups: readonly NavGroup[],
  me: NavVisibilityMe | null | undefined,
  pages: readonly NavVisibilityPage[] | undefined,
): NavGroup[] {
  if (!me || me.is_system_admin) return [...groups];
  const grants = me.pages ?? {};
  const twinsByKey = new Map<PageKey, readonly PageKey[]>((pages ?? []).map((page) => [page.key, page.twins]));
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => isItemVisible(item, grants, twinsByKey)) }))
    .filter((group) => group.items.length > 0);
}
