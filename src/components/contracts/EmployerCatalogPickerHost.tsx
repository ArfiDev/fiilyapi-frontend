"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { WorkItemPickerModal, type PickerSubmission } from "@/components/work-item-picker/WorkItemPickerModal";
import { backendErrorMessage } from "@/lib/api/error-message";
import { CATALOG_ITEMS_QUERY_KEY } from "@/lib/api/hooks/catalog-query-keys";
import { EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, type EmployerContractItemsResponse } from "@/lib/api/hooks/useContract";
import {
  useBulkCreateEmployerContractItems,
  useCreateEmployerContractGroup,
} from "@/lib/api/hooks/useContractMutations";
import { BackendError } from "@/lib/api/unwrap";

/** Kaynağın değiştiği/başkasının yazdığı anlamına gelen durumlar: kalem + katalog görünümü bayatlamıştır (§2.5). */
const STALE_STATUSES: readonly number[] = [404, 409, 422];

export interface EmployerCatalogPickerHostProps {
  projectId: string;
  /** Seçici alt metni (ÜS-F2-2). */
  projectName?: string;
  groups: EmployerContractItemsResponse["groups"];
  onClose: () => void;
  /** "Katalogda yok mu? Elle poz ekle" (ÜS-F2-1): çağıran seçiciyi kapatıp eski tekli formu açar. */
  onManualAdd: () => void;
  /** Başarıda, seçici kapanmadan ÖNCE: eklenen poz sayısı (durum bildirimi için). */
  onAdded: (count: number) => void;
}

/**
 * TKL-F2.4 · "+ Poz Ekle" → katalog seçicisi + toplu ekleme (TKL-F2-PLAN §2.2/§2.5).
 *
 * Gönderim: (yeni grup ise) önce `useCreateEmployerContractGroup`, sonra TEK `bulk` isteği
 * (hep-ya-hiç). Bulk düşerse açılan grup `createdGroup` olarak seçiciye geri verilir: o grup seçili
 * kalır, ikinci denemede ikinci grup AÇILMAZ. Hata metni backend'den AYNEN bantta basılır, seçim
 * seçicide korunur (seçici kapanmaz). Otomatik yeniden deneme YOKTUR (idempotans anahtarı yok).
 */
export function EmployerCatalogPickerHost({
  projectId,
  projectName,
  groups,
  onClose,
  onManualAdd,
  onAdded,
}: EmployerCatalogPickerHostProps) {
  const queryClient = useQueryClient();
  const createGroup = useCreateEmployerContractGroup(projectId);
  const bulkCreate = useBulkCreateEmployerContractItems(projectId);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<{ id: string; name: string } | null>(null);

  function refreshStaleViews(error: unknown) {
    if (!(error instanceof BackendError) || !STALE_STATUSES.includes(error.status)) return;
    void queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] });
    void queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  }

  async function handleSubmit(submission: PickerSubmission) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    let openedGroup: { id: string; name: string } | null = null;
    try {
      let body = submission.body;
      if (body === null && submission.newGroup !== null) {
        const created = await createGroup.mutateAsync({
          name: submission.newGroup.name,
          sort_order: submission.newGroup.sortOrder,
        });
        openedGroup = { id: created.id, name: created.name };
        body = submission.buildBody(created.id);
      }
      if (body === null) return;
      await bulkCreate.mutateAsync(body);
      onAdded(submission.count);
      onClose();
    } catch (error) {
      // Grup açıldıysa SİLİNMEZ; seçici o grubu seçili tutar (ikinci grup açılmaz).
      if (openedGroup !== null) setCreatedGroup(openedGroup);
      setSubmitError(backendErrorMessage(error));
      refreshStaleViews(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <WorkItemPickerModal
      projectName={projectName}
      groups={groups}
      onSubmit={(submission) => void handleSubmit(submission)}
      onClose={onClose}
      isSubmitting={isSubmitting}
      submitError={submitError}
      createdGroup={createdGroup}
      onManualAdd={onManualAdd}
    />
  );
}
