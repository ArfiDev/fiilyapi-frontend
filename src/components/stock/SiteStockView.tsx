"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { Button } from "@/components/ui";
import { useSiteStock } from "@/lib/api/hooks/useSiteStock";
import { useSite } from "@/lib/api/hooks/useSites";
import { STOCK_LIST_MAX_LIMIT } from "@/lib/api/hooks/useStockItems";
import { resolutionAwareError } from "@/lib/api/route-key-resolution";
import { stockErrorMessage } from "@/lib/api/stock-error";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { cx } from "@/lib/cx";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { SiteStockKpiStrip } from "./SiteStockKpiStrip";
import { SiteStockTable } from "./SiteStockTable";
import { routes } from "@/lib/routes";
import {
  siteStockEntryHref,
  SITE_STOCK_NEED_PENDING_REASON,
  SITE_STOCK_SECTION_FILTER_NOTICE,
  SITE_STOCK_DETAIL_PENDING_REASON,
  SITE_STOCK_ORDER_PENDING_REASON,
} from "./stock-labels";
import "@/components/site-detail/site-detail.css";
import "./stock.css";

/**
 * Şantiye › Stok sekmesi — mockup `Şantiye - Stok.dc.html` (ŞS, kanonik).
 * Yorumlardaki sayılar o dosyanın SATIR numaralarıdır.
 *
 * Rota `.../santiyeler/[siteId]/stok`; sekme artık catch-all ComingSoon'a
 * DÜŞMEZ. Sayfa KENDİ LAYOUT'UNU KURMAZ — drill sidebar
 * `[projectId]/layout.tsx`ten gelir (F-PT/F-SD/F-BC deseni); mockup'ın kendi
 * üst barı ve sol menüsü (14-64) BASILMAZ, kabuk canon kazanır.
 *
 * ⚠️ VERİ: tek kaynak `GET /sites/{site_id}/stock`. `balance` YALNIZ bu
 * şantiyenin depolarını kapsar; merkez depo (site_id NULL) hiçbir şantiyenin
 * bakiyesine girmez. Durum/bakiye/KPI sunucu türevidir — ekran hiçbir eşik
 * ya da toplam HESAPLAMAZ (spec §3).
 */
export function SiteStockView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  const permission = useModulePermission("inventory");

  // Başlık için — drill kabuğu aynı anahtarı zaten çektiğinden ikinci bir ağ
  // isteği oluşmaz (React Query önbelleği; `belgeler`/`puantaj` deseni).
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. Slug'i kabul eden TEK santiye ucu
  // yukaridakidir; asagidaki uclarin HEPSI UUID bekler. Santiye yaniti hem
  // kendi `id`sini hem PROJESININ `id`sini tasir, yani ikinci bir istek YOK.
  // Cozulene kadar bos string gider ve hook'lar kendi `enabled` kapilarinda durur.
  const siteId = siteQuery.data?.id ?? "";

  // Kırpılma korkuluğu (TB3/F-TH dersi): sunucu varsayılanı 50'dir ve 51.
  // malzemeyi SESSİZCE düşürürdü — tavan AÇIKÇA gönderilir.
  // 🔴 STOK-BOLUM — bölüm süzgeci URL'DEN okunur (`?section=`), yerel state'ten
  // DEĞİL: bağlantı Bölüm Detayı › "Malzeme" sekmesinden gelir ve paylaşılabilir
  // olmalıdır (`SiteTimesheetView` `?section=` emsali — AYNI query adı).
  //
  // ⚠️ Bu SUNUCU süzgecidir (puantajın istemci süzgecinin aksine): satır
  // kümesini sunucu daraltır. Bakiye DEĞİŞMEZ — bkz. bandın metni.
  const sectionParam = searchParams.get("section")?.trim() || null;
  const stockQuery = useSiteStock(siteId, {
    limit: STOCK_LIST_MAX_LIMIT,
    ...(sectionParam ? { sectionId: sectionParam } : {}),
  });

  if (!permission.canView || isForbidden(stockQuery.error)) return <AccessDenied />;

  const site = siteQuery.data;
  const rows = stockQuery.data?.items;
  const kpis = stockQuery.data?.kpis;
  const truncation = buildListTruncation(rows?.length ?? 0, stockQuery.data?.total);
  // IDOR kanonu (ST §4b): görünmeyen şantiye 404 alır ve kullanıcıya Türkçe,
  // GÖRÜNÜR bir cümle basılır — sessiz boş tablo YOK.
  // 🔴 URL-3 — COZUMLEME HATASI DA BURADAN KONUSUR. Bilinmeyen bir santiye
  // anahtarinda `siteQuery` 404 alir, `siteId` bos kalir ve `useSiteStock`
  // KENDI bos-id kapisinda durur; yani `stockQuery.isError` FALSE olur.
  // Yalniz alt sorguya bakan eski ifade o an HICBIR SEY basmiyordu ve
  // kullanici bos bir tablo goruyordu (ST §4b: sessiz bos tablo YOK).
  const loadError = resolutionAwareError(siteQuery, stockQuery, stockErrorMessage);

  return (
    <div className="stok stok--santiye">
      {/* 66-73 — sekme şeridi tek kaynaktan (`SiteDetailTabs`) */}
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />

      {/* 75-82 */}
      <div className="stok__head">
        <div>
          {/* 76 — şantiye adı yüklenene kadar UYDURULMAZ */}
          <h1 className="stok__title stok__title--santiye">
            {site ? `${site.name} — Stok Durumu` : "Stok Durumu"}
          </h1>
          {/* 76 alt satırı — "Güneşkent Konut · Şantiye Bazlı" */}
          <p className="stok__subtitle">
            {site ? `${site.project.name} · ` : ""}Şantiye Bazlı
          </p>
        </div>
        <div className="stok__actions">
          {/* 78 — spec §5 S5: SATINALMA dilimine pending, düğme SİLİNMEZ */}
          <Button variant="secondary" disabled title={SITE_STOCK_ORDER_PENDING_REASON}>
            Satınalma Talebi →
          </Button>
          {/* 79 — T4 formuna gider; şantiye bağlamı ROTADAN taşınır */}
          <Link
            // YOL baglantisi ADRESTEKI anahtarlarla kurulur (URL-3).
            href={siteStockEntryHref(projectKey, siteKey)}
            className={cx("btn", "btn--primary", "btn--md")}
            data-testid="santiye-stok-giris-link"
          >
            + Stok Girişi
          </Link>
        </div>
      </div>

      {/* Devre dışı yüzeylerin gerekçesi `title`da görünmez kalır — metne de
          basılır (WORKFLOW §3: zarif düşüş sessiz olamaz). */}
      {/* 🔴 STOK-BOLUM — BANT BÖLÜNDÜ. Eski cümle "Aylık İhtiyaç VE Bölüm
          sütunlarının veri kaynağı henüz yok" diyordu; "Bölüm" artık GERÇEK
          (`stock_entry_lines.section_id`) ve o cümle canlıyı yalanlardı.
          Yer tutucu KALAN tek sütun "Aylık İhtiyaç"tır. */}
      <p
        className="stok__notice stok__notice--muted"
        data-testid="santiye-stok-pending-notice"
      >
        “Aylık İhtiyaç” sütununun veri kaynağı henüz yok; değer uydurulmaz, “—”
        gösterilir ({SITE_STOCK_NEED_PENDING_REASON}). “Bölüm” sütunu stok
        hareketlerinde atfedilmiş bölümleri basar; atıf yoksa boş kalır. Satır
        sonundaki sipariş düğmeleri devre dışıdır (
        {SITE_STOCK_ORDER_PENDING_REASON}); {SITE_STOCK_DETAIL_PENDING_REASON}.
      </p>

      {sectionParam !== null && (
        // Süzgeç GÖRÜNÜR olmak ZORUNDADIR: sessizce daraltılmış bir liste,
        // kullanıcıya şantiyede daha az malzeme olduğu YALANINI söylerdi.
        // Metin süzgecin DAR anlamını da yazar (bakiye şantiye bakiyesidir).
        <p className="stok__notice" data-testid="santiye-stok-section-filter">
          {SITE_STOCK_SECTION_FILTER_NOTICE}{" "}
          <Link
            className="stok__notice-link"
            href={routes.projects.sites.stock({ projectId: projectKey, siteId: siteKey })}
            data-testid="santiye-stok-section-filter-clear"
          >
            Süzgeci kaldır
          </Link>
        </p>
      )}

      {loadError && (
        <p className="stok__notice" data-testid="santiye-stok-error">
          {loadError}
        </p>
      )}

      {truncation.isTruncated && (
        <p className="stok__notice" data-testid="santiye-stok-truncation-notice">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {kpis !== undefined && kpis.items_without_price > 0 && (
        <p className="stok__notice" data-testid="santiye-stok-price-notice">
          {kpis.items_without_price} kalemin birim fiyatı yok — bu kalemler “Stok
          Değeri” hesabına GİRMEDİ.
        </p>
      )}

      {/* 85-91 */}
      <SiteStockKpiStrip kpis={kpis} />

      {/* 94-163 */}
      <SiteStockTable
        rows={rows}
        isLoading={stockQuery.isLoading}
        isError={stockQuery.isError}
      />
    </div>
  );
}
