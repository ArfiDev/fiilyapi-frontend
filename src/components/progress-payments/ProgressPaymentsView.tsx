"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { parseEmployerFilters } from "./employer-filters";
import { ProgressPaymentsFilters } from "./ProgressPaymentsFilters";
import { ProgressPaymentsListBody } from "./ProgressPaymentsList";
import { ProgressPaymentsTotalsStrip } from "./ProgressPaymentsTotalsStrip";
import { ProgressPaymentsTabs } from "./shared/ProgressPaymentsTabs";
import "./progress-payments.css";
import { routes } from "@/lib/routes";

// F-SZLEKR T2: düğme etiketi ve boş-durum ipucu AYNI sabitten okunur — ikisi
// ayrı yerlerde elle tutarlı tutulursa (önceki durum) biri değişince öteki
// unutulur (tam olarak bu oldu: ipucu "+ Yeni Hakediş"te kalırken bu ekranın
// düğmesi yerinde kaldı ama şantiye sekmesininki "+ Hakediş Oluştur" oldu).
const NEW_PAYMENT_LABEL = "+ Yeni Hakediş";

// Ekran 14 · Hakedişler (P7 T2) — proje-genel İŞVEREN hakediş listesi.
// Mockup `Şantiye - Hakedişler.dc.html`ın İŞVEREN HAKEDİŞLERİ yarısından
// (satır 90-113) alınır: kart-içi satır listesi, sol başlık+açıklama, sağ
// tutar+rozet. Taşeron yarısı bu ekranda YOK — taşeron hakediş modülü henüz
// yok. KPI şeridi (satır 81-86) coordinator review T6 fix ile EKLENDİ; karma
// basılır — bkz. `ProgressPaymentsTotalsStrip.tsx`. Satır gövdesi T6'nın
// şantiye sekmesiyle PAYLAŞILIR (`ProgressPaymentsList.tsx`) — kopyalanmaz.
//
// Round 2 (coordinator review): "N hakediş · %P" alt metninin (satır 82)
// yüzde kısmı `useProgressPaymentSummary(project_id)`den gelir — bu ekranda
// TEK bir proje YOK (liste proje-genel), o yüzden özet sorgusu BURADA HİÇ
// ÇAĞRILMAZ; `summary` prop'u verilmez, şerit yalnız `items.length` sayısını
// basar, yüzdeyi hiç basmaz (bkz. `ProgressPaymentsTotalsStrip.tsx`).
//
// F-TH T2 (§S3 kullanıcı kararı): bu sayfa artık "İşveren | Taşeron" sekmeli
// kardeşin İşveren yarısı — `ProgressPaymentsTabs` (paylaşılan, kopyasız)
// başlığın ÜSTÜNE eklendi, aşağıdaki içerik DEĞİŞMEDİ.
//
// F-PRJTAB T3: proje detayının "İşveren Hakediş" sekmesi bu ekrana
// `?project_id=<id>` ile gelir. Süzgeç URL'de yaşar (bileşen state'inde
// değil) — kardeş ekran `/hakedisler/taseron` ile aynı parametre adı ve aynı
// desen. Parametre yoksa liste süzgeçsiz (tüm projeler) koşar.
export function ProgressPaymentsView() {
  const searchParams = useSearchParams();
  const filters = parseEmployerFilters(searchParams);
  const paymentsQuery = useProgressPayments({
    project_id: filters.projectId ?? undefined,
  });
  // Yazma yüzeyi kapısı (spec §2.5): "Yeni Hakediş" yalnız `draft` ve üstü
  // seviyede görünür. Yetki zorlaması HER ZAMAN backend'dedir.
  // IZN-F2.x · hakediş oluştur/düzenle = işveren hakediş ailesi Düzenler (IZN-F5b, HI).
  const canWrite = useButtonGate({
    pages: EMPLOYER_PAYMENT_EDIT,
    need: "edit",
    projectId: filters.projectId,
  });

  if (isForbidden(paymentsQuery.error)) return <AccessDenied />;

  return (
    <div className="pp">
      <ProgressPaymentsTabs active="employer" />
      <div className="pp__title-row">
        <h1 className="pp__title">Hakedişler</h1>
        {canWrite && (
          <Link href={routes.progressPayments.new()} className="pp__new-btn">
            {NEW_PAYMENT_LABEL}
          </Link>
        )}
      </div>

      <ProgressPaymentsFilters />

      <ProgressPaymentsTotalsStrip items={paymentsQuery.data?.items} />

      <ProgressPaymentsListBody
        isError={paymentsQuery.isError}
        isLoading={paymentsQuery.isLoading}
        data={paymentsQuery.data}
        emptyScope={filters.projectId !== null ? "filtered" : "all"}
        newActionLabel={canWrite ? NEW_PAYMENT_LABEL : null}
      />
    </div>
  );
}
