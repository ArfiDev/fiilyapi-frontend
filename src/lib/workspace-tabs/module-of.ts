/**
 * SEKME-F1.1 · bir URL'in ait olduğu MODÜLÜ çözer.
 *
 * `activeNavHref`in EN UZUN önek eşleşmesi mantığı YENİDEN KULLANILIR
 * (`isActivePath` de aynen öyle) — kopyalanmaz. Nav'da karşılığı olmayan
 * yollar (`/ayarlar/...`, yazılmamış ComingSoon slug'ları) için yedek:
 * ilk yol segmenti; etiket önce kırıntı ağacının kökünden (`route-tree.ts`),
 * o da yoksa `moduleNameForSlug`ten (nav-config) gelir.
 */
import { moduleNameForSlug, NAV_GROUPS } from "@/components/shell/nav-config";
import { ROUTE_TRAIL_ROOT } from "@/components/shell/breadcrumb/route-tree";
import { isActivePath } from "@/lib/shell/isActive";

export interface ModuleInfo {
  readonly key: string;
  readonly rootHref: string;
  readonly label: string;
}

function pathnameOf(url: string): string {
  const withoutHash = url.split("#")[0] ?? url;
  const pathname = withoutHash.split("?")[0];
  return pathname === "" ? "/" : pathname;
}

export function moduleOf(url: string): ModuleInfo {
  const pathname = pathnameOf(url);

  let best: { href: string; label: string } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isActivePath(pathname, item.href)) continue;
      if (best === undefined || item.href.length > best.href.length) {
        best = { href: item.href, label: item.label };
      }
    }
  }
  if (best) {
    return { key: best.href, rootHref: best.href, label: best.label };
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const rootHref = "/" + firstSegment;
  const treeLabel = ROUTE_TRAIL_ROOT.children?.[firstSegment]?.label;
  const label = treeLabel ?? moduleNameForSlug(firstSegment);
  return { key: rootHref, rootHref, label };
}
