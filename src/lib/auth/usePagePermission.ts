"use client";

import { useSession } from "@/components/shell/SessionProvider";
import type { PageKey } from "@/lib/api/models";
import {
  decideGate,
  decidePagePermission,
  type GateNeed,
  type PagePermission,
} from "./page-permission";

/**
 * Oturum yükündeki `pages` hücrelerinden sayfa izni okur (ağ isteği YOK). Birden çok anahtar
 * VEYA'dır (ikiz sayfalar). Düğme kararı için `useButtonGate` kullanılır — geri uyum düşüşü orada.
 */
export function usePagePermission(pageKeys: PageKey | readonly PageKey[]): PagePermission {
  const { me } = useSession();
  const keys: readonly PageKey[] = typeof pageKeys === "string" ? [pageKeys] : pageKeys;
  return decidePagePermission(me, keys);
}

export interface ButtonGateInput {
  pages: PageKey | readonly PageKey[];
  need: GateNeed;
  /** Grant yokken (eski mock/hücresiz rol/yükleniyor) kullanılacak BUGÜNKÜ karar. */
  fallback: boolean;
}

/**
 * Ekran başına izin yardımcısı yazmak yerine TEK yardımcı: sayfa izni varsa onu, yoksa
 * `fallback`'i (bugünkü `useModulePermission` kararı) döndürür; sistem yöneticisi her zaman true.
 */
export function useButtonGate({ pages, need, fallback }: ButtonGateInput): boolean {
  return decideGate(usePagePermission(pages), need, fallback);
}
