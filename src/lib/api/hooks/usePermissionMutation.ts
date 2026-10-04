import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { ROLE_PERMISSIONS_QUERY_KEY } from "./useRolePermissions";
import type { PermissionCell, PermissionUpdate } from "@/lib/api/models";

interface Vars {
  roleId: string;
  moduleKey: string;
  update: PermissionUpdate;
}

interface Ctx {
  previous?: PermissionCell[];
  key: (string)[];
}

export function usePermissionMutation(): UseMutationResult<PermissionCell, Error, Vars, Ctx> {
  const qc = useQueryClient();
  // IZN-F1.2 — `/auth/me` react-query'de DEĞİL, kabuk oturumundadır (`SessionProvider`;
  // sorgu anahtarı yoktur): hücre yazılınca `me.pages` bayatlar, menü eski izinle kalmasın
  // diye oturum SESSİZCE yeniden çekilir (başarısızlıkta eski `me` korunur).
  const { refresh } = useSession();
  return useMutation<PermissionCell, Error, Vars, Ctx>({
    mutationFn: async ({ roleId, moduleKey, update }) =>
      unwrap(
        await backendClient.PUT("/roles/{role_id}/permissions/{module_key}", {
          params: { path: { role_id: roleId, module_key: moduleKey } },
          body: update,
        }),
      ),
    onMutate: async ({ roleId, moduleKey, update }) => {
      const key = [ROLE_PERMISSIONS_QUERY_KEY, roleId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PermissionCell[]>(key);
      qc.setQueryData<PermissionCell[]>(key, (old) => {
        const list = old ? [...old] : [];
        const next: PermissionCell = {
          module_key: moduleKey,
          access_level: update.access_level,
          scope: update.scope,
        };
        const idx = list.findIndex((cell) => cell.module_key === moduleKey);
        if (idx >= 0) list[idx] = next;
        else list.push(next);
        return list;
      });
      return { previous, key };
    },
    onSuccess: () => {
      void refresh?.();
    },
    onError: (_err, _vars, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, { roleId }) => {
      qc.invalidateQueries({ queryKey: [ROLE_PERMISSIONS_QUERY_KEY, roleId] });
    },
  });
}
