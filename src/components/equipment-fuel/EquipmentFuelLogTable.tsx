"use client";

import { DiaryMonthNav } from "@/components/site-diary/DiaryMonthNav";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { Select } from "@/components/ui/select/Select";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyPrecise, formatDateDots, formatDecimal } from "@/lib/format";
import type { EquipmentListResponse } from "@/lib/api/hooks/useEquipment";
import type { FuelLogListResponse } from "@/lib/api/hooks/useEquipmentFuelLogs";

import { EMPTY_VALUE } from "./consumption";
import { PER_LOG_CONSUMPTION_REASON } from "./fuel-labels";
import "./equipment-fuel.css";

export interface EquipmentFuelLogTableProps {
  year: number;
  month: number;
  onShiftMonth: (delta: number) => void;
  equipmentId: string;
  onEquipmentChange: (equipmentId: string) => void;
  equipment: EquipmentListResponse | undefined;
  logs: FuelLogListResponse | undefined;
  isLoading: boolean;
  /** `useEquipmentFuelLogs` hata verirse panel BOŞ kalmasın diye taşınır. */
  isError?: boolean;
  /** Şantiye/proje adı çözümü AYRI kaynaktan gelir; `undefined` ⇒ hâlâ yükleniyor. */
  resolveSiteLabel: (siteId: string | null) => string | null | undefined;
  /** `entered_by_id` → ad; `undefined` ⇒ hâlâ yükleniyor, `null` ⇒ bulunamadı/yetkisiz. */
  resolveEnteredByName: (enteredById: string | null) => string | null | undefined;
  /**
   * KAYIT 90 — `equipment_id` → ad; `undefined` ⇒ ekipman sorgusu hâlâ
   * yükleniyor/hataya düştü, `null` ⇒ yüklendi ama id listede yok (silinmiş/
   * tavan aşımı). Kardeş çözücülerle (site/entered-by) AYNI üç durumlu
   * disiplin — önceden yerel `.find` hiçbir ayrım yapmıyordu.
   */
  resolveEquipmentName: (equipmentId: string) => string | null | undefined;
}

/**
 * M4 94-158 · "Günlük Yakıt Kayıtları" tablosu.
 *
 * Ekipman süzgeci ve ay gezinmesi GERÇEKTİR (`GET /equipment/fuel-logs`
 * `equipment_id`/`date_from`/`date_to` alır) — M3'ün devre-dışı ekipman
 * süzgecinin AKSİNE (o uç süzgeç almıyordu), bu uç alıyor.
 *
 * 🔴 "Tüketim" sütunu (113,124-155) kayıt başına bir uç TAŞIMADIĞI için
 * (`PER_LOG_CONSUMPTION_REASON`) "—" + gerekçe basar — aylık ekipmanın rozetini
 * tek bir güne iğnelemek yanlış bir etiket üretirdi.
 */
export function EquipmentFuelLogTable({
  year,
  month,
  onShiftMonth,
  equipmentId,
  onEquipmentChange,
  equipment,
  logs,
  isLoading,
  isError,
  resolveSiteLabel,
  resolveEnteredByName,
  resolveEquipmentName,
}: EquipmentFuelLogTableProps) {
  const items = logs?.items;
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);

  return (
    <section className="makine-yakit-panel" data-testid="makine-yakit-log-table">
      {/* 96-104 */}
      <div className="makine-yakit-panel__head">
        <h2 className="makine-yakit-panel__title makine-yakit-panel__title--plain">
          Günlük Yakıt Kayıtları
        </h2>
        <Select
          aria-label="Ekipman"
          value={equipmentId}
          data-testid="makine-yakit-equipment-filter"
          onChange={(event) => onEquipmentChange(event.target.value)}
        >
          <option value="">Tüm Ekipmanlar</option>
          {(equipment?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <div className="makine-yakit-panel__nav">
          <DiaryMonthNav year={year} month={month} onShift={onShiftMonth} />
        </div>
      </div>

      {isLoading && <p className="makine-yakit-panel__note">Yükleniyor…</p>}
      {!isLoading && isError && (
        <p className="makine-yakit-panel__note" data-testid="makine-yakit-log-error">
          Kayıtlar yüklenemedi.
        </p>
      )}
      {!isLoading && !isError && items?.length === 0 && (
        <p className="makine-yakit-panel__note" data-testid="makine-yakit-log-empty">
          Bu dönemde yakıt kaydı yok.
        </p>
      )}

      {items !== undefined && items.length > 0 && (
        <table className="makine-yakit-table">
          <thead>
            {/* 106-115 */}
            <tr>
              <th scope="col">Tarih</th>
              <th scope="col">Ekipman</th>
              <th scope="col">Proje</th>
              <th scope="col" className="makine-yakit-table__right">
                Miktar (Lt)
              </th>
              <th scope="col" className="makine-yakit-table__right">
                Lt Fiyatı
                <MaskedMark isHidden={isCostHidden} values={items.map((log) => log.unit_price)} />
              </th>
              <th scope="col" className="makine-yakit-table__right">
                Tutar
                <MaskedMark isHidden={isCostHidden} values={items.map((log) => log.amount)} />
              </th>
              <th scope="col" className="makine-yakit-table__center">
                Tüketim
              </th>
              <th scope="col">Giren</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => {
              const equipmentName = resolveEquipmentName(log.equipment_id);
              const siteLabel = resolveSiteLabel(log.site_id);
              const enteredByName = resolveEnteredByName(log.entered_by_id);

              return (
                <tr key={log.id} data-testid="makine-yakit-log-row">
                  {/* 118 */}
                  <td className="makine-yakit-table__mono">{formatDateDots(log.fuel_date)}</td>
                  {/* 119 */}
                  <td className="makine-yakit-table__name">
                    {equipmentName === undefined
                      ? "Yükleniyor…"
                      : (equipmentName ?? EMPTY_VALUE)}
                  </td>
                  {/* 120 */}
                  <td className="makine-yakit-table__muted">
                    {siteLabel === undefined ? "Yükleniyor…" : (siteLabel ?? "Şantiye atanmadı")}
                  </td>
                  {/* 121 */}
                  <td className="makine-yakit-table__right makine-yakit-table__mono makine-yakit-table__strong">
                    {formatDecimal(log.liters, 2)}
                  </td>
                  {/* 122 */}
                  <td className="makine-yakit-table__right makine-yakit-table__mono makine-yakit-table__muted">
                    {formatDecimal(log.unit_price, 4)}
                  </td>
                  {/* 123 */}
                  <td className="makine-yakit-table__right makine-yakit-table__mono makine-yakit-table__strong">
                    {formatCurrencyPrecise(log.amount)}
                  </td>
                  {/* 124 — 🔴 kayıt başına ucu yok, "—" + gerekçe */}
                  <td className="makine-yakit-table__center">
                    <span
                      className="makine-yakit-table__muted"
                      title={PER_LOG_CONSUMPTION_REASON}
                      data-testid="makine-yakit-log-consumption-empty"
                    >
                      {EMPTY_VALUE}
                    </span>
                  </td>
                  {/* 125 */}
                  <td className="makine-yakit-table__muted">
                    {enteredByName === undefined ? "Yükleniyor…" : (enteredByName ?? EMPTY_VALUE)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
