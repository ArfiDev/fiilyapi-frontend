"use client";

import { ROLES_VIEW_PAGES, USERS_EDIT } from "./page-gates";
import { useButtonGate } from "./usePagePermission";

/**
 * IZN-F5a · `GET /roles` açılabilir mi? rol_yonetimi VEYA sayfa_izinleri Görür, YA DA kullanicilar Düzenler.
 * Fallback: sayfa modeli devrede DEĞİLSE (`me.pages` boş/yok: eski oturum/yükleniyor) bugünkü davranış = istek atılır;
 * model devredeyken anahtarlarda hücre yoksa istek ATILMAZ — IZN-F5c'den beri bu kural `decideGate` çekirdeğinde.
 */
export function useCanReadRoles(): boolean {
  const canViewRoles = useButtonGate({ pages: ROLES_VIEW_PAGES, need: "view", fallback: true });
  const canEditUsers = useButtonGate({ pages: USERS_EDIT, need: "edit", fallback: true });
  return canViewRoles || canEditUsers;
}
