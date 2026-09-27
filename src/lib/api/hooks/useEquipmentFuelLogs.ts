import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T5 · M4 "Günlük Yakıt Kayıtları" tablosunun (105-158) kaynağı.
export type FuelLogListResponse = DeepScale<components["schemas"]["FuelLogListResponse"]>;
export type FuelLogResponse = DeepScale<components["schemas"]["FuelLogResponse"]>;

export const EQUIPMENT_FUEL_LOGS_QUERY_KEY = "equipment-fuel-logs";

/**
 * `GET /equipment/fuel-logs` `limit` tavanı (openapi: `maximum: 200`).
 * TB3 sayfalama kanonu: sunucu varsayılanı 50'dir, her çağıran `limit`i
 * AÇIKÇA gönderir.
 */
export const EQUIPMENT_FUEL_LOGS_MAX_LIMIT = 200;

/** `GET /equipment/fuel-logs` süzgeçleri (openapi query parametreleri). */
export interface EquipmentFuelLogsFilter {
  equipmentId?: string;
  siteId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * ⚠️ Yanıt yalnız `equipment_id`/`site_id`/`entered_by_id` UUID'si taşır, AD
 * TAŞIMAZ: ekran adları AYRI sorgulardan çözer (bağımsız veri kaynakları,
 * `useEquipmentWorkLogs` deseniyle AYNI).
 *
 * `amount` sunucuda KOLON DEĞİLDİR — `liters × unit_price`ın türevidir (MK-1
 * `FuelLogResponse` açıklaması); istemci ikinci bir çarpım YAPMAZ, gövdeki
 * değeri olduğu gibi basar.
 */
export function useEquipmentFuelLogs(
  filter: EquipmentFuelLogsFilter = {},
): UseQueryResult<FuelLogListResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_FUEL_LOGS_QUERY_KEY,
      filter.equipmentId ?? null,
      filter.siteId ?? null,
      filter.dateFrom ?? null,
      filter.dateTo ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/fuel-logs", {
          params: {
            query: {
              ...(filter.equipmentId ? { equipment_id: filter.equipmentId } : {}),
              ...(filter.siteId ? { site_id: filter.siteId } : {}),
              ...(filter.dateFrom ? { date_from: filter.dateFrom } : {}),
              ...(filter.dateTo ? { date_to: filter.dateTo } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
