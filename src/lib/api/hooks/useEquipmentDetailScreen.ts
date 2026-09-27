import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-MKD · `GET /equipment/{equipment_id}/detail` (MK-4).
 *
 * 🔴 AD ÇARPIŞMASI — BİLEREK `useEquipmentDetail` DEĞİL. O ad bu depoda
 * ZATEN ALINMIŞTIR ve BAŞKA BİR UCA bakar: `useEquipmentDetail`
 * `GET /equipment/{equipment_id}`i çağırır ve M2 düzenleme formunu besler
 * (`equipment-form/EquipmentForm.tsx:82`). Dahası o dosya
 * `EquipmentDetailResponse` adını `= EquipmentResponse` takma adı olarak
 * EXPORT eder — openapi'nin ÜRETTİĞİ `EquipmentDetailResponse` şemasıyla
 * AYNI ADI taşıyan ama BAŞKA bir tiptir. Bu hook o adların hiçbirine
 * dokunmaz; yeni uç kendi adıyla yaşar, yoksa form sessizce başka bir
 * gövdeyi okumaya başlardı.
 *
 * ## Bu uç NEYİN kümesidir (sorgu gövdesinden ölçüldü)
 *
 * `detail_service.equipment_detail` ÖNCE kapsam kapısından geçer
 * (`service.visible_equipment` → K20: görünmeyen kayıt var olmayanla AYNI
 * 404'ü döner) ve İKİ türev bloğu üretir:
 *
 * * `maintenance` — YALNIZ ekipmanın KENDİ saklanan alanlarından türer
 *   (`maintenance.py`), hiçbir hareket taraması yoktur. Tek istisnası
 *   `estimated_service_date`: `repository.worked_hours_in_window` ile son
 *   `ESTIMATE_WINDOW_DAYS` günün temposundan hesaplanır ve o sorgu
 *   **`record_type = worked` ile süzülüdür** — arıza saatleri tempoya
 *   GİRMEZ.
 * * `rental.cumulative_paid` — `rental_repository.paid_lines_for_equipment`
 *   kümesidir: **yalnız `status = paid` hakedişlerin** bu ekipmana ait
 *   satırları, ve toplam onların yalnız `line_kind = rented` olanlarından
 *   oluşur. `approved` hakediş toplama GİRMEZ ("ödenen" ≠ "onaylanan").
 *
 * 🔴 `rental.paid_invoice_count` toplamın kaynağı DEĞİLDİR: servis
 * (`detail_service.py:_rental_totals`) fatura kimliğini `line_kind`
 * süzgecinden ÖNCE kümeye ekler. Yani sayaç "bu ekipman için satırı olan
 * ödenmiş hakediş" adedidir; `owned`/`breakdown` satırlı bir ekipmanda
 * `paid_invoice_count > 0` iken `cumulative_paid` `0` olabilir. Ekran bu
 * yüzden `0` toplamı "hiç ödeme yok" diye YORUMLAMAZ.
 *
 * `as_of` sunucu damgasıdır ve yanıtta AÇIKÇA döner; ekran "bu ay"ı ondan
 * türetir, istemci saatinden DEĞİL (F-P10 kanonu + tarih determinizmi).
 */
export type EquipmentDetailScreenResponse = DeepScale<components["schemas"]["EquipmentDetailResponse"]>;
export type EquipmentMaintenanceBlock = DeepScale<components["schemas"]["EquipmentMaintenanceBlock"]>;
export type EquipmentRentalTotals = DeepScale<components["schemas"]["EquipmentRentalTotals"]>;

export const EQUIPMENT_DETAIL_SCREEN_QUERY_KEY = "equipment-detail-screen";

export function useEquipmentDetailScreen(
  equipmentId: string,
): UseQueryResult<EquipmentDetailScreenResponse, Error> {
  return useQuery({
    // Boş id ile ağa ÇIKILMAZ (`useEquipmentDetail` deseni).
    enabled: equipmentId.length > 0,
    queryKey: [EQUIPMENT_DETAIL_SCREEN_QUERY_KEY, equipmentId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/{equipment_id}/detail", {
          // 🔴 `as_of` GÖNDERİLMEZ: dayanak günü SUNUCUNUNDUR (TR takvimi).
          // İstemci kendi gününü yollasaydı tarayıcı saat dilimi tahmini bakım
          // tarihini oynatır, iki kullanıcı aynı makinede farklı tarih görürdü.
          params: { path: { equipment_id: equipmentId } },
        }),
      ),
  });
}
