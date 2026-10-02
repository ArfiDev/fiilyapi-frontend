"use client";

import { useState } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";

import type { PickerSubmission } from "./CatalogPickerModal";

export interface CatalogPickerSubmitDeps<TBody> {
  /** Yeni grup gerekiyorsa ÖNCE açılır (sözleşme grubu / teklif grubu). */
  createGroup: (group: { name: string; sort_order: number }) => Promise<{ id: string; name: string }>;
  /** TEK toplu istek (hep-ya-hiç). */
  bulkCreate: (body: TBody) => Promise<unknown>;
  /** Başarıda, seçici kapanmadan ÖNCE: eklenen sayı. */
  onAdded: (count: number) => void;
  onClose: () => void;
  /** Hata sonrası hedefe özgü bayat görünüm tazelemesi (ör. 404/409/422). */
  onFailure: (error: unknown) => void;
}

/**
 * TKL-F2.4 / F3.6 · seçici gönderim akışı (iki host'un ORTAK gövdesi — davranış F2.4 host'undan taşındı):
 * (yeni grup ise) önce `createGroup`, sonra TEK `bulkCreate` (hep-ya-hiç). Bulk düşerse açılan grup
 * `createdGroup` olarak geri verilir: o grup seçili kalır, ikinci denemede ikinci grup AÇILMAZ. Hata metni
 * backend'den AYNEN basılır, seçim seçicide korunur. Otomatik yeniden deneme YOKTUR (idempotans anahtarı yok).
 */
export function useCatalogPickerSubmit<TBody>(deps: CatalogPickerSubmitDeps<TBody>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<{ id: string; name: string } | null>(null);

  async function submit(submission: PickerSubmission<TBody>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    let openedGroup: { id: string; name: string } | null = null;
    try {
      let body = submission.body;
      if (body === null && submission.newGroup !== null) {
        const created = await deps.createGroup({
          name: submission.newGroup.name,
          sort_order: submission.newGroup.sortOrder,
        });
        openedGroup = { id: created.id, name: created.name };
        body = submission.buildBody(created.id);
      }
      if (body === null) return;
      await deps.bulkCreate(body);
      deps.onAdded(submission.count);
      deps.onClose();
    } catch (error) {
      // Grup açıldıysa SİLİNMEZ; seçici o grubu seçili tutar (ikinci grup açılmaz).
      if (openedGroup !== null) setCreatedGroup(openedGroup);
      setSubmitError(backendErrorMessage(error));
      deps.onFailure(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, submitError, createdGroup, submit };
}
