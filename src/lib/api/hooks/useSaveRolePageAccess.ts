import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { RolePagesResponse, RolePagesUpdate } from "@/lib/api/models";
import { ROLE_PAGES_QUERY_KEY } from "./useRolePageAccess";

interface Vars {
  roleId: string;
  body: RolePagesUpdate;
}

/**
 * IZN-F2 — "Kaydet": TEK atomik `PUT /roles/{id}/pages` (100 anahtar + `hidden_fields`).
 * Başarıda rolün sorgusu sunucunun döndüğü yeni değerle tazelenir ve `/auth/me` oturumu
 * SESSİZCE yeniden çekilir (kabuk menüsü `me.pages` ile süzülür; bayat kalmasın).
 */
export function useSaveRolePageAccess(): UseMutationResult<RolePagesResponse, Error, Vars> {
  const qc = useQueryClient();
  const { refresh } = useSession();
  return useMutation({
    mutationFn: async ({ roleId, body }: Vars) =>
      unwrap(
        await backendClient.PUT("/roles/{role_id}/pages", {
          params: { path: { role_id: roleId } },
          body,
        }),
      ),
    onSuccess: (saved, { roleId }) => {
      qc.setQueryData([ROLE_PAGES_QUERY_KEY, roleId], saved);
      void refresh?.();
    },
  });
}
