"use client";

import { useSession } from "@/components/shell/SessionProvider";
import type { HiddenCategory } from "@/lib/api/models";
import { isCategoryHidden } from "./hidden-fields";
import { useProjectScopeId } from "./useProjectScopeId";

/**
 * IZN-F4.2 — oturumda bu kategori gizli mi? Ağ isteği YOK (`me`den okur). Proje içi ekranda
 * `projectId` verilirse ekip rolünün gizli alanları geçerlidir (`useProjectScopeId` çözümü).
 */
export function useCategoryHidden(
  category: HiddenCategory | readonly HiddenCategory[],
  projectId?: string | null,
): boolean {
  const { me } = useSession();
  const scopeId = useProjectScopeId(projectId);
  return isCategoryHidden(me, category, scopeId);
}
