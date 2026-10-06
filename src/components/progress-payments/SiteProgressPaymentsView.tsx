"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { useProgressPayments, useProgressPaymentSummary } from "@/lib/api/hooks/useProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import {
  useSiteSubcontractorPayments,
  type UseSiteSubcontractorPaymentsResult,
} from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { listTruncationMessage } from "@/lib/list-truncation";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { ProgressPaymentsListBody } from "./ProgressPaymentsList";
import { ProgressPaymentsTotalsStrip } from "./ProgressPaymentsTotalsStrip";
import { SiteSubcontractorPaymentsPanel } from "./SiteSubcontractorPaymentsPanel";
import { computeProgressPaymentsTotals } from "./totals";
import { computeGrossMargin } from "./shared/margin";
import { computeSiteSubcontractorTotals } from "./shared/site-subcontractor-totals";
import "./progress-payments.css";
import "./site-progress-payments.css";
import { routes } from "@/lib/routes";

// F-SZLEKR T2: düğme etiketi ve boş-durum ipucu AYNI sabitten okunur (bkz.
// `ProgressPaymentsView.tsx` üstündeki not). Bu ekranın etiketi ("+ Hakediş
// Oluştur") `ProgressPaymentsView`inkinden ("+ Yeni Hakediş") KASITLI OLARAK
// FARKLI — bu ayrı bir tutarsızlık, bu dilimin kapsamı DIŞINDA (rapora not
// düşüldü), etiketler burada BİRLEŞTİRİLMEDİ.
const NEW_PAYMENT_LABEL = "+ Hakediş Oluştur";

// Şantiye "Hakedişler" sekmesi (P7 T6 iskeleti + F-TH T5 taşeron sütunu).
// Mockup `Şantiye - Hakedişler.dc.html`. Kalıcı mimari karar (brief §Kalıcı
// mimari karar, kullanıcı kararı S4): hakediş SÖZLEŞME (proje) düzeyinde tek
// kayıttır, şantiye kırılımı satırdadır. Bu sekme `/hakedisler` ile AYNI
// kaydın başka görünümüdür — işveren tarafında şantiyeye göre süzülmüş sahte
// bir liste üretilmez, proje-düzeyi liste aynen basılır.
//
// KPI şeridi (satır 81-86, `ProgressPaymentsTotalsStrip.tsx`, T2 ile
// PAYLAŞILIR): "4 hakediş · %75" alt metni proje bağlamı bu ekranda
// BİLİNDİĞİNDEN `useProgressPaymentSummary(projectId)` ile TAM basılır.
//
// F-TH T5/TB2 — taşeron tarafı GERÇEK veriyle dolduruldu:
//   - `useSiteSubcontractorPayments` U2'ye (`GET /subcontractor-progress-
//     payments`) `site_id` filtresiyle çıkar — süzme SUNUCUDA yapılır.
//     🔴 HAK-NULL: "proje geneli sözleşmeler HARİÇ TUTULUR" kararı ÇÜRÜTÜLDÜ
//     ve geri alındı (canlıda sözleşmelerin HEPSİ proje geneliydi, ekran bu
//     yüzden boştu). Uç artık KAPSAYAN kümeyi döndürür; hook onu ikiye ayırır
//     (`items` = şantiye kapsamlı, `projectWideItems` = proje geneli) ve
//     TOPLAMLAR yalnız `items`ten alınır.
//   - "Toplam Taşeron Ödemesi" + "Brüt Kar Marjı" KPI'ları artık GERÇEK
//     (`computeSiteSubcontractorTotals` + `computeGrossMargin`, S2 kararı:
//     marj = (işveren−taşeron)/işveren). "Onay Bekleyen" iki tarafı toplar.
//   - Hakediş listesi sunucu tavanında kırpılırsa (`isPartial`) toplam/marj
//     sessizce basılmaz — görünür hata bandı + pending gösterilir.
//   - Sağ sütun (`SiteSubcontractorPaymentsPanel`) satır tıklanabilir,
//     `/hakedisler/taseron/[paymentId]`e gider; "Tümü →" `/hakedisler/taseron`e.
//
// BASILMAYAN (mockup'ta var, bu dilimde veri yok — brief §pending-modules):
//   - Satır içi "%62 ilerleme" (satır 98, işveren) — liste şemasında yok.
//   - PDF / dışa aktarma — backend'de uç yok.
/**
 * Görünür bant metni — İKİ ayrı neden (uç hatası / sunucu tavanı) AYRI
 * cümlelerle basılır; kullanıcı hangi sayının neden eksik olduğunu görür
 * (final inceleme F-3). TB2 takip: üçüncü kanal ("kısmi sözleşme hatası" —
 * N+1 fan-out'un bir kısmı hata verirse) N+1 kaldırılınca ANLAMSIZLAŞTI ve
 * silindi; `isPartial` artık YALNIZ `truncation.isTruncated`e eşit.
 */
function subcontractorBandMessage(state: UseSiteSubcontractorPaymentsResult): string {
  if (state.isError) {
    return "Taşeron hakedişleri yüklenemedi — taşeron toplamı ve kâr marjı gösterilemiyor.";
  }
  return `${listTruncationMessage(state.truncation)} Taşeron toplamı ve kâr marjı bu yüzden gösterilmiyor.`;
}

export function SiteProgressPaymentsView() {
  const pathname = usePathname();
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();
  // Breadcrumb için — drill kabuğu aynı anahtarı zaten çektiğinden ikinci
  // bir ağ isteği oluşmaz (React Query önbelleği; `is-kalemleri` deseni).
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. Slug'i kabul eden TEK santiye ucu
  // yukaridakidir; asagidaki uclarin HEPSI UUID bekler. Santiye yaniti hem
  // kendi `id`sini hem PROJESININ `id`sini tasir, yani ikinci bir istek YOK.
  // Cozulene kadar bos string gider ve hook'lar kendi `enabled` kapilarinda durur.
  const siteId = siteQuery.data?.id ?? "";
  const projectId = siteQuery.data?.project.id ?? "";

  // Proje-düzeyi liste (S4 kararı) — `site_id` filtresi KULLANILMAZ.
  const paymentsQuery = useProgressPayments({ project_id: projectId });
  // KPI alt metni için — özet sorgusu hata verirse/yüklenmemişse SAYFA
  // KIRILMAZ, yalnız alt metin yüzdesiz kalır (T3 "özet hata verirse KPI
  // basılmaz" deseninin aynısı: `isSuccess` kontrolü, `isForbidden` sayfa
  // düzeyinde KULLANILMAZ — özet 403 dönse bile liste görünür kalmalı).
  const summaryQuery = useProgressPaymentSummary(projectId);
  const subcontractorPayments = useSiteSubcontractorPayments(projectId, siteId);
  const { canWrite: moduleCanWrite } = useModulePermission("progress_payments");
  // IZN-F2.x · hakediş oluştur/düzenle = işveren hakediş ailesi Düzenler (IZN-F5b, HI).
  const canWrite = useButtonGate({ pages: EMPLOYER_PAYMENT_EDIT, need: "edit", fallback: moduleCanWrite, projectId: projectKey });

  if (isForbidden(paymentsQuery.error) || isForbidden(siteQuery.error)) return <AccessDenied />;

  const site = siteQuery.data;
  const summary = summaryQuery.isSuccess
    ? { paymentCount: summaryQuery.data.payment_count, progressPct: summaryQuery.data.progress_pct }
    : undefined;

  const employerTotals = computeProgressPaymentsTotals(paymentsQuery.data?.items ?? []);
  const subcontractorTotals = computeSiteSubcontractorTotals(subcontractorPayments.items);
  const isSubcontractorDataComplete =
    !subcontractorPayments.isLoading && !subcontractorPayments.isError && !subcontractorPayments.isPartial;
  const marginPct = computeGrossMargin(
    employerTotals.grossTotal,
    subcontractorTotals.grossTotal,
    isSubcontractorDataComplete,
  );
  const hasSubcontractorError = subcontractorPayments.isError || subcontractorPayments.isPartial;

  return (
    <div className="pp spp">
      {/* Kayıt 303 — sekme şeridi TEK kaynaktan (`SiteDetailTabs`); bu ekran
          kardeş görünümlerin (Stok/Puantaj/Belgeler/Günlük) hepsinin bastığı
          şeridi hiç basmıyordu. */}
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />
      {site && (
        <p className="spp__crumb">
          <Link
            className="spp__crumb-link"
            href={routes.projects.sites.detail({ projectId: projectKey, siteId: siteKey })}
          >
            ← {site.name}
          </Link>
          {` · ${site.project.name} / ${site.name}`}
        </p>
      )}

      <div className="spp__title-bar">
        <div>
          <h1 className="spp__title">{site ? `${site.name} — Hakedişler` : "Hakedişler"}</h1>
          <p className="spp__subtitle">İşveren &amp; Taşeron hakedişleri</p>
        </div>
        {canWrite && (
          <Link href={routes.progressPayments.new({ projectId })} className="pp__new-btn">
            {NEW_PAYMENT_LABEL}
          </Link>
        )}
      </div>

      <ProgressPaymentsTotalsStrip
        items={paymentsQuery.data?.items}
        summary={summary}
        subcontractor={{
          isLoading: subcontractorPayments.isLoading,
          isPartial: hasSubcontractorError,
          grossTotal: subcontractorTotals.grossTotal,
          distinctSubcontractorCount: subcontractorTotals.distinctSubcontractorCount,
          pendingApprovalCount: subcontractorTotals.pendingApprovalCount,
          marginPct,
          isMasked: employerTotals.grossTotal === null || subcontractorTotals.grossTotal === null,
        }}
      />

      {/* Kısmi veri görünürlüğü (brief §Yükleme/hata görünürlüğü + final
          inceleme F-3): taşeron sözleşme detaylarının bir kısmı yüklenemediyse
          YA DA hakediş listesi sunucu tavanında kırpıldıysa toplam/marj
          sessizce eksik basılmaz — bant görünür kalır, KPI'lar pending'e
          düşer (`isPartial` tek karar kanalı). */}
      {hasSubcontractorError && (
        <p className="spp__error-band" data-testid="spp-subcontractor-band">
          {subcontractorBandMessage(subcontractorPayments)}
        </p>
      )}

      <div className="spp__columns">
        <section className="spp__panel spp__panel--employer">
          <div className="spp__panel-head">
            <span className="spp__panel-title">İşveren Hakedişleri</span>
            <Link href={routes.progressPayments.list()} className="spp__panel-link">
              Tümü →
            </Link>
          </div>
          {/* Final inceleme #5: proje adı burada breadcrumb'ta zaten görünür —
              liste satırında tekrar basılmaz (`/hakedisler`de kalır, orada
              proje-genel liste birden fazla projeyi aynı anda gösterir). */}
          <ProgressPaymentsListBody
            isError={paymentsQuery.isError}
            isLoading={paymentsQuery.isLoading}
            data={paymentsQuery.data}
            showProjectName={false}
            newActionLabel={canWrite ? NEW_PAYMENT_LABEL : null}
          />
        </section>

        {/* HAK-NULL: proje geneli hakedişler AYRI kümede geçirilir — panelde
            görünürler, KPI şeridindeki `subcontractorTotals` ise YALNIZ
            `items`ten (şantiye kapsamlı) hesaplanır. Aynı para projenin her
            şantiyesinde tekrar döndüğü için toplanamaz. */}
        <SiteSubcontractorPaymentsPanel
          items={subcontractorPayments.items}
          projectWideItems={subcontractorPayments.projectWideItems}
          isLoading={subcontractorPayments.isLoading}
          isError={subcontractorPayments.isError}
        />
      </div>
    </div>
  );
}
