"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { STOCK_LIST_MAX_LIMIT } from "@/lib/api/hooks/useStockItems";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { stockErrorMessage } from "@/lib/api/stock-error";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { INVENTORY_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { WarehouseModal } from "@/components/warehouse-form/WarehouseModal";

import { StockCatalogTable } from "./StockCatalogTable";
import { StockFilterBar } from "./StockFilterBar";
import { StockItemModal } from "./StockItemModal";
import { StockKpiStrip } from "./StockKpiStrip";
import {
  parseStockCategory,
  parseStockStatus,
  STOCK_MOVEMENTS_PENDING_REASON,
} from "./stock-labels";
import "./stock.css";

/** URL durumu anahtarları — süzgeç/arama paylaşılabilir olmalı (E12 deseni). */
const STATUS_PARAM = "durum";
const CATEGORY_PARAM = "kategori";
const QUERY_PARAM = "q";

/**
 * E3 · `/stok` — mockup `Ekran 3 - Stok & Depo.dc.html` (kanonik). Yorumlardaki
 * sayılar o dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (20-33) ve sol menüsü (36-59) BASILMAZ: kabuk canon
 * kazanır (F3 Topbar + Sidebar). Sidebar'daki "Stok & Depo" (49) artık
 * ComingSoon'a değil bu rotaya düşer.
 *
 * ⚠️ TABLONUN KAYNAĞI `useStockSummary`dir. `useStockItems` (künye ucu)
 * BAKİYE/DURUM TAŞIMAZ ve bu ekranda KULLANILMAZ (backend spec §3).
 *
 * ⚠️ Süzgeçlerin üçü de SUNUCUYA gider; KPI'lar süzülen kümenin özetidir.
 * İstemci ne bakiye ne durum hesaplar (spec §3).
 */
export function StockView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const permission = useModulePermission("inventory");
  // IZN-F2.x · kalem/depo/hareket yaz = stok.stok_depo/santiye.stok Düzenler (VEYA).
  const canWrite = useButtonGate({
    pages: INVENTORY_EDIT,
    need: "edit",
    fallback: hasAtLeast(permission.level, "full"),
  });

  const status = parseStockStatus(searchParams.get(STATUS_PARAM));
  const category = parseStockCategory(searchParams.get(CATEGORY_PARAM));
  const query = searchParams.get(QUERY_PARAM) ?? "";

  const [openDialog, setOpenDialog] = useState<"item" | "warehouse" | null>(null);

  // Kırpılma korkuluğu (TB3/F-TH dersi): sunucu varsayılanı 50'dir ve 51.
  // malzemeyi SESSİZCE düşürürdü — tavan AÇIKÇA gönderilir, `total` ile
  // eksiklik görünür kılınır.
  const summaryQuery = useStockSummary({
    limit: STOCK_LIST_MAX_LIMIT,
    ...(status !== undefined ? { status } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(query ? { q: query } : {}),
  });

  if (!permission.canView || isForbidden(summaryQuery.error)) return <AccessDenied />;

  const rows = summaryQuery.data?.items;
  const kpis = summaryQuery.data?.kpis;
  const truncation = buildListTruncation(rows?.length ?? 0, summaryQuery.data?.total);
  const hasFilter = status !== undefined || category !== undefined || query.length > 0;

  /** Süzgeç yazımı: diğer anahtarları KORUR, boş değeri URL'den DÜŞÜRÜR. */
  function pushParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <div className="stok">
      {/* 62 */}
      <p className="stok__eyebrow">Stok &amp; Satınalma</p>
      {/* 63-69 */}
      <div className="stok__head">
        <h1 className="stok__title">Stok &amp; Depo</h1>
        <div className="stok__actions">
          {/* 66 — spec §5 S2: hedef ekran çizilmedi, düğme SİLİNMEZ */}
          <Button variant="secondary" disabled title={STOCK_MOVEMENTS_PENDING_REASON}>
            Stok Hareketi
          </Button>
          {/* F-BLG T2c · `Form - Depo Ekle.dc.html` geldi; eski S3 sapması
              (türetilmiş yüzey) GEÇERSİZ — diyalog artık mockup'ın kendisi */}
          {canWrite && (
            <Button variant="secondary" onClick={() => setOpenDialog("warehouse")}>
              + Depo Ekle
            </Button>
          )}
          {/* 67 — spec §5 S1 türetilmiş diyalog */}
          {canWrite && (
            <Button variant="primary" onClick={() => setOpenDialog("item")}>
              + Malzeme Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Devre dışı düğmenin gerekçesi `title`da görünmez kalır — metne de basılır. */}
      <p className="stok__notice stok__notice--muted" data-testid="stok-movements-notice">
        “Stok Hareketi” listesi ekranı henüz tasarlanmadı; hareketler stok giriş
        formundan yazılır ve bakiyelere burada yansır.
      </p>

      {truncation.isTruncated && (
        <p className="stok__notice" data-testid="stok-truncation-notice">
          {listTruncationMessage(truncation)} Süzgeçleri daraltarak listenin
          tamamını görebilirsiniz.
        </p>
      )}

      {kpis !== undefined && kpis.items_without_price > 0 && (
        <p className="stok__notice" data-testid="stok-price-notice">
          {kpis.items_without_price} kalemin birim fiyatı yok — bu kalemler
          “Toplam Stok Değeri” hesabına GİRMEDİ.
        </p>
      )}

      {/* 72-89 */}
      <StockKpiStrip kpis={kpis} />

      {/* 92-104 */}
      <StockFilterBar
        status={status}
        category={category}
        query={query}
        onStatusChange={(next) => pushParam(STATUS_PARAM, next)}
        onCategoryChange={(next) => pushParam(CATEGORY_PARAM, next)}
        onQueryChange={(next) => pushParam(QUERY_PARAM, next)}
      />

      {/* 107-186 */}
      <StockCatalogTable
        rows={rows}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        errorMessage={
          summaryQuery.isError ? stockErrorMessage(summaryQuery.error) : undefined
        }
        hasFilter={hasFilter}
      />

      {openDialog === "item" && <StockItemModal onClose={() => setOpenDialog(null)} />}
      {openDialog === "warehouse" && <WarehouseModal onClose={() => setOpenDialog(null)} />}
    </div>
  );
}
