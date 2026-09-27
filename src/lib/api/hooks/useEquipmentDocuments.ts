import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-BLG T2b · Ekipman belgesi formunun İKİ okuma kaynağı.
//
// `useDocumentFolders.ts` deseniyle AYNI: tipler `pnpm gen:api` çıktısından
// takma ad olarak alınır, elle arayüz yazmak yasak.

export type EquipmentDocumentTypeListResponse =
  DeepScale<components["schemas"]["EquipmentDocumentTypeListResponse"]>;
export type EquipmentDocumentTypeResponse =
  DeepScale<components["schemas"]["EquipmentDocumentTypeResponse"]>;
export type EquipmentDocumentListResponse =
  DeepScale<components["schemas"]["EquipmentDocumentListResponse"]>;

export const EQUIPMENT_DOCUMENT_TYPES_QUERY_KEY = "equipment-document-types";
export const EQUIPMENT_DOCUMENTS_QUERY_KEY = "equipment-documents";

/**
 * Belge türü listesi (`GET /equipment/document-types`).
 *
 * Şema notu: "altı sabit slot (CRUD ucu YOK)" — liste kullanıcıya göre
 * DEĞİŞMEZ, bu yüzden anahtar parametresizdir. Mockup'ın altı `<option>`u
 * (103-108) GÖSTERMELİKtir; gerçek seçenekler bu uçtan gelir.
 */
export function useEquipmentDocumentTypes(): UseQueryResult<
  EquipmentDocumentTypeListResponse,
  Error
> {
  return useQuery({
    queryKey: [EQUIPMENT_DOCUMENT_TYPES_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/equipment/document-types")),
  });
}

/**
 * Ekipmanın mevcut belgeleri (`GET /equipment/{equipment_id}/documents`).
 *
 * Formda YALNIZ bağlam bandındaki sayaç için okunur (mockup 81 "4 belge
 * kayıtlı" — o rakam GÖSTERMELİKtir). Boş id ile ağa ÇIKILMAZ (`useSites`
 * boş-id kapısı emsali).
 */
export function useEquipmentDocuments(
  equipmentId: string,
): UseQueryResult<EquipmentDocumentListResponse, Error> {
  return useQuery({
    enabled: equipmentId.length > 0,
    queryKey: [EQUIPMENT_DOCUMENTS_QUERY_KEY, equipmentId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/{equipment_id}/documents", {
          params: { path: { equipment_id: equipmentId } },
        }),
      ),
  });
}
