"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EquipmentTabsStrip } from "@/components/equipment/EquipmentTabsStrip";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { monthDayIsoList, parsePeriod, shiftPeriod } from "@/components/timesheet/month";
import { Button } from "@/components/ui/button/Button";
import { backendErrorMessage } from "@/lib/api/error-message";
import { EQUIPMENT_LIST_MAX_LIMIT, useEquipment } from "@/lib/api/hooks/useEquipment";
import type { EquipmentNormUnit } from "@/lib/api/hooks/useEquipment";
import { useEquipmentFuelSummary } from "@/lib/api/hooks/useEquipmentFuelSummary";
import {
  EQUIPMENT_FUEL_LOGS_MAX_LIMIT,
  useEquipmentFuelLogs,
} from "@/lib/api/hooks/useEquipmentFuelLogs";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useUserOptions, userOptionLabel } from "@/lib/api/hooks/useUserOptions";
import { resolveLookup } from "@/lib/api/query-state";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EQUIPMENT_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { EquipmentFuelConsumptionList } from "./EquipmentFuelConsumptionList";
import { EquipmentFuelKpiStrip } from "./EquipmentFuelKpiStrip";
import { EquipmentFuelLogTable } from "./EquipmentFuelLogTable";
import { EquipmentFuelTrendPanel } from "./EquipmentFuelTrendPanel";
import { ADD_FUEL_ENTRY_DISABLED_REASON } from "./fuel-labels";
import "./equipment-fuel.css";
import { routes } from "@/lib/routes";

/** İzin matrisi anahtarı — MK-1: 21. izin modülü `equipment`. */
const EQUIPMENT_PERMISSION_MODULE = "equipment";

/**
 * M4 · `/makine/yakit` — mockup `Makine - Yakıt Takibi.dc.html` (kanonik).
 * Yorumlardaki sayılar o dosyanın SATIR numaralarıdır.
 *
 * ⚠️ M4'ün kendi `+ Yakıt Girişi` butonu (22) sabit üst bar KOPYASINDA yaşar
 * (mockup'ın kendine özgü bir varyasyonu) — gerçek uygulama kabuğu (F3
 * Topbar) sayfa başına özel bir eylem yuvası TAŞIMAZ. K10'un gerektirdiği
 * devre-dışı+gerekçe düğmesi bu yüzden M3'ün gövde başlık şeridiyle (44-51)
 * AYNI konuma, gövdeye taşınır — kabuk yeniden çizilmez, yalnız o kontrolün
 * bir yeri olması gerekir.
 *
 * DÖNEM URL'DEDİR (`?year=&month=`) — bağlantı paylaşılabilir olsun (T4
 * deseni). Ekipman süzgeci (`?equipment=`) YALNIZ günlük kayıt tablosunu
 * etkiler (mockup'ta seçici o panelin İÇİNDE, 98) — KPI/tüketim listesi
 * dönemin TAMAMINI gösterir.
 *
 * ⚠️ BEŞ BAĞIMSIZ VERİ KAYNAĞI: `fuel-summary` (KPI + tüketim listesi) ·
 * `fuel-logs` (günlük tablo) · `useEquipment` (tablo ekipman adı/süzgeç +
 * norm birimi) · `useSiteOptions` (şantiye adları) · `useUserOptions` ("Giren"
 * adı). Her biri kendi pending durumunu taşır — "yüklendi" iddiası kaynak
 * başına AYRI kurulur (F-İK dersi).
 */
export function EquipmentFuelView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const permission = useModulePermission(EQUIPMENT_PERMISSION_MODULE);
  const canViewEquipment = useButtonGate({ pages: EQUIPMENT_VIEW, need: "view", fallback: permission.canView });
  const period = parsePeriod(searchParams.get("year"), searchParams.get("month"));
  const equipmentFilter = searchParams.get("equipment") ?? "";

  const days = monthDayIsoList(period.year, period.month);
  const fuelSummaryQuery = useEquipmentFuelSummary({ year: period.year, month: period.month });
  const fuelLogsQuery = useEquipmentFuelLogs({
    dateFrom: days[0],
    dateTo: days[days.length - 1],
    limit: EQUIPMENT_FUEL_LOGS_MAX_LIMIT,
    ...(equipmentFilter ? { equipmentId: equipmentFilter } : {}),
  });
  const equipmentQuery = useEquipment({ limit: EQUIPMENT_LIST_MAX_LIMIT });
  const siteOptions = useSiteOptions();
  const userOptions = useUserOptions();

  if (!canViewEquipment || isForbidden(fuelSummaryQuery.error)) return <AccessDenied />;

  const siteLabelById = new Map(siteOptions.options.map((option) => [option.siteId, option.label]));
  const normUnitById = new Map(
    (equipmentQuery.data?.items ?? []).map((item) => [item.id, item.norm_unit]),
  );
  const equipmentNameById = new Map(
    (equipmentQuery.data?.items ?? []).map((item) => [item.id, item.name]),
  );
  const userNameById = new Map(
    userOptions.options.map((user) => [user.id, userOptionLabel(user)]),
  );

  // kalan-4 #181 / query-state.ts kanonu: sorgu hataya düşerse `undefined`
  // (nötr) dönülür — Map boşken `?? null` YANLIŞ "Şantiye atanmadı" basardı,
  // ama makine gerçekten atanmış olabilir (91. kayıt, fail-open onarımı).
  function resolveSiteLabel(siteId: string | null): string | null | undefined {
    return resolveLookup(siteId, siteOptions, (id) => siteLabelById.get(id));
  }

  function resolveNormUnit(equipmentId: string): EquipmentNormUnit | null | undefined {
    if (equipmentQuery.isLoading) return undefined;
    return normUnitById.get(equipmentId) ?? null;
  }

  // KAYIT 90 — kardeş çözücülerle AYNI disiplin: sorgu yüklenmedi/hataya
  // düştüyse nötr `undefined` ("Yükleniyor…"); yüklendi ama id listede yoksa
  // (silinmiş/tavan aşımı) `null` ("—") — önceden hiçbir ayrım yapılmıyordu
  // ve hücre kalıcı "Yükleniyor…" basıyordu.
  function resolveEquipmentName(equipmentId: string): string | null | undefined {
    return resolveLookup(equipmentId, equipmentQuery, (id) => equipmentNameById.get(id));
  }

  function resolveEnteredByName(enteredById: string | null): string | null | undefined {
    if (enteredById === null) return null; // giren kaydı yok
    if (userOptions.isLoading) return undefined;
    return userNameById.get(enteredById) ?? null; // bulunamadı/yetkisiz ⇒ "—"
  }

  function pushParams(next: { equipment?: string; year?: number; month?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.equipment !== undefined) {
      if (next.equipment) params.set("equipment", next.equipment);
      else params.delete("equipment");
    }
    if (next.year !== undefined) params.set("year", String(next.year));
    if (next.month !== undefined) params.set("month", String(next.month));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="makine-yakit">
      <p className="makine-yakit__crumb">
        <Link href={routes.equipment.list()}>← Makine &amp; Ekipman</Link> · Yakıt Takibi
      </p>

      <div className="makine-yakit__head">
        <h1 className="makine-yakit__title">Yakıt Takibi</h1>
        <div className="makine-yakit__actions">
          {/* 22 — 🔴 K10: uç açık ama form mockup'ı yok; form İCAT EDİLMEZ. */}
          <Button
            variant="primary"
            disabled
            title={ADD_FUEL_ENTRY_DISABLED_REASON}
            aria-describedby="makine-yakit-add-reason"
            data-testid="makine-yakit-add-entry"
          >
            + Yakıt Girişi
          </Button>
        </div>
      </div>

      <EquipmentTabsStrip activeTab="Yakıt Takibi" />

      <p id="makine-yakit-add-reason" className="makine-yakit__reason">
        {ADD_FUEL_ENTRY_DISABLED_REASON}
      </p>

      {fuelSummaryQuery.isError && (
        <p className="makine-yakit__notice" role="alert">
          {backendErrorMessage(fuelSummaryQuery.error)}
        </p>
      )}

      {/* 36-42 */}
      <EquipmentFuelKpiStrip summary={fuelSummaryQuery.data} />

      {/* 44-92 */}
      <div className="makine-yakit__grid">
        <EquipmentFuelConsumptionList
          rows={fuelSummaryQuery.data?.rows}
          totalLiters={fuelSummaryQuery.data?.total_liters}
          resolveNormUnit={resolveNormUnit}
          isLoading={fuelSummaryQuery.isLoading}
        />
        <EquipmentFuelTrendPanel />
      </div>

      {/* 94-158 */}
      <EquipmentFuelLogTable
        year={period.year}
        month={period.month}
        onShiftMonth={(delta) => pushParams(shiftPeriod(period, delta))}
        equipmentId={equipmentFilter}
        onEquipmentChange={(equipment) => pushParams({ equipment })}
        equipment={equipmentQuery.data}
        logs={fuelLogsQuery.data}
        isLoading={fuelLogsQuery.isLoading}
        isError={fuelLogsQuery.isError}
        resolveSiteLabel={resolveSiteLabel}
        resolveEnteredByName={resolveEnteredByName}
        resolveEquipmentName={resolveEquipmentName}
      />

      {/* Görsel spec (T6) "yüklendi" iddiasını KAYNAK BAŞINA kurar — F-İK dersi. */}
      {fuelSummaryQuery.data !== undefined && (
        <span hidden data-testid="makine-yakit-loaded-summary" />
      )}
      {fuelLogsQuery.data !== undefined && <span hidden data-testid="makine-yakit-loaded-logs" />}
      {equipmentQuery.data !== undefined && (
        <span hidden data-testid="makine-yakit-loaded-equipment" />
      )}
      {!siteOptions.isLoading && <span hidden data-testid="makine-yakit-loaded-sites" />}
      {!userOptions.isLoading && <span hidden data-testid="makine-yakit-loaded-users" />}
    </div>
  );
}
