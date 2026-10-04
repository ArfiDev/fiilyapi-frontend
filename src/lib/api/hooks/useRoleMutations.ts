import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { ROLES_QUERY_KEY } from "./useRoles";
import type { RoleResponse, RoleCreate, RoleRename, RoleCopy } from "@/lib/api/models";

export function useCreateRole(): UseMutationResult<RoleResponse, Error, RoleCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoleCreate) => unwrap(await backendClient.POST("/roles", { body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
    },
  });
}

export function useRenameRole(): UseMutationResult<RoleResponse, Error, { id: string; body: RoleRename }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) =>
      unwrap(await backendClient.PATCH("/roles/{role_id}", { params: { path: { role_id: id } }, body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
    },
  });
}

export function useDeleteRole(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await backendClient.DELETE("/roles/{role_id}", { params: { path: { role_id: id } } }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
    },
  });
}

/** IZN-F2 — `POST /roles/{id}/copy`: sayfa izinleri + gizli alanlar sunucuda kopyalanır; anahtar addan türetilir. */
export function useCopyRole(): UseMutationResult<RoleResponse, Error, { id: string; body: RoleCopy }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) =>
      unwrap(await backendClient.POST("/roles/{role_id}/copy", { params: { path: { role_id: id } }, body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] });
    },
  });
}
