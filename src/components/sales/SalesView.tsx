"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useProjectUnits } from "@/lib/api/hooks/useProjectUnits";
import { useSales } from "@/lib/api/hooks/useSales";
import { useSalesSummary } from "@/lib/api/hooks/useSalesSummary";
import { isForbidden } from "@/lib/api/unwrap";
import { SALES_BLOCK_EDIT, SALES_EDIT, SALES_UNIT_EDIT, SALES_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { BLOCK_FORM_HREF, UNIT_FORM_HREF } from "@/components/unit-shell/routes";

import { BlockOccupancyMap } from "./BlockOccupancyMap";
import { SalesKpiStrip } from "./SalesKpiStrip";
import { SalesTable } from "./SalesTable";
import { UpcomingCollectionsCard } from "./UpcomingCollectionsCard";
import { parseSalesStatusFilter, PRICE_LIST_PENDING_REASON } from "./sales-labels";
import "./sales.css";
import { routes } from "@/lib/routes";
import { PROJECT_PARAM } from "@/lib/navigation-params";

/** URL durumu anahtarları — seçili proje ve süzgeç paylaşılabilir olmalı. */
const STATUS_PARAM = "durum";

/** T3'ün açacağı satış formu (spec K1). */
export const NEW_SALE_HREF = routes.sales.new();

/**
 * SY · `/satis` — mockup `Satış Yönetimi.dc.html` (kanonik). Yorumlardaki
 * sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (14-27) ve sol menüsü (30-49) BASILMAZ: kabuk canon
 * kazanır (F3 Topbar + Sidebar).
 *
 * ⚠️ PROJE SEÇİCİ — ONAYLI TÜRETİM. Mockup tek bir projenin bağlamında
 * çizilmiştir (breadcrumb 19-21, sol menüde "Yeşilvadi Rezidans" bloğu) ama
 * spec §3/K1 rotayı PROJE-GENEL (`/satis`) tanımlar; oysa uçların hepsi proje
 * kapsamlıdır (`/projects/{id}/sales[...]`). Köprü şarttır: seçici olmadan
 * ekran hangi projeyi göstereceğini bilemez. Emsal, `/puantaj` E5 ekranının
 * şantiye seçicisidir (F-PT T2) — seçim URL'de taşınır.
 *
 * ⚠️ SATIŞ DETAY EKRANI YOKTUR (spec §2/K3): `activate` / `transfer-deed` /
 * `cancel` / `pay` aksiyonları bu ekranda HİÇ basılmaz, satır detaya GİTMEZ.
 */
export function SalesView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 🔴 AYRI KAPI: blok/ünite uçlarının izin modülü `projects`tir (`sales`
  // DEĞİL) — `useProjectUnits.ts`in ölçtüğü ayrım, iki formun kendisi de aynı
  // kapıyı kullanıyor (`BlockCreateView`/`UnitCreateView`). Yalnız `sales`
  // yetkisi olan kullanıcı bu iki girişi GÖRMEZ; gördüğü an form 403 verirdi.
  // IZN-F5b · satış kaydı = mali.satis Düzenler; "Blok Ekle" = mali.satis_blok, "Ünite Ekle" = mali.satis_unite
  // Düzenler (her düğme KENDİ formunun yazma ucunun sayfasına bağlı).
  const canCreateSale = useButtonGate({ pages: SALES_EDIT, need: "edit" });
  const canCreateBlock = useButtonGate({ pages: SALES_BLOCK_EDIT, need: "edit" });
  const canCreateUnit = useButtonGate({ pages: SALES_UNIT_EDIT, need: "edit" });
  // IZN-F5-ön · görüntüleme kapısı = mali.satis Görür; grant yoksa `sales` modül izni.
  const canViewSales = useButtonGate({ pages: SALES_VIEW_PAGES, need: "view" });

  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const projectParam = searchParams.get(PROJECT_PARAM);
  // Seçim URL'den; yoksa listenin ilki (mockup seçiciyi HER ZAMAN dolu çizer).
  const selectedProjectId =
    projectParam ?? projects[0]?.id ?? "";
  const statusFilter = parseSalesStatusFilter(searchParams.get(STATUS_PARAM));

  const salesQuery = useSales(selectedProjectId);
  const summaryQuery = useSalesSummary(selectedProjectId);
  const unitsQuery = useProjectUnits(selectedProjectId);

  if (
    !canViewSales ||
    isForbidden(projectsQuery.error) ||
    isForbidden(salesQuery.error) ||
    isForbidden(summaryQuery.error)
  ) {
    return <AccessDenied />;
  }

  /** Süzgeç/proje yazımı: diğer anahtarları KORUR, boş değeri URL'den DÜŞÜRÜR. */
  function pushParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  /**
   * Seçili projeyi forma TAŞIR (`PROJECT_PARAM` ile aynı anahtar). Bağlam
   * gitmezse form proje seçicisi boş açılır ve kullanıcı seçimini tekrarlar.
   */
  function formHref(base: string): string {
    return selectedProjectId
      ? `${base}?${PROJECT_PARAM}=${encodeURIComponent(selectedProjectId)}`
      : base;
  }

  // Ünite haritası AYRI izin modülüne (`projects`) bağlıdır: 403 ekranı
  // düşürmez, kart görünür gerekçeyle boş kalır.
  const unitsNotice = unitsQuery.isError
    ? isForbidden(unitsQuery.error)
      ? "Blok doluluk haritası için ünite (proje) yetkisi gerekiyor."
      : backendErrorMessage(unitsQuery.error, "Ünite listesi yüklenemedi.")
    : undefined;

  // no 237 · 403 dışı bir proje listesi hatası (ağ/500) `AccessDenied`a
  // düşmez ama sessiz de kalmamalı — proje seçici boş, KPI/tablo "—"/"yok"
  // gösterirken gerçek sebep burada görünür yazılır.
  const projectsErrorNotice =
    projectsQuery.isError && !isForbidden(projectsQuery.error)
      ? backendErrorMessage(projectsQuery.error, "Proje listesi yüklenemedi.")
      : undefined;

  return (
    <div className="satis">
      {/* 19-21 · breadcrumb'ın son öğesi sayfa başlığıdır */}
      <div className="satis__head">
        <h1 className="satis__title">Satış Yönetimi</h1>
        <div className="satis__actions">
          {/* Proje seçici — onaylı türetim (yukarıdaki not) */}
          <Select
            size="row"
            aria-label="Proje seçimi"
            value={selectedProjectId}
            onChange={(event) => pushParam(PROJECT_PARAM, event.target.value)}
          >
            {projects.length === 0 && <option value="">Proje yok</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          {/* 24 · hedef ekran çizilmedi → düğme SİLİNMEZ, devre dışı basılır */}
          <Button variant="secondary" disabled title={PRICE_LIST_PENDING_REASON}>
            Fiyat Listesi
          </Button>
          {/* 🔴 ONAYLI TÜRETİM — iki form kendi KONUMUNU söylüyor. BE 35 ve UE 37
              breadcrumb'ları "Satış Yönetimi / Blok Ekle" (href="Satış
              Yönetimi.dc.html") yazar; üründe hiçbir ekran bu formlara link
              vermiyordu, yani rotaları YALNIZ elle URL yazarak açılıyordu.
              Giriş noktası mockup'ın kendi beyanına göre buradadır.

              Düğme dili İCAT EDİLMEZ: `btn btn--secondary btn--md` ikisi de
              zaten var olan sınıflardır (`Fiyat Listesi` ikincil, `+ Satış
              Kaydı` link-düğme). İkincil seçilmesinin nedeni hiyerarşidir —
              mockup bu şeritte TEK birincil eylem çizer, üç mavi düğme onu
              siler. Sıra iş akışıdır: blok → ünite → satış. */}
          {canCreateBlock && (
            <Link href={formHref(BLOCK_FORM_HREF)} className="btn btn--secondary btn--md">
              + Blok Ekle
            </Link>
          )}
          {canCreateUnit && (
            <Link href={formHref(UNIT_FORM_HREF)} className="btn btn--secondary btn--md">
              + Ünite Ekle
            </Link>
          )}
          {/* 25 · satış formu (spec K1) */}
          {canCreateSale && (
            <Link href={formHref(NEW_SALE_HREF)} className="btn btn--primary btn--md">
              + Satış Kaydı
            </Link>
          )}
        </div>
      </div>

      {/* Devre dışı düğmenin gerekçesi `title`da görünmez kalır — metne de basılır. */}
      <p className="satis__notice" data-testid="satis-fiyat-listesi-notu">
        “Fiyat Listesi” ekranı henüz tasarlanmadı; ünite liste fiyatları proje
        ünite kartlarından yönetilir.
      </p>

      {projectsErrorNotice !== undefined && (
        <p className="satis__notice" data-testid="satis-proje-hatasi">
          {projectsErrorNotice}
        </p>
      )}

      {/* 54-60 */}
      <SalesKpiStrip summary={summaryQuery.data} />

      {/* 62-140 */}
      <BlockOccupancyMap blocks={unitsQuery.data?.blocks} notice={unitsNotice} />

      {/* 142-215 */}
      <SalesTable
        rows={salesQuery.data?.items}
        serverTotals={salesQuery.data?.totals}
        statusFilter={statusFilter}
        onStatusFilterChange={(next) => pushParam(STATUS_PARAM, next)}
        isLoading={salesQuery.isLoading}
        isError={salesQuery.isError}
        projectId={selectedProjectId || undefined}
        errorMessage={
          salesQuery.isError
            ? backendErrorMessage(salesQuery.error, "Satış listesi yüklenemedi.")
            : undefined
        }
        hasSelectedProject={selectedProjectId !== ""}
      />

      {/* 217-234 */}
      <UpcomingCollectionsCard
        items={summaryQuery.data?.upcoming_collections}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        projectId={selectedProjectId || undefined}
        errorMessage={
          summaryQuery.isError
            ? backendErrorMessage(summaryQuery.error, "Yaklaşan tahsilatlar yüklenemedi.")
            : undefined
        }
      />
    </div>
  );
}
