import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T4 · M3 "Son Kayıtlar" bloğunun (247-298) kaynağı.
export type WorkLogListResponse = DeepScale<components["schemas"]["WorkLogListResponse"]>;
export type WorkLogResponse = DeepScale<components["schemas"]["WorkLogResponse"]>;
export type WorkLogType = components["schemas"]["WorkLogType"];

export const EQUIPMENT_WORK_LOGS_QUERY_KEY = "equipment-work-logs";

/**
 * `GET /equipment/work-logs` `limit` tavanı (openapi: `maximum: 200`).
 * TB3 sayfalama kanonu: sunucu varsayılanı 50'dir, her çağıran `limit`i
 * AÇIKÇA gönderir.
 */
export const EQUIPMENT_WORK_LOGS_MAX_LIMIT = 200;

/** `GET /equipment/work-logs` süzgeçleri (openapi query parametreleri). */
export interface EquipmentWorkLogsFilter {
  equipmentId?: string;
  siteId?: string;
  dateFrom?: string;
  dateTo?: string;
  recordType?: WorkLogType;
  limit?: number;
  offset?: number;
}

/**
 * Sunucu `work_date DESC` sıralar (MK-1 repository) — "Son Kayıtlar" bloğu
 * bu sıraya güvenir, istemcide YENİDEN SIRALAMAZ.
 *
 * ⚠️ Yanıt yalnız `equipment_id`/`site_id`/`operator_id` UUID'si taşır, AD
 * TAŞIMAZ: ekran adları AYRI sorgulardan çözer (bağımsız veri kaynakları).
 */
export function useEquipmentWorkLogs(
  filter: EquipmentWorkLogsFilter = {},
): UseQueryResult<WorkLogListResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_WORK_LOGS_QUERY_KEY,
      filter.equipmentId ?? null,
      filter.siteId ?? null,
      filter.dateFrom ?? null,
      filter.dateTo ?? null,
      filter.recordType ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/work-logs", {
          params: {
            query: {
              ...(filter.equipmentId ? { equipment_id: filter.equipmentId } : {}),
              ...(filter.siteId ? { site_id: filter.siteId } : {}),
              ...(filter.dateFrom ? { date_from: filter.dateFrom } : {}),
              ...(filter.dateTo ? { date_to: filter.dateTo } : {}),
              ...(filter.recordType ? { record_type: filter.recordType } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
