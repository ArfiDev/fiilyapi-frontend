import type { PageGrant, PageKey } from "@/lib/api/models";
import { pageGrant } from "@/lib/auth/page-grants.testkit";

/**
 * IZN-F6a.3 · eski modül seviyesi niyetini (none/view/request/draft/approve/admin/full) sayfa izni haritasına çevirir.
 * Seviye → hücre: none → none · view → view · request/draft/full → edit (Onaylar YOK) · approve/admin → edit + Onaylar.
 * `admin` (Onayı Geri Al/silme gibi `need:"sa"` akışı) için ayrıca `isSystemAdmin: true` fikstürde verilir.
 */
export function levelPages(
  keys: readonly PageKey[],
  level: string | undefined,
): Partial<Record<PageKey, PageGrant>> {
  const grant = levelGrant(level);
  return Object.fromEntries(keys.map((key) => [key, grant]));
}

function levelGrant(level: string | undefined): PageGrant {
  switch (level) {
    case "view":
      return pageGrant("view");
    case "request":
    case "draft":
    case "full":
      return pageGrant("edit");
    case "approve":
    case "admin":
      return pageGrant("edit", true);
    default:
      return pageGrant("none");
  }
}
