import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { EQUIPMENT_QUERY_KEY, type EquipmentResponse } from "./useEquipment";
import { EQUIPMENT_DETAIL_QUERY_KEY } from "./useEquipmentDetail";
// 🔴 AD TUZAĞI: yukarıdaki anahtar M2 DÜZENLEME FORMUNUN ucudur
// (`GET /equipment/{id}`). MK-4 detay EKRANI (`…/detail`) AYRI bir
// anahtarda yaşar; tazelenmezse `staleTime` (30 sn) boyunca bayat kalır.
import { EQUIPMENT_DETAIL_SCREEN_QUERY_KEY } from "./useEquipmentDetailScreen";
import { EQUIPMENT_SUMMARY_QUERY_KEY } from "./useEquipmentSummary";
import type { DeepScale } from "@/lib/api/scale";

export type EquipmentCreateRequest = DeepScale<components["schemas"]["EquipmentCreate"]>;
export type EquipmentUpdateRequest = DeepScale<components["schemas"]["EquipmentUpdate"]>;

/**
 * Ekipman oluşturma (`POST /equipment`) — `useCreatePersonnel` deseniyle AYNI:
 * gövde aynen backend'e geçirilir, hata YUTULMAZ (`BackendError` çağırana
 * ulaşır, form Türkçe `detail` metnini basar).
 *
 * ⚠️ K8/MK-1 K2: `ownership === "owned"` iken `purchase_amount` zorunluluğu
 * SUNUCUDADIR (422). Form bunu istemcide de doğrular ama hook gövdeyi sessizce
 * düzeltmez — iki savunma da kendi yerinde durur.
 *
 * Başarıda hem liste hem ÖZET (KPI şeridi) geçersiz kılınır: yeni ekipman
 * durum sayaçlarını da değiştirir.
 */
export function useCreateEquipment(): UseMutationResult<
  EquipmentResponse,
  Error,
  EquipmentCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/equipment", { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_SUMMARY_QUERY_KEY] });
    },
  });
}

/**
 * Ekipman güncelleme (`PATCH /equipment/{equipment_id}`) — `useUpdatePersonnel`
 * deseniyle AYNI. Liste anahtarı süzgeçlere göre çeşitlendiği için KÖK anahtar
 * geçersiz kılınır (React Query alt anahtarların TÜMÜNÜ kapsar).
 *
 * 🔴 Gövdeyi K5 kapısı üretir (`build-body.ts` + `omit-fields.ts`):
 * gönderilmeyen anahtar ile `null` gönderilmesi FARKLIDIR, sunucu bu farkı
 * `model_fields_set` ile korur.
 */
export function useUpdateEquipment(
  equipmentId: string,
): UseMutationResult<EquipmentResponse, Error, EquipmentUpdateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/equipment/{equipment_id}", {
          params: { path: { equipment_id: equipmentId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [EQUIPMENT_SUMMARY_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [EQUIPMENT_DETAIL_QUERY_KEY, equipmentId],
      });
      queryClient.invalidateQueries({
        queryKey: [EQUIPMENT_DETAIL_SCREEN_QUERY_KEY, equipmentId],
      });
    },
  });
}
