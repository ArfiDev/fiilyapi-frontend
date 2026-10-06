"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EquipmentTabsStrip } from "@/components/equipment/EquipmentTabsStrip";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { DiaryMonthNav } from "@/components/site-diary/DiaryMonthNav";
import { monthDayIsoList, parsePeriod, shiftPeriod } from "@/components/timesheet/month";
import { Button } from "@/components/ui/button/Button";
import { Select } from "@/components/ui/select/Select";
import { backendErrorMessage } from "@/lib/api/error-message";
import { downloadEquipmentWorkExport } from "@/lib/api/equipment-work-export-client";
import { EQUIPMENT_LIST_MAX_LIMIT, useEquipment } from "@/lib/api/hooks/useEquipment";
import { useEquipmentFuelSummary } from "@/lib/api/hooks/useEquipmentFuelSummary";
import { useEquipmentWorkLogs } from "@/lib/api/hooks/useEquipmentWorkLogs";
import { useEquipmentWorkSummary } from "@/lib/api/hooks/useEquipmentWorkSummary";
import { usePersonnel, PERSONNEL_MAX_LIMIT } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { isLoaded, resolveLookup } from "@/lib/api/query-state";
import { isForbidden } from "@/lib/api/unwrap";
import { EQUIPMENT_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { EquipmentWorkKpiStrip } from "./EquipmentWorkKpiStrip";
import { EquipmentWorkRecentList } from "./EquipmentWorkRecentList";
import { EquipmentWorkSummaryTable } from "./EquipmentWorkSummaryTable";
import { EquipmentWorkWeeklyChart } from "./EquipmentWorkWeeklyChart";
import {
  ADD_RECORD_DISABLED_REASON,
  AUXILIARY_DATA_ERROR_NOTICE,
  EQUIPMENT_FILTER_DISABLED_REASON,
  EXPORT_ERROR_FALLBACK,
  VIEW_MODE_DISABLED_REASON,
} from "./work-labels";
import "@/components/site-diary/site-diary-summary.css";
import "./equipment-work.css";
import { routes } from "@/lib/routes";

/** İzin matrisi anahtarı — MK-1: 21. izin modülü `equipment`. */

/** "Son Kayıtlar" bilerek kısa bir listedir (mockup dört kayıt çizer). */
const RECENT_LOG_LIMIT = 8;

/**
 * `resolveEquipmentName`/`resolveOperatorName` İKİ farklı "yok" durumunu
 * ayırt eder: sorgu henüz YÜKLENİYOR (undefined) ile kayıt haritada
 * BULUNAMADI (ör. sorgu kalıcı hataya düştü, ya da 200'lük tavanın dışında
 * kaldı). `null`, operatörün kaydında GERÇEKTEN olmadığı anlamına gelir
 * (arıza kaydı) — bu iki işaretle KARIŞTIRILMAZ (kalan-3 #196/#197).
 */
const EQUIPMENT_NAME_UNKNOWN = "—";
const OPERATOR_NAME_UNKNOWN = "—";

/**
 * M3 · `/makine/calisma` — mockup `Makine - Çalışma Kaydı.dc.html` (kanonik).
 * Yorumlardaki sayılar o dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (19-29) ve sol menüsü (32-41) UYGULAMA KABUĞUdur —
 * yeniden çizilmez; sol menünün alt öğeleri `EquipmentTabsStrip`e karşılık
 * gelir (spec K1, T2'de kurulan kanonik beş sekme).
 *
 * DÖNEM + ŞANTİYE URL'DEDİR (`?year=&month=&site=`) — bağlantı paylaşılabilir
 * olsun (E5/F-PL deseni). Mockup'ın "Temmuz 2026" sabiti KOPYALANMAZ (tarih
 * artefaktı istisnası): varsayılan içinde bulunulan gerçek aydır.
 *
 * ⚠️ DÖRT BAĞIMSIZ VERİ KAYNAĞI + iki ad çözümleyici sorgu:
 * `work-summary` (tablo + tfoot + grafik) · `work-logs` (son kayıtlar) ·
 * `fuel-summary` (5. KPI kartı) · `useSiteOptions` (şantiye adları) ·
 * `useEquipment` + `usePersonnel` (kayıt satırlarının ekipman/operatör adları,
 * çünkü `WorkLogResponse` yalnız UUID taşır). Her biri kendi pending durumunu
 * taşır — "yüklendi" iddiası kaynak başına AYRI kurulur.
 */
export function EquipmentWorkView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const canViewEquipment = useButtonGate({ pages: EQUIPMENT_VIEW, need: "view" });
  const period = parsePeriod(searchParams.get("year"), searchParams.get("month"));
  const siteParam = searchParams.get("site") ?? "";

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const days = monthDayIsoList(period.year, period.month);

  /**
   * 🔴 EXPORT-XLSX · SIZINTI KURALI — özet tablosunun TEK süzgeç nesnesi.
   * `useEquipmentWorkSummary` ve `GET /equipment/work-summary/export.xlsx`
   * AYNI nesneden beslenir; ayrı kurulsalardı şantiye süzgeci ya da dönem
   * sessizce ayrışır ve kullanıcı bir şantiyeye bakarken TÜM şantiyelerin
   * dosyasını indirebilirdi.
   */
  const summaryFilter = {
    year: period.year,
    month: period.month,
    ...(siteParam ? { siteId: siteParam } : {}),
  };
  const summaryQuery = useEquipmentWorkSummary(summaryFilter);
  const logsQuery = useEquipmentWorkLogs({
    dateFrom: days[0],
    dateTo: days[days.length - 1],
    limit: RECENT_LOG_LIMIT,
    ...(siteParam ? { siteId: siteParam } : {}),
  });
  const fuelQuery = useEquipmentFuelSummary({ year: period.year, month: period.month });
  const siteOptions = useSiteOptions();
  const equipmentQuery = useEquipment({ limit: EQUIPMENT_LIST_MAX_LIMIT });
  const personnelQuery = usePersonnel({ limit: PERSONNEL_MAX_LIMIT });

  if (!canViewEquipment || isForbidden(summaryQuery.error)) return <AccessDenied />;

  const siteLabelById = new Map(siteOptions.options.map((option) => [option.siteId, option.label]));
  const equipmentNameById = new Map(
    (equipmentQuery.data?.items ?? []).map((item) => [item.id, item.name]),
  );
  const personnelNameById = new Map(
    (personnelQuery.data?.items ?? []).map((person) => [person.id, person.full_name]),
  );

  // query-state.ts kanonu (#91 emsali): sorgu hataya düşerse `undefined`
  // (nötr) dönülür — Map boşken `?? null` YANLIŞ "Şantiye atanmadı" basardı.
  function resolveSiteLabel(siteId: string | null): string | null | undefined {
    return resolveLookup(siteId, siteOptions, (id) => siteLabelById.get(id));
  }

  function resolveEquipmentName(equipmentId: string): string | undefined {
    if (equipmentQuery.isLoading) return undefined;
    return equipmentNameById.get(equipmentId) ?? EQUIPMENT_NAME_UNKNOWN;
  }

  function resolveOperatorName(operatorId: string | null): string | null | undefined {
    if (operatorId === null) return null; // arıza kaydında operatör yoktur
    if (personnelQuery.isLoading) return undefined;
    return personnelNameById.get(operatorId) ?? OPERATOR_NAME_UNKNOWN;
  }

  /** `AuditLogScreen` kanonu: uçuşta kilit, hata GÖRÜNÜR. */
  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadEquipmentWorkExport(summaryFilter);
    } catch (error) {
      setExportError(backendErrorMessage(error, EXPORT_ERROR_FALLBACK));
    } finally {
      setIsExporting(false);
    }
  }

  function pushParams(next: { site?: string; year?: number; month?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.site !== undefined) {
      if (next.site) params.set("site", next.site);
      else params.delete("site");
    }
    if (next.year !== undefined) params.set("year", String(next.year));
    if (next.month !== undefined) params.set("month", String(next.month));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="makine-cal">
      {/* 44 */}
      <p className="makine-cal__crumb">
        <Link href={routes.equipment.list()}>← Makine &amp; Ekipman</Link> · Çalışma Kaydı
      </p>

      {/* 45-51 */}
      <div className="makine-cal__head">
        <h1 className="makine-cal__title">Çalışma Kaydı</h1>
        <div className="makine-cal__actions">
          {/* 🔴 48 — EXPORT-XLSX ile GERÇEK:
              `GET /equipment/work-summary/export.xlsx`. Dosya, dönem +
              şantiye süzgeçlerini AYNEN taşır. */}
          <Button
            variant="secondary"
            disabled={isExporting}
            onClick={handleExport}
            data-testid="makine-cal-export"
          >
            Excel İndir
          </Button>
          {/* 49 — 🔴 K10: uç açık ama form mockup'ı yok; form İCAT EDİLMEZ. */}
          <Button
            variant="primary"
            disabled
            title={ADD_RECORD_DISABLED_REASON}
            aria-describedby="makine-cal-add-reason"
            data-testid="makine-cal-add-record"
          >
            + Kayıt Ekle
          </Button>
        </div>
      </div>

      <EquipmentTabsStrip activeTab="Çalışma Kaydı" />

      <p id="makine-cal-add-reason" className="makine-cal__reason">
        {ADD_RECORD_DISABLED_REASON}
      </p>

      {exportError !== null && (
        <p className="makine-cal__notice" data-testid="makine-cal-export-error">
          {exportError}
        </p>
      )}

      {/* 54-76 — dönem + görünüm + süzgeçler */}
      <div className="makine-cal__controls">
        {/* 55-59 */}
        <DiaryMonthNav
          year={period.year}
          month={period.month}
          onShift={(delta) => pushParams(shiftPeriod(period, delta))}
        />

        {/* 60-64 — yalnız "Aylık" gerçektir; ikisi devre-dışı + gerekçe */}
        <div className="makine-cal__viewmode" role="group" aria-label="Görünüm">
          <span className="makine-cal__viewmode-item makine-cal__viewmode-item--active">
            Aylık
          </span>
          <span
            className="makine-cal__viewmode-item makine-cal__viewmode-item--disabled"
            aria-disabled="true"
            title={VIEW_MODE_DISABLED_REASON}
            data-testid="makine-cal-view-weekly"
          >
            Haftalık
          </span>
          <span
            className="makine-cal__viewmode-item makine-cal__viewmode-item--disabled"
            aria-disabled="true"
            title={VIEW_MODE_DISABLED_REASON}
            data-testid="makine-cal-view-daily"
          >
            Günlük
          </span>
        </div>

        {/* 65-70 — özet ucu ekipman süzgeci almıyor; seçici devre-dışı basılır */}
        <Select
          aria-label="Ekipman"
          disabled
          value=""
          title={EQUIPMENT_FILTER_DISABLED_REASON}
          data-testid="makine-cal-equipment-filter"
          onChange={() => undefined}
        >
          <option value="">Tüm Ekipmanlar</option>
        </Select>

        {/* 71-75 — mockup etiketi "Tüm Projeler", alan ŞANTİYEDİR (spec K6) */}
        <Select
          aria-label="Şantiye"
          value={siteParam}
          data-testid="makine-cal-site-filter"
          onChange={(event) => pushParams({ site: event.target.value })}
        >
          <option value="">Tüm Projeler</option>
          {siteOptions.options.map((option) => (
            <option key={option.siteId} value={option.siteId}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <p className="makine-cal__reason" data-testid="makine-cal-filter-reasons">
        {VIEW_MODE_DISABLED_REASON} {EQUIPMENT_FILTER_DISABLED_REASON}
      </p>

      {summaryQuery.isError && (
        <p className="makine-cal__notice" role="alert">
          {backendErrorMessage(summaryQuery.error)}
        </p>
      )}

      {/* M5_3 #107 — summaryQuery/logsQuery DIŞINDAKİ dört kaynak hataya
          düşerse sessizce "—"ye düşmez; görünür bir uyarı basılır. */}
      {(fuelQuery.isError ||
        equipmentQuery.isError ||
        personnelQuery.isError ||
        siteOptions.isError) && (
        <p
          className="makine-cal__notice"
          role="alert"
          data-testid="makine-cal-auxiliary-error"
        >
          {AUXILIARY_DATA_ERROR_NOTICE}
        </p>
      )}

      {/* 79-105 */}
      <EquipmentWorkKpiStrip
        totals={summaryQuery.data?.totals}
        rows={summaryQuery.data?.rows}
        fuel={fuelQuery.data}
        fuelSiteFiltered={siteParam !== ""}
      />

      {/* 108-301 — sol: tablo · sağ: grafik + son kayıtlar */}
      <div className="makine-cal__grid">
        <EquipmentWorkSummaryTable
          year={period.year}
          month={period.month}
          rows={summaryQuery.data?.rows}
          totals={summaryQuery.data?.totals}
          resolveSiteLabel={resolveSiteLabel}
          isLoading={summaryQuery.isLoading}
        />

        <div className="makine-cal__side">
          <EquipmentWorkWeeklyChart
            weeks={summaryQuery.data?.weeks}
            isLoading={summaryQuery.isLoading}
          />
          <EquipmentWorkRecentList
            logs={logsQuery.data?.items}
            isLoading={logsQuery.isLoading}
            isError={logsQuery.isError}
            resolveEquipmentName={resolveEquipmentName}
            resolveSiteLabel={resolveSiteLabel}
            resolveOperatorName={resolveOperatorName}
          />
        </div>
      </div>

      {/* Görsel spec (T6) "yüklendi" iddiasını KAYNAK BAŞINA kurar — F-İK dersi:
          tek bir bayrak, ikinci kaynağın boş olduğunu gizler. */}
      {summaryQuery.data !== undefined && <span hidden data-testid="makine-cal-loaded-summary" />}
      {logsQuery.data !== undefined && <span hidden data-testid="makine-cal-loaded-logs" />}
      {fuelQuery.data !== undefined && <span hidden data-testid="makine-cal-loaded-fuel" />}
      {isLoaded(siteOptions) && <span hidden data-testid="makine-cal-loaded-sites" />}
    </div>
  );
}
