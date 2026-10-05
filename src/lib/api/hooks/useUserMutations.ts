import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { USERS_QUERY_KEY } from "./useUsers";
import type {
  UserCreate,
  UserUpdate,
  UserResponse,
  PasswordReset,
} from "@/lib/api/models";

export function useCreateUser(): UseMutationResult<UserResponse, Error, UserCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UserCreate) => unwrap(await backendClient.POST("/users", { body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
    },
  });
}

export function useUpdateUser(): UseMutationResult<UserResponse, Error, { id: string; body: UserUpdate }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) =>
      unwrap(await backendClient.PATCH("/users/{user_id}", { params: { path: { user_id: id } }, body })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
    },
  });
}

export function useDeleteUser(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await backendClient.DELETE("/users/{user_id}", { params: { path: { user_id: id } } }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
    },
  });
}

export function useResetPassword(): UseMutationResult<void, Error, { id: string; body: PasswordReset }> {
  return useMutation({
    mutationFn: async ({ id, body }) => {
      unwrap(await backendClient.PATCH("/users/{user_id}/password", { params: { path: { user_id: id } }, body }));
    },
  });
}
