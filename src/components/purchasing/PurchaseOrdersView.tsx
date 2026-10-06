"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { usePurchaseOrders } from "@/lib/api/hooks/usePurchaseOrders";
import { usePurchasingSummary } from "@/lib/api/hooks/usePurchasingSummary";
import { isForbidden } from "@/lib/api/unwrap";
import { PROCUREMENT_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatMonthName } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { PurchaseOrdersKpiStrip } from "./PurchaseOrdersKpiStrip";
import {
  ORDER_MATERIAL_PENDING_MODULE,
  ORDER_QUANTITY_PENDING_MODULE,
  PurchaseOrdersTable,
} from "./PurchaseOrdersTable";
import { PurchasingTabs } from "./PurchasingTabs";
import {
  parsePurchaseOrderStatus,
  PROJECT_PARAM,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_OPTIONS,
  PURCHASING_EYEBROW,
  PURCHASING_LIST_MAX_LIMIT,
  STATUS_PARAM,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * SIP · `/satinalma/siparisler` — mockup `Satınalma - Siparişler.dc.html`
 * (kanonik). Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın kendi üst barı (14-22) BASILMAZ: kabuk canon kazanır (F3 Topbar +
 * Sidebar); breadcrumb'ın gösterdiği "Satınalma / Siparişler" hiyerarşisi
 * sekme şeridiyle (25-30) zaten karşılanır.
 *
 * ⚠️ SÜZGEÇ SUNUCUYA GİDER (`status`) — istemcide süzülen hiçbir şey yoktur;
 * aksi hâlde sayfalanan kümenin dışındaki kayıtlar sessizce kaybolurdu.
 * Mockup'ın seçicisi (34) YALNIZ durumu süzer; `project_id`/`supplier_id`/`q`
 * uçta destekli olsa da mockup onları çizmez → seçici İCAT EDİLMEZ. Proje
 * süzgeci yine de URL'den gelebilir (paylaşılan bağlantı) ve o hâlde sunucuya
 * iletilir.
 */
export function PurchaseOrdersView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // IZN-F5-ön · görüntüleme kapısı = stok.* satınalma sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewProcurement = useButtonGate({
    pages: PROCUREMENT_VIEW_PAGES,
    need: "view",
  });

  // Teslimat renginin ve başlık altı ay adının TEK referansı. Bileşenler
  // `new Date()` çağırmaz (`purchase-order-delivery.ts` notu): mount başına
  // bir kez üretilir, testler ve görsel kareler deterministik kalır.
  const [today] = useState(() => new Date());

  const status = parsePurchaseOrderStatus(searchParams.get(STATUS_PARAM));
  const projectId = searchParams.get(PROJECT_PARAM) ?? "";

  // Kırpılma korkuluğu (ARCHITECTURE §5): tavan AÇIKÇA gönderilir, eksiklik
  // `total` ile GÖRÜNÜR kılınır.
  const ordersQuery = usePurchaseOrders({
    limit: PURCHASING_LIST_MAX_LIMIT,
    ...(status !== undefined ? { status } : {}),
    ...(projectId ? { projectId } : {}),
  });
  const summaryQuery = usePurchasingSummary(projectId || undefined);
  // Satır yalnız `project_id` taşır; "Proje" sütununun adı buradan çözülür.
  const projectsQuery = useProjects();

  if (!canViewProcurement || isForbidden(ordersQuery.error)) return <AccessDenied />;

  const rows = ordersQuery.data?.items;
  const truncation = buildListTruncation(rows?.length ?? 0, ordersQuery.data?.total);
  const projectNames = new Map(
    (projectsQuery.data?.items ?? []).map((project) => [project.id, project.name]),
  );
  const summary = summaryQuery.data;
  const createReason = pendingModuleLabel("purchase_order_create");

  /** Durum seçimi URL'de taşınır (paylaşılabilir bağlantı, E12/E3 deseni). */
  function handleStatusChange(raw: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (raw.length === 0) params.delete(STATUS_PARAM);
    else params.set(STATUS_PARAM, raw);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <div className="sat">
      {/* 19 — kabuktaki breadcrumb'ın metin karşılığı */}
      <p className="sat__eyebrow">{PURCHASING_EYEBROW}</p>

      {/* 25-30 */}
      <PurchasingTabs active="orders" />

      {/* 31-37 */}
      <div className="sat__head">
        <div>
          <h1 className="sat__title">Siparişler</h1>
          {/* 32 — ay ADI `today`den, sayaç SUNUCUDAN gelir */}
          <p className="sip__subtitle" data-testid="sip-subtitle">
            {formatMonthName(today.getMonth() + 1)} {today.getFullYear()}
            {summary ? ` · ${summary.active_orders} aktif sipariş` : ""}
          </p>
        </div>
        <div className="sat__actions">
          {/* 34 — ham <select> YASAK; `Select` primitive'i kullanılır */}
          <Select
            aria-label="Durum süzgeci"
            value={status ?? ""}
            onChange={(event) => handleStatusChange(event.target.value)}
            data-testid="sip-status-filter"
          >
            <option value="">Tüm Durumlar</option>
            {PURCHASE_ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PURCHASE_ORDER_STATUS_LABELS[option]}
              </option>
            ))}
          </Select>

          {/* 35 — spec K4: doğrudan sipariş formu ÇİZİLMEDİ → düğme silinmez,
              devre dışı + görünür gerekçe. Şema kararı da bunu destekler:
              `PurchaseOrderCreate` `request_id` KABUL ETMEZ ve kalem tablosu
              yoktur; talebe bağlı siparişin tek yolu `select-and-order`dır. */}
          <Button
            variant="primary"
            disabled
            title={createReason}
            data-testid="sip-create-order"
          >
            + Sipariş Oluştur<span className="sr-only"> — {createReason}</span>
          </Button>
        </div>
      </div>

      {/* 38-43 */}
      <PurchaseOrdersKpiStrip summary={summary} />

      {/* Kaynağı olmayan İKİ sütun tek bantta ADIYLA sayılır — sessiz atlama
          YASAK (WORKFLOW §3). Hücreler de kendi `title`/`sr-only` gerekçesini
          taşır; bant görünür olanıdır. */}
      <p className="sat__notice sat__notice--muted" data-testid="sip-pending-notice">
        “Malzeme” ve “Miktar” sütunları sipariş ucundan gelmiyor (sipariş kalem
        taşımaz, tek tutar taşır): {pendingModuleLabel(ORDER_MATERIAL_PENDING_MODULE)} ·{" "}
        {pendingModuleLabel(ORDER_QUANTITY_PENDING_MODULE)}. “Detay” ve
        “+ Sipariş Oluştur” ekranları henüz çizilmediği için devre dışıdır.
      </p>

      {truncation.isTruncated && (
        <p className="sat__notice" data-testid="sip-truncation-notice">
          {listTruncationMessage(truncation)} Durum süzgecini daraltarak listenin
          tamamını görebilirsiniz.
        </p>
      )}

      {/* 44-126 */}
      <PurchaseOrdersTable
        rows={rows}
        projectNames={projectNames}
        today={today}
        isLoading={ordersQuery.isLoading}
        isError={ordersQuery.isError}
        errorMessage={
          ordersQuery.isError
            ? backendErrorMessage(ordersQuery.error, "Sipariş listesi yüklenemedi.")
            : undefined
        }
        hasFilter={status !== undefined || projectId.length > 0}
      />
    </div>
  );
}
