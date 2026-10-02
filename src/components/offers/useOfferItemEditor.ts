"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { backendErrorMessage } from "@/lib/api/error-message";
import { offerDetailKey, offerRevisionKey } from "@/lib/api/hooks/offer-query-keys";
import { useDeleteOfferItem, useUpdateOfferItem, type OfferItemUpdateBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferItemRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { BackendError } from "@/lib/api/unwrap";

import { commitCell, type CellContext, type ItemCellField } from "./offer-item-cells";

const CONFLICT_STATUS = 409;
const SAVE_FAILED = "Kalem kaydedilemedi.";
const DELETE_FAILED = "Kalem silinemedi.";
/** Satır düzeyi hata (silme) anahtarı. */
export const ROW_ERROR_FIELD = "row";

type ErrorField = ItemCellField | typeof ROW_ERROR_FIELD;

const cellKey = (itemId: string, field: ErrorField) => `${itemId}:${field}`;

export interface OfferItemEditor {
  /** Kullanıcının yazdığı HAM metin; dokunulmadıysa `undefined`. */
  draftOf: (itemId: string, field: ItemCellField) => string | undefined;
  setDraft: (itemId: string, field: ItemCellField, text: string) => void;
  /** Escape: yazımı at (istek UÇMAZ). */
  cancelDraft: (itemId: string, field: ItemCellField) => void;
  /** Odak çıkışı: kayıt kararı SIRAYA girer (satır başına tek uçuş). */
  commit: (itemId: string, field: ItemCellField) => void;
  /** "↺ kat." / "↺ genel": hazır gövdeyi aynı sıraya yazar. */
  applyBody: (itemId: string, field: ItemCellField, body: OfferItemUpdateBody) => void;
  removeItem: (itemId: string) => void;
  isPending: (itemId: string, field: ItemCellField) => boolean;
  isRowBusy: (itemId: string) => boolean;
  errorOf: (itemId: string, field: ErrorField) => string | null;
}

interface EditorArgs {
  offerId: string;
  revNo: number;
  /** Güncel kalem görünümü (render'da); önbellek boşsa yedek. */
  revision: OfferRevisionRead;
  /** Katalog kalem kimliği → standart a-s ("↺ kat." karşılaştırması). */
  catalogUnitMhrOf: (catalogItemId: string) => string | null;
}

function findItem(revision: OfferRevisionRead, itemId: string): OfferItemRead | undefined {
  for (const group of revision.groups) {
    const found = group.items.find((item) => item.id === itemId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * TKL-F3.6 · kalem tablosunun YAZMA durumu (plan §3.2, risk 10).
 *
 * · Hücre **blur'da** kaydedilir (SZK-F1/F-ISVPOZ emsali); istek uçmadan `commitCell` korkuluğu koşar.
 * · 🔴 **Satır başına TEK uçuş:** aynı satırın yazımları bir söz zincirinde sırayla çalışır; ikinci blur
 *   ilk istek BİTMEDEN uçmaz. Farklı satırlar paralel. Karar (noop/hata/gövde) kuyruğa girerken değil
 *   SIRASI GELİNCE, o an ÖNBELLEKTEKİ taze kalemle verilir (ilk istek değeri değiştirdiyse bayat kıyas yok —
 *   `mutateAsync` revizyon tazelenene kadar bekler).
 * · Uçuştaki hücre `isPending` (yalnız O hücre kilitlenir; Tab akışı bozulmaz); taslak uçuş boyunca
 *   görünür kalır. Hata hücrenin altına AYNEN basılır, hücre sunucu değerine döner; 409'da revizyon yeniden okunur.
 */
export function useOfferItemEditor({ offerId, revNo, revision, catalogUnitMhrOf }: EditorArgs): OfferItemEditor {
  const queryClient = useQueryClient();
  const updateItem = useUpdateOfferItem(offerId, revNo);
  const deleteItem = useDeleteOfferItem(offerId, revNo);

  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [busyRows, setBusyRows] = useState<ReadonlyMap<string, number>>(new Map());

  // Sıradaki görevin okuyacağı değerler render'dan BAĞIMSIZ, anında güncel olmalı.
  const draftsRef = useRef<Record<string, string>>({});
  const tailsRef = useRef(new Map<string, Promise<void>>());
  const latest = useRef({ revision, catalogUnitMhrOf, updateItem, deleteItem });
  latest.current = { revision, catalogUnitMhrOf, updateItem, deleteItem };

  const setDraftValue = useCallback((key: string, text: string | undefined) => {
    const next = { ...draftsRef.current };
    if (text === undefined) delete next[key];
    else next[key] = text;
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const setPending = useCallback((key: string, isPending: boolean) => {
    setPendingKeys((previous) => {
      const next = new Set(previous);
      if (isPending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setError = useCallback((key: string, message: string | null) => {
    setErrors((previous) => {
      if (message === null) {
        if (!(key in previous)) return previous;
        return Object.fromEntries(Object.entries(previous).filter(([existing]) => existing !== key));
      }
      return { ...previous, [key]: message };
    });
  }, []);

  const setRowBusy = useCallback((itemId: string, delta: 1 | -1) => {
    setBusyRows((previous) => {
      const next = new Map(previous);
      const count = (next.get(itemId) ?? 0) + delta;
      if (count <= 0) next.delete(itemId);
      else next.set(itemId, count);
      return next;
    });
  }, []);

  /** Aynı satırın görevlerini ardışık çalıştırır; görev ASLA reddedilmez (hata hücreye yazılır). */
  const enqueue = useCallback(
    (itemId: string, task: () => Promise<void>) => {
      const previous = tailsRef.current.get(itemId) ?? Promise.resolve();
      setRowBusy(itemId, 1);
      const next = previous.then(task).finally(() => {
        setRowBusy(itemId, -1);
        if (tailsRef.current.get(itemId) === next) tailsRef.current.delete(itemId);
      });
      tailsRef.current.set(itemId, next);
    },
    [setRowBusy],
  );

  /** O ANKİ taze kalem (önbellek → yoksa son render). */
  const freshContext = useCallback(
    (itemId: string): CellContext | null => {
      const cached = queryClient.getQueryData<OfferRevisionRead>(offerRevisionKey(offerId, revNo));
      const source = cached ?? latest.current.revision;
      const item = findItem(source, itemId);
      if (item === undefined) return null;
      return {
        item,
        revisionOverheadPct: source.overhead_pct,
        revisionProfitPct: source.profit_pct,
        catalogUnitMhr: latest.current.catalogUnitMhrOf(item.catalog_item_id),
      };
    },
    [queryClient, offerId, revNo],
  );

  const refreshAfterConflict = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: offerRevisionKey(offerId, revNo), exact: true });
    void queryClient.invalidateQueries({ queryKey: offerDetailKey(offerId), exact: true });
  }, [queryClient, offerId, revNo]);

  const send = useCallback(
    async (itemId: string, body: OfferItemUpdateBody, key: string) => {
      try {
        await latest.current.updateItem.mutateAsync({ itemId, body });
        setError(key, null);
      } catch (error) {
        setError(key, backendErrorMessage(error, SAVE_FAILED));
        if (error instanceof BackendError && error.status === CONFLICT_STATUS) refreshAfterConflict();
      }
    },
    [setError, refreshAfterConflict],
  );

  const commit = useCallback(
    (itemId: string, field: ItemCellField) => {
      const key = cellKey(itemId, field);
      if (draftsRef.current[key] === undefined) return;
      setPending(key, true);
      enqueue(itemId, async () => {
        try {
          const context = freshContext(itemId);
          const result = context === null ? ({ kind: "noop" } as const) : commitCell(field, draftsRef.current[key], context);
          if (result.kind === "patch") await send(itemId, result.body, key);
          else setError(key, result.kind === "error" ? result.message : null);
        } finally {
          setDraftValue(key, undefined);
          setPending(key, false);
        }
      });
    },
    [enqueue, freshContext, send, setDraftValue, setError, setPending],
  );

  const applyBody = useCallback(
    (itemId: string, field: ItemCellField, body: OfferItemUpdateBody) => {
      const key = cellKey(itemId, field);
      setPending(key, true);
      enqueue(itemId, async () => {
        try {
          await send(itemId, body, key);
        } finally {
          setPending(key, false);
        }
      });
    },
    [enqueue, send, setPending],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      const key = cellKey(itemId, ROW_ERROR_FIELD);
      enqueue(itemId, async () => {
        try {
          await latest.current.deleteItem.mutateAsync(itemId);
          setError(key, null);
        } catch (error) {
          setError(key, backendErrorMessage(error, DELETE_FAILED));
          if (error instanceof BackendError && error.status === CONFLICT_STATUS) refreshAfterConflict();
        }
      });
    },
    [enqueue, refreshAfterConflict, setError],
  );

  return {
    draftOf: (itemId, field) => drafts[cellKey(itemId, field)],
    setDraft: (itemId, field, text) => setDraftValue(cellKey(itemId, field), text),
    cancelDraft: (itemId, field) => setDraftValue(cellKey(itemId, field), undefined),
    commit,
    applyBody,
    removeItem,
    isPending: (itemId, field) => pendingKeys.has(cellKey(itemId, field)),
    isRowBusy: (itemId) => busyRows.has(itemId),
    errorOf: (itemId, field) => errors[cellKey(itemId, field)] ?? null,
  };
}
