"use client";

import { useSession } from "@/components/shell/SessionProvider";

export interface DisciplineScope {
  /** Kullanıcıya en az bir disiplin atanmışsa true (backend listeyi süzer). */
  isRestricted: boolean;
  /** Atanmış disiplin adları (boş/whitespace adlar atılır → bildirim adsız metne düşer). */
  names: string[];
}

/**
 * Ağ isteği YAPMAZ: kaynak `SessionProvider`'ın çektiği `/auth/me` yanıtıdır
 * (`useModulePermission` ile aynı desen). `me.disciplines` = `DisciplineRef[]`.
 * Oturum yokken ya da alan yokken kısıtsız sayılır (fail-open) — bugünkü boş
 * metin değişmez.
 */
export function useDisciplineScope(): DisciplineScope {
  const { me } = useSession();
  const list = me?.disciplines ?? [];
  const names = list.map((d) => d.name).filter((n) => n.trim() !== "");
  return { isRestricted: list.length > 0, names };
}
