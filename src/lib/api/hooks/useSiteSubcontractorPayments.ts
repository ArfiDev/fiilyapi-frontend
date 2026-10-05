import { useMemo } from "react";

import { buildListTruncation, type ListTruncation } from "@/lib/list-truncation";
import { partitionSitePayments } from "@/lib/site-payment-scope";

import {
  useSubcontractorProgressPayments,
  type SubcontractorPaymentStatus,
} from "./useSubcontractorProgressPayments";

// F-TH TB2 takip — bu hook önce (T5) `site_id` filtresini İSTEMCİ tarafında
// uyguluyordu: proje-düzeyi hakediş listesi çekilir, distinct `contract_id`
// için sözleşme detayı N+1 fan-out ile çözülür, sonra `site_id` süzülürdü.
// TB2 ile U2'ye (`GET /subcontractor-progress-payments`) `site_id` filtresi
// eklendi: süzme artık SUNUCUDA yapılır, N+1 tamamen kaldırıldı.
//
// 🔴 HAK-NULL — ESKİ KARAR ÇÜRÜTÜLDÜ VE GERİ ALINDI.
// Burada "proje geneli sözleşmelerin hakedişleri şantiye sekmesine BİLİNÇLİ
// olarak DAHİL EDİLMEZ (tek-anlamlılık)" yazıyordu ve sunucudaki eşitlik
// süzgecine dayanıyordu. Canlıda ölçüldü: projedeki taşeron sözleşmelerinin
// YEDİSİ DE proje geneliydi, dolayısıyla bu "tek-anlamlılık" kararı modülün
// PARASININ TAMAMINI gizliyordu — `?site_id=<Cevizli>` 0 satır dönüyordu,
// süzgeçsiz çağrı 3 hakediş. Şantiye ve bölüm ekranları "hakediş yok" diyordu;
// bu bir tercih değil, bir KUSURDU.
//
// Uç artık KAPSAYAN kümeyi döndürür (şantiyeye bağlı + proje geneli) ve her
// satır kapsamını `contract_site_id` ile söyler. Ayrım KAYBOLMAZ, sadece yeri
// değişti: sunucunun sessiz elemesi yerine, İSTEMCİDE GÖRÜNÜR bir ayrım.
//
// 🔴 BU HOOK'UN SÖZLEŞMESİ: `items` HÂLÂ YALNIZ ŞANTİYE KAPSAMLI satırlardır.
// Proje geneli satırlar `projectWideItems`e gider. Sebep: `items` bu depoda
// para TOPLAMLARINA besleniyor (`computeSiteSubcontractorTotals`,
// `computeDiaryAccrual`) ve proje geneli hakediş projenin HER şantiyesinde
// tekrar döner — `items`e karıştırılsaydı aynı para N şantiyede N kez sayılır,
// brüt kâr marjı bozulurdu. Yeni kümeyi AYRI bir alanda vermek, her çağıranın
// onu bilerek ele almasını ZORUNLU kılar; sessizce toplama sızmasını
// İMKÂNSIZ kılar. Ayrım `progress-payments/shared/site-payment-scope.ts`de.
//
// `workCategory` (kullanıcı kararı — KORUNUR): **TB3 ile
// `SubcontractorProgressPaymentListItem` şemasına DOĞRUDAN eklendi**
// (`work_category: string | null`), bu yüzden F-P5 T1'de yanına atılan ikinci
// istek — `useSubcontractorContractsList({ site_id })` join'i — TAMAMEN
// SÖKÜLDÜ. Değer artık `payment.work_category`'den okunur: tek istek, join
// yok, yarış durumu yok. (Eski gerekçe — "liste şemasında YOK, bu yüzden U1
// ile join edilir" — TB3'ten sonra GEÇERSİZDİR.) Alan sözleşmede boşsa
// backend zaten `null` döner; çağıran taraf zarif düşüş uygular.

/** Hook'un çağıranlara sızdırdığı TEK şekil — ham liste öğesi VE sözleşme
 * detayı tipi asla dışarı sızmaz. */
export interface SiteSubcontractorPaymentItem {
  id: string;
  contractId: string;
  subcontractorName: string;
  sequenceNo: number;
  /** Hakediş dönemi (F-SD T3): liste şemasında `period_year`/`period_month`
   * ZATEN vardır — uçta dönem filtresi olduğu hâlde bu hook filtresiz çağrılır
   * (aynı önbellek anahtarı birden çok ekranca paylaşılır), ay süzmesi
   * çağıranda yapılır. */
  periodYear: number | null;
  periodMonth: number | null;
  /** Hakediş liste şemasından DOĞRUDAN (`work_category`, TB3) — join YOK.
   * `null` olabilir (sözleşmede iş kategorisi boşsa) — çağıran taraf zarif
   * düşüş uygular. */
  workCategory: string | null;
  /** Hakedişin bağlı olduğu bölüm — yalnız KİMLİK (`section_id`), İSİM
   * DEĞİL (bölüm adını çözecek bir uç/hook bu dilimde YOK — fix round 1:
   * çağıran taraf `null` ile "gerçekten bölümsüz" (Tüm Bölümler), dolu
   * değerle "adı çözülemeyen bölüm" durumunu AYIRT ETMELİDİR; ikisi de
   * pending DEĞİLDİR — yalnız ikincisi pending gösterilir). */
  sectionId: string | null;
  /**
   * HAK-NULL · satırın KAPSAMI — sözleşmenin şantiyesi. `null` = **proje
   * geneli** (projenin tüm şantiyelerini kapsar, bu yüzden `?site_id=` ile
   * çağrılan HER şantiyede tekrar döner ve hiçbirinin toplamına girmez).
   *
   * `sectionId` ile KARIŞTIRILMAZ: eksenler bağımsızdır, bir satır ikisini
   * birden `null` taşıyabilir. `sectionId === null` "bölüme kırılmamış",
   * `contractSiteId === null` "sözleşme şantiyeye kırılmamış" demektir.
   */
  contractSiteId: string | null;
  /** `null` = rol için gizli (IZN-F4b.2, `maliyet_kar`); toplamlara 0 olarak GİRMEZ — toplam bilinmez olur. */
  grossTotal: string | null;
  netTotal: string | null;
  status: SubcontractorPaymentStatus;
  isRevisionRequired: boolean;
}

export interface UseSiteSubcontractorPaymentsResult {
  /**
   * Sözleşmesi BU şantiyeye bağlı hakedişler. 🔴 Para toplamlarının TEK meşru
   * kaynağı budur — proje geneli satırlar bilerek DIŞARIDADIR (bkz. dosya
   * başlığındaki HAK-NULL notu).
   */
  items: SiteSubcontractorPaymentItem[];
  /**
   * HAK-NULL · sözleşmesi PROJE GENELİ olan hakedişler. Şantiyeyi KAPSARLAR,
   * bu yüzden ekranda GÖSTERİLİR; ama projenin her şantiyesinde tekrar
   * döndükleri için bu şantiyenin TOPLAMINA GİRMEZLER.
   */
  projectWideItems: SiteSubcontractorPaymentItem[];
  /** Hakediş listesi yükleniyor — çağıran taraf iskelet/spinner gösterir. */
  isLoading: boolean;
  /** Hakediş liste ucunun kendisi hata verdi — `items` GÜVENİLMEZ, tümüyle atlanır. */
  isError: boolean;
  /** `items` KISMİ — hakediş listesi sunucu tavanında KIRPILDI (final
   * inceleme F-3). Çağıran taraf toplamı/marjı sessizce basmaz, görünür bant
   * gösterir (brief §Yükleme/hata görünürlüğü). */
  isPartial: boolean;
  /** Hakediş liste ucunun tavanı aşıldı mı (F-3) — bant metnini ayırt etmek
   * için; `isTruncated` zaten `isPartial`ın içindedir. */
  truncation: ListTruncation;
}

// F-3 · liste ucunun ŞEMA TAVANI. Daha büyük bir değer gönderilirse backend
// 422 döner — bu yüzden "hepsini çek" mümkün DEĞİLDİR, kırpılma görünür
// kılınır.
export const SUBCONTRACTOR_PAYMENT_LIST_MAX_LIMIT = 200;

export function useSiteSubcontractorPayments(
  projectId: string,
  siteId: string,
): UseSiteSubcontractorPaymentsResult {
  const paymentsQuery = useSubcontractorProgressPayments({
    project_id: projectId,
    site_id: siteId,
    limit: SUBCONTRACTOR_PAYMENT_LIST_MAX_LIMIT,
  });
  const payments = useMemo(() => paymentsQuery.data?.items ?? [], [paymentsQuery.data]);
  // F-3: tavan aşıldıysa elde EKSİK liste var — bu şantiyenin taşeron toplamı
  // ve ondan türeyen brüt kâr marjı YANLIŞ olurdu, o yüzden `isPartial`e
  // beslenir (para değerleri pending'e düşer, bant görünür).
  const truncation = buildListTruncation(payments.length, paymentsQuery.data?.total);

  const items = useMemo<SiteSubcontractorPaymentItem[]>(() => {
    return payments.map((payment) => ({
      id: payment.id,
      contractId: payment.contract_id,
      subcontractorName: payment.subcontractor_name ?? "—",
      sequenceNo: payment.sequence_no,
      periodYear: payment.period_year,
      periodMonth: payment.period_month,
      // TB3: liste öğesinin KENDİ alanı — join yok.
      workCategory: payment.work_category,
      sectionId: payment.section_id,
      contractSiteId: payment.contract_site_id,
      grossTotal: payment.gross_total,
      netTotal: payment.net_total,
      status: payment.status,
      isRevisionRequired: payment.is_revision_required,
    }));
  }, [payments]);

  // 🔴 Kapsam ayrımı: `items` YALNIZ şantiye kapsamlı kalır (toplamlar ona
  // bakar), proje geneli satırlar AYRI alana gider.
  const scope = useMemo(() => partitionSitePayments(items), [items]);

  return {
    items: scope.siteScoped as SiteSubcontractorPaymentItem[],
    projectWideItems: scope.projectWide as SiteSubcontractorPaymentItem[],
    isLoading: paymentsQuery.isLoading,
    isError: paymentsQuery.isError,
    isPartial: truncation.isTruncated,
    truncation,
  };
}
