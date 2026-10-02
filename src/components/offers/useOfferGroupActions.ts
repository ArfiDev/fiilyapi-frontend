"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { backendErrorMessage } from "@/lib/api/error-message";
import { offerDetailKey, offerRevisionKey } from "@/lib/api/hooks/offer-query-keys";
import {
  useCreateOfferGroup,
  useDeleteOfferGroup,
  useUpdateOfferGroup,
} from "@/lib/api/hooks/useOfferMutations";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { BackendError, isForbidden } from "@/lib/api/unwrap";

import { MSG_GROUP_NAME_TAKEN, isGroupNameTaken, nextGroupName } from "./offer-group-names";

const CREATE_FAILED = "Grup eklenemedi.";
const RENAME_FAILED = "Grup adı kaydedilemedi.";
const DELETE_FAILED = "Grup silinemedi.";
/** Backend 409 metniyle AYNI (B4.5): dolu grup silinmez — kalemler önce kaldırılır (kaskad silme YOK). */
const GROUP_HAS_ITEMS = "Grupta kalem var; önce kalemleri silin";
/** Kaynağın değiştiği/silindiği anlamına gelen durumlar: revizyon yeniden okunur. */
const STALE_STATUSES: readonly number[] = [404, 409];

export interface OfferGroupActions {
  add: () => void;
  rename: (groupId: string, name: string) => void;
  remove: (groupId: string) => void;
  isBusy: boolean;
  error: string | null;
}

/**
 * TKL-F3.6 · grup yazmaları (ekle · yeniden adlandır · BOŞ grubu sil). Hata metni AYNEN; sıralı değil, tek istek tek sonuç.
 * TKL-F4.2: "+ Grup" çakışmada "Yeni grup 2"… üretir; aynı adla yeniden adlandırma istemcide reddedilir (SO-30).
 *
 * TKL-F4.2b: "+ Grup" uçarken yeniden adlandırma ERTELENİR (ad kararı bayat önbellekle verilirse iki "Yeni grup 2" doğar);
 * uçuş bitince revizyon taze okunur ve ertelenen adlar o veriyle denetlenip gönderilir.
 *
 * TKL-F3.6.1: silme önbelleğe GÜVENMEZ — "×" basınca revizyon önce tazelenir; grupta kalem varsa SİLİNMEZ
 * (backend `delete_group` kalemleri ZİNCİRLEME siler), mesaj basılır ve tablo zaten taze görünür. 404/409'da
 * revizyon yeniden okunur; 403 → `onForbidden` (AccessDenied, SO-19).
 */
export function useOfferGroupActions(offerId: string, revNo: number, onForbidden?: () => void): OfferGroupActions {
  const queryClient = useQueryClient();
  const create = useCreateOfferGroup(offerId, revNo);
  const update = useUpdateOfferGroup(offerId, revNo);
  const remove = useDeleteOfferGroup(offerId, revNo);
  const [error, setError] = useState<string | null>(null);
  // Ref (state DEĞİL): uçuş bayrağı aynı tıklamada senkron okunmalı; render beklenmez.
  const isCreatingRef = useRef(false);
  const deferredRenamesRef = useRef<Map<string, string>>(new Map());

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: offerRevisionKey(offerId, revNo), exact: true });
    void queryClient.invalidateQueries({ queryKey: offerDetailKey(offerId), exact: true });
  }

  function fail(failure: unknown, fallback: string): void {
    if (isForbidden(failure)) {
      onForbidden?.();
      return;
    }
    setError(backendErrorMessage(failure, fallback));
    if (failure instanceof BackendError && STALE_STATUSES.includes(failure.status)) refresh();
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (failure) {
      fail(failure, fallback);
    }
  }

  /** Ad kararı için en son bilinen gruplar (önbellek; bilinmiyorsa boş → backend yine serbest bırakır). */
  function knownGroups(): OfferRevisionRead["groups"] {
    return queryClient.getQueryData<OfferRevisionRead>(offerRevisionKey(offerId, revNo))?.groups ?? [];
  }

  function renameChecked(groupId: string, name: string): void {
    if (isGroupNameTaken(knownGroups(), name, groupId)) {
      setError(MSG_GROUP_NAME_TAKEN); // SO-30: istek UÇMAZ
      return;
    }
    void run(() => update.mutateAsync({ groupId, body: { name } }), RENAME_FAILED);
  }

  function renameOrDefer(groupId: string, name: string): void {
    if (isCreatingRef.current) {
      deferredRenamesRef.current.set(groupId, name);
      return;
    }
    renameChecked(groupId, name);
  }

  /** Ertelenen adlar: revizyon TAZE okunur (yeni grup önbellekte olsun), sonra her ad olağan denetimden geçer. */
  async function flushDeferredRenames(): Promise<void> {
    const deferred = [...deferredRenamesRef.current];
    deferredRenamesRef.current = new Map();
    if (deferred.length === 0) return;
    try {
      await freshRevision();
    } catch (failure) {
      fail(failure, RENAME_FAILED);
      return;
    }
    for (const [groupId, name] of deferred) renameChecked(groupId, name);
  }

  async function addGroup(): Promise<void> {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      await run(() => create.mutateAsync({ name: nextGroupName(knownGroups()) }), CREATE_FAILED);
    } finally {
      isCreatingRef.current = false;
    }
    await flushDeferredRenames();
  }

  /** Taze revizyon (ağdan); okunamazsa hata fırlatır (silme kararı bayat veriyle VERİLMEZ). */
  async function freshRevision(): Promise<OfferRevisionRead | undefined> {
    const queryKey = offerRevisionKey(offerId, revNo);
    await queryClient.refetchQueries({ queryKey, exact: true }, { throwOnError: true });
    return queryClient.getQueryData<OfferRevisionRead>(queryKey);
  }

  async function removeIfEmpty(groupId: string) {
    const fresh = await freshRevision();
    if (fresh === undefined) throw new Error(DELETE_FAILED);
    const group = fresh.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return; // zaten yok: tablo taze veriyle güncellendi
    if (group.items.length > 0) {
      setError(GROUP_HAS_ITEMS);
      return;
    }
    await remove.mutateAsync(groupId);
  }

  return {
    add: () => void addGroup(),
    rename: renameOrDefer,
    remove: (groupId) => void run(() => removeIfEmpty(groupId), DELETE_FAILED),
    isBusy: create.isPending || update.isPending || remove.isPending,
    error,
  };
}
