import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import {
  HR_LEAVES_SUMMARY_QUERY_KEY,
  LEAVE_REQUESTS_QUERY_KEY,
  type LeaveRequestResponse,
} from "./useLeaves";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-IZN T4 · İzin YAZMA yüzeyi — ÜÇ mutasyon: talep açma, onay, red.
 * (`Form - Izin Talebi.dc.html` · `Form - Izin Reddi.dc.html`)
 *
 * 🔴 `PATCH`/`DELETE /leave-requests/{id}` için hook YAZILMAZ: mockup'ta talep
 * düzenleme ya da silme aksiyonu YOKTUR. Uçlar backend'de durur; eksik olan
 * bilerek eksiktir (F-BC belge silme emsali).
 *
 * 🔴 Üçü de AYNI İKİ sorguyu tazeler: bekleyen talep listesi ve İK izin özeti.
 * Yalnız listeyi tazelemek KPI şeridini ve bakiye tablosunu bayat bırakırdı —
 * onaylanan izin `used`/`remaining` sayılarını da oynatır.
 */
export type LeaveRequestCreate = DeepScale<components["schemas"]["LeaveRequestCreate"]>;
export type LeaveRejectRequest = DeepScale<components["schemas"]["LeaveRejectRequest"]>;

function useLeaveInvalidator(): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [LEAVE_REQUESTS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [HR_LEAVES_SUMMARY_QUERY_KEY] });
  };
}

/**
 * `POST /leave-requests` (talep formu).
 *
 * 🔴 Gövde `extra="forbid"`: `days` ve `status` GÖNDERİLMEZ. `days` sunucu
 * hesabıdır (ekrandaki sayı yalnız ÖNİZLEMEdir), `status` her zaman `pending`
 * başlar. Gövdeyi `LeaveRequestCreate` tipiyle almak bu ikisini derleme
 * anında da imkânsız kılar.
 */
export function useCreateLeaveRequest(): UseMutationResult<
  LeaveRequestResponse,
  Error,
  LeaveRequestCreate
> {
  const invalidate = useLeaveInvalidator();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/leave-requests", { body })),
    onSuccess: invalidate,
  });
}

/**
 * `POST /leave-requests/{id}/approve` — **GÖVDESİZ** (spec §5 K4: onay tek
 * adımdır, karar alanları sunucu damgasıdır; boş olmayan gövde 422 döner).
 *
 * 🔴 Sunucu 409 ile reddedebilir: `pending` değil · çakışan onaylı izin · hak
 * aşımı · kalan hak HESAPLANAMIYOR (fail-closed). Hata YUTULMAZ — çağıran
 * ekran `backendErrorMessage` ile Türkçe `detail`i basar.
 */
export function useApproveLeaveRequest(): UseMutationResult<LeaveRequestResponse, Error, string> {
  const invalidate = useLeaveInvalidator();
  return useMutation({
    mutationFn: async (requestId) =>
      unwrap(
        await backendClient.POST("/leave-requests/{request_id}/approve", {
          params: { path: { request_id: requestId } },
        }),
      ),
    onSuccess: invalidate,
  });
}

export interface LeaveRejectInput {
  requestId: string;
  reason: string;
}

/**
 * `POST /leave-requests/{id}/reject` — `reason` ZORUNLU (`strip()` sonrası boş
 * → 422). Ekranın kapısı da `trim()` üzerinden kurulur (`leaves-derive.ts`),
 * yoksa tek boşluk karakteri istemci kapısını geçip sunucuda patlardı.
 *
 * 🔴 Red HER ZAMAN serbesttir: hak aşımı/çakışma onayı engeller ama reddi
 * ASLA — bu yüzden burada hiçbir eşik denetimi yoktur.
 */
export function useRejectLeaveRequest(): UseMutationResult<
  LeaveRequestResponse,
  Error,
  LeaveRejectInput
> {
  const invalidate = useLeaveInvalidator();
  return useMutation({
    mutationFn: async ({ requestId, reason }) =>
      unwrap(
        await backendClient.POST("/leave-requests/{request_id}/reject", {
          params: { path: { request_id: requestId } },
          body: { reason },
        }),
      ),
    onSuccess: invalidate,
  });
}
