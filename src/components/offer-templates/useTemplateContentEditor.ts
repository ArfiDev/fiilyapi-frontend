"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { backendErrorMessage } from "@/lib/api/error-message";
import { offerTemplateKey, offerTemplatesKey } from "@/lib/api/hooks/offer-query-keys";
import {
  useReplaceTemplateContent,
  useSetDefaultTemplate,
  useUpdateOfferTemplate,
  type OfferTemplateUpdateBody,
} from "@/lib/api/hooks/useOfferTemplateMutations";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { BackendError } from "@/lib/api/unwrap";

import { applyEdit, type Edit } from "./template-content";

/** K-F4-1 / plan §9-R1: bayat `expected_updated_at` → 409; metin AYNEN. */
export const MSG_TEMPLATE_STALE = "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin";
const CONFLICT_STATUS = 409;
/** GECE KURALI: backend gövdesinde metin yoksa (ağ hatası vb.) bant metni. */
export const MSG_TEMPLATE_SAVE_FAILED = "Şablon kaydedilemedi";

export type TemplatePatch = Omit<OfferTemplateUpdateBody, "expected_updated_at">;

export interface TemplateContentEditor {
  /** İçerik düzenlemesi: SON detaydan gövde kurar, tek uçuş + sırayla gönderir. */
  edit: (edit: Edit) => Promise<void>;
  /** `edit` ile AYNI yol; sonucu bildirir: `true` = uygulandı (ya da değişiklik yoktu), `false` = reddedildi/hata/409. */
  tryEdit: (edit: Edit) => Promise<boolean>;
  /** Künye (ad/açıklama/oran) PATCH'i — AYNI sıradan geçer (ayrı yol bayat `expected_updated_at` gönderirdi). */
  patch: (fields: TemplatePatch) => Promise<void>;
  /**
   * "Varsayılan yap": backend `updated_at`'i ilerletir — AYNI sıradan geçmezse hemen ardından gelen işlem eski
   * `updated_at` ile 409 alırdı (TKL-F4.6b O2). `true` = yapıldı.
   */
  makeDefault: () => Promise<boolean>;
  /** Varsayılan yap çağrısı sürüyor (düğmeyi kilitlemek için). */
  isMakingDefault: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * TKL-F4.5 · şablon yazma işlemlerinin TEK UÇUŞ + SIRA yürütücüsü (TKL-F4-PLAN §3, §9-R1).
 *
 * `PUT …/content` TAM değiştirme ve `PATCH` iyimser kilit (`expected_updated_at`) taşır. Art arda iki işlem
 * aynı önbellek görüntüsünden gövde kursa ikincisi birincinin değişikliğini EZERDİ (ya da 409 alırdı):
 *   · her işlem SIRASI gelince önbellekteki SON detaydan (bir önceki yazmanın YANITI) gövde kurar;
 *   · uçuştayken gelen işlem kuyruğa girer;
 *   · 409 → şablon + liste tazelenir, bant, kuyruktaki işlemler ATILIR (bayat taban üzerine kurulmuş);
 *   · diğer hata → bant + önbellek yeniden okunur (sonraki işlem taze tabandan gider).
 * Bileşen `key={templateId}` ile kurulur: mutasyon kancaları tek şablona bağlıdır.
 */
export function useTemplateContentEditor(templateId: string): TemplateContentEditor {
  const queryClient = useQueryClient();
  const replace = useReplaceTemplateContent(templateId);
  const update = useUpdateOfferTemplate(templateId);
  const setDefault = useSetDefaultTemplate(templateId);
  const [error, setError] = useState<string | null>(null);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const epoch = useRef(0);
  const writers = useRef({ replace: replace.mutateAsync, update: update.mutateAsync, setDefault: setDefault.mutateAsync });
  writers.current = { replace: replace.mutateAsync, update: update.mutateAsync, setDefault: setDefault.mutateAsync };

  const refreshDetail = useCallback(
    () => queryClient.invalidateQueries({ queryKey: offerTemplateKey(templateId) }),
    [queryClient, templateId],
  );

  const handleFailure = useCallback(
    async (failure: unknown) => {
      if (failure instanceof BackendError && failure.status === CONFLICT_STATUS) {
        epoch.current += 1; // kuyruktaki işlemler bayat tabana kuruludur
        setError(MSG_TEMPLATE_STALE);
        await Promise.all([refreshDetail(), queryClient.invalidateQueries({ queryKey: offerTemplatesKey() })]);
        return;
      }
      setError(backendErrorMessage(failure, MSG_TEMPLATE_SAVE_FAILED));
      await refreshDetail();
    },
    [queryClient, refreshDetail],
  );

  /** Görev `true` dönerse uygulandı; hata/409/bayat kuyruk → `false`. */
  const enqueue = useCallback((task: (latest: OfferTemplateDetail) => Promise<boolean>): Promise<boolean> => {
    const queuedEpoch = epoch.current;
    const run = tail.current.then(async () => {
      if (queuedEpoch !== epoch.current) return false;
      const latest = queryClient.getQueryData<OfferTemplateDetail>(offerTemplateKey(templateId));
      if (latest === undefined) {
        // Detay önbellekte yok (çıkarıldı/yüklenmedi): işlem BANTSIZ düşmesin.
        setError(MSG_TEMPLATE_SAVE_FAILED);
        return false;
      }
      try {
        return await task(latest);
      } catch (failure) {
        await handleFailure(failure);
        return false;
      }
    });
    tail.current = run.then(() => undefined, () => undefined);
    return run;
  }, [handleFailure, queryClient, templateId]);

  const tryEdit = useCallback(
    (change: Edit) =>
      enqueue(async (latest) => {
        setError(null);
        const applied = applyEdit(latest, change);
        if (!applied.ok) {
          setError(applied.error);
          return false;
        }
        if (applied.changed) await writers.current.replace(applied.body);
        return true;
      }),
    [enqueue],
  );

  const edit = useCallback((change: Edit) => tryEdit(change).then(() => undefined), [tryEdit]);

  const patch = useCallback(
    (fields: TemplatePatch) =>
      enqueue(async (latest) => {
        setError(null);
        await writers.current.update({ ...fields, expected_updated_at: latest.updated_at });
        return true;
      }).then(() => undefined),
    [enqueue],
  );

  const makeDefault = useCallback(
    () =>
      enqueue(async () => {
        setError(null);
        await writers.current.setDefault();
        return true;
      }),
    [enqueue],
  );

  const clearError = useCallback(() => setError(null), []);
  return { edit, tryEdit, patch, makeDefault, isMakingDefault: setDefault.isPending, error, clearError };
}
