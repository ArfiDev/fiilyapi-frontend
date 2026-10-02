"use client";

import { useState } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";
import {
  useCreateOfferGroup,
  useDeleteOfferGroup,
  useUpdateOfferGroup,
} from "@/lib/api/hooks/useOfferMutations";

/** TD:421 — "+ Grup" yeni grubu bu adla açar. */
const NEW_GROUP_NAME = "Yeni grup";
const CREATE_FAILED = "Grup eklenemedi.";
const RENAME_FAILED = "Grup adı kaydedilemedi.";
const DELETE_FAILED = "Grup silinemedi.";

export interface OfferGroupActions {
  add: () => void;
  rename: (groupId: string, name: string) => void;
  remove: (groupId: string) => void;
  isBusy: boolean;
  error: string | null;
}

/** TKL-F3.6 · grup yazmaları (ekle · yeniden adlandır · BOŞ grubu sil). Hata metni AYNEN; sıralı değil, tek istek tek sonuç. */
export function useOfferGroupActions(offerId: string, revNo: number): OfferGroupActions {
  const create = useCreateOfferGroup(offerId, revNo);
  const update = useUpdateOfferGroup(offerId, revNo);
  const remove = useDeleteOfferGroup(offerId, revNo);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(backendErrorMessage(failure, fallback));
    }
  }

  return {
    add: () => void run(() => create.mutateAsync({ name: NEW_GROUP_NAME }), CREATE_FAILED),
    rename: (groupId, name) => void run(() => update.mutateAsync({ groupId, body: { name } }), RENAME_FAILED),
    remove: (groupId) => void run(() => remove.mutateAsync(groupId), DELETE_FAILED),
    isBusy: create.isPending || update.isPending || remove.isPending,
    error,
  };
}
