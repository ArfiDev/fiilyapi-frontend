"use client";

import { useSession } from "@/components/shell/SessionProvider";
import type { PageKey } from "@/lib/api/models";
import {
  decideGate,
  decidePagePermission,
  type GateNeed,
  type PagePermission,
  isPageVisibleInProject,
} from "./page-permission";
import { useProjectScopeId } from "./useProjectScopeId";

/**
 * Oturum yükündeki `pages` hücrelerinden sayfa izni okur (ağ isteği YOK). Birden çok anahtar
 * VEYA'dır (ikiz sayfalar). Düğme kararı için `useButtonGate` kullanılır — geri uyum düşüşü orada.
 */
export function usePagePermission(pageKeys: PageKey | readonly PageKey[], projectId?: string | null): PagePermission {
  const { me } = useSession();
  const scopeId = useProjectScopeId(projectId);
  const keys: readonly PageKey[] = typeof pageKeys === "string" ? [pageKeys] : pageKeys;
  return decidePagePermission(me, keys, scopeId);
}

/**
 * IZN-F3.2 — proje içi sekme şeritleri için: verilen proje bağlamında bir sayfa anahtarının görünür
 * olup olmadığını söyleyen süzgeç döndürür (grant yok → görünür, `none` → gizli).
 */
export function useProjectPageVisibility(projectId?: string | null): (pageKey: PageKey) => boolean {
  const { me } = useSession();
  const scopeId = useProjectScopeId(projectId);
  return (pageKey) => isPageVisibleInProject(me, pageKey, scopeId);
}

export interface ButtonGateInput {
  pages: PageKey | readonly PageKey[];
  need: GateNeed;
  /** Grant yokken (eski mock/hücresiz rol/yükleniyor) kullanılacak BUGÜNKÜ karar. */
  fallback: boolean;
  /**
   * IZN-F3.2 · Proje içi ekranda o projenin kimliği (UUID ya da adres anahtarı). Verilirse ve kişi o
   * projenin ekibindeyse kapı PROJE ROLÜNÜN sayfa izinlerinden okunur; yoksa ana rol.
   */
  projectId?: string | null;
}

/**
 * Ekran başına izin yardımcısı yazmak yerine TEK yardımcı: sayfa izni varsa onu, yoksa
 * `fallback`'i (bugünkü `useModulePermission` kararı) döndürür; sistem yöneticisi her zaman true.
 */
export function useButtonGate({ pages, need, fallback, projectId }: ButtonGateInput): boolean {
  return decideGate(usePagePermission(pages, projectId), need, fallback);
}
