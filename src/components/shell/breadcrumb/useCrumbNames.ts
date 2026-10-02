"use client";

/**
 * F-KIRINTI · dinamik segmentlerin insan-okunur adı — YALNIZ ÖNBELLEKTEN.
 *
 * ─── 🔴 K5/B3: İKİNCİ İSTEK YOK ──────────────────────────────────────────
 * Kırıntı HER ekranda basılır. Adı kendi sorgusuyla çekseydi uygulamadaki
 * her sayfa açılışına 1-3 ek istek eklerdi — üstelik sayfanın ZATEN çektiği
 * veriyi ikinci kez. Bu yüzden bu modül `useQueryCacheSnapshot` ile
 * (`src/lib/query/useQueryCacheSnapshot.ts`) abone olur: paylaşılan Query'nin
 * ANLIK durumunu okur (veri geldiğinde/değiştiğinde yeniden render eder) ama
 * HİÇBİR ZAMAN fetch etmez VE paylaşılan Query'nin `options`'ına dokunmaz.
 *
 * 🔴 SEKME-F1.5-FIX (ölçüldü) — ÖNCEKİ mekanizma (`useQuery({ queryFn:
 * skipToken })`) bu son cümleyi İHLAL EDİYORDU: react-query 5'te her
 * `useQuery` render'ı `Query#setOptions` çağırır ve paylaşılan Query'nin
 * `options`'ını TÜMÜYLE yazar (son çağıran kazanır). Bu bileşen sayfanın
 * KENDİ (gerçek queryFn'li) gözlemcisinden SONRA render olduğunda (ör.
 * `TabsRouterSync`), paylaşılan `options`'ı skipToken'a çeviriyordu.
 * `QueryProvider`'da `retry: 1` açık olduğu için sayfanın ilk denemesi
 * başarısız olunca YENİDEN DENEME bu zehirlenmiş `options`'ı okuyor, ağa hiç
 * çıkmadan `Error("Missing queryFn: ...")` fırlatıyordu — sayfa gerçek
 * `BackendError`ı (dolayısıyla 403/404 dallanmasını) hiç görmüyordu. Şimdiki
 * mekanizma `setOptions` hiç çağırmaz, bu sınıf kusur YAPISAL OLARAK yok.
 *
 * Bunun çalışmasının ön koşulu, anahtarın sayfanınkiyle BİREBİR aynı olması:
 *
 *   sayfa                                        önbellek anahtarı
 *   ────────────────────────────────────────────────────────────────────────
 *   useProject(projectKey)                       ["project", <p>]
 *   useSite(siteKey, { project: projectKey })    ["site", <s>, <p>]
 *   useSection(secKey, { site, project })        ["section", <sec>, <s>, <p>]
 *   useSiteDiaryEntry(id, { sectionId })         siteDiaryEntryQueryKey(id, <sec uuid>)
 *
 * Anahtar parçaları hook modüllerinden İTHAL EDİLİR (`PROJECT_QUERY_KEY` …),
 * elle yazılmaz: string kopyalansaydı sorgu anahtarı bir gün değiştiğinde
 * kırıntı SESSİZCE boş kalırdı (hata yok, log yok — yalnız sonsuz iskelet).
 *
 * ─── ŞANTİYE ALT AĞACINDA PROJE ADI ──────────────────────────────────────
 * 🔴 ÖLÇÜLDÜ: şantiye alt ekranlarının HİÇBİRİ `useProject` çağırmaz
 * (`/projeler/<p>/santiyeler/<s>/**` → yalnız `useSite`). Proje adı için
 * ikinci bir sorgu açmak K5'i ihlal ederdi; gerek de yok, çünkü
 * `SiteDetailResponse.project` (`SiteProjectSummary`) adı zaten TAŞIR —
 * `SiteHeroBar` proje bağlantısını da ondan kurar. Düşüş sırası bu yüzden
 * "önce proje sorgusu, yoksa şantiye yanıtının proje gövdesi"dir.
 */
import { useQueryCacheSnapshot } from "@/lib/query/useQueryCacheSnapshot";

import { OFFER_QUERY_KEY } from "@/lib/api/hooks/offer-query-keys";
import { PROJECT_QUERY_KEY, type ProjectDetail } from "@/lib/api/hooks/useProjects";
import { SECTION_QUERY_KEY, type SectionDetailResponse } from "@/lib/api/hooks/useSection";
import { siteDiaryEntryQueryKey, type SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { SITE_QUERY_KEY, type SiteDetail } from "@/lib/api/hooks/useSites";
import { formatDateDots } from "@/lib/format";

import type { CrumbNames } from "./trail";
import type { NamedEntity, RouteKeys } from "./trail-node";

/**
 * TKL-F3.3 · teklif kırıntısı yalnız numarayı okur. Anahtar sayfanın `useOffer` anahtarıyla
 * (`["offer", id]`) BİREBİR aynıdır: tek üretici `offer-query-keys.ts` (K-F3-4).
 */
interface OfferCrumbSource {
  readonly offer_no: string;
}

export function useCrumbNames(keys: RouteKeys): CrumbNames {
  const project = useQueryCacheSnapshot<ProjectDetail>([PROJECT_QUERY_KEY, keys.projectId]);
  const site = useQueryCacheSnapshot<SiteDetail>([SITE_QUERY_KEY, keys.siteId, keys.projectId]);
  const section = useQueryCacheSnapshot<SectionDetailResponse>([
    SECTION_QUERY_KEY,
    keys.sectionId,
    keys.siteId,
    keys.projectId,
  ]);

  // DET-1.2 — günlük kayıt detayı: anahtar SAYFANIN anahtarıdır (tek üretici
  // `siteDiaryEntryQueryKey`). Sayfa kaydı bölümün kanonik kimliğiyle ister;
  // o kimlik AYNI önbellekteki bölüm yanıtından okunur (bölüm okunamadıysa
  // ikisi de bölümsüz anahtara düşer).
  const diaryEntry = useQueryCacheSnapshot<SiteDiaryEntryDetail>(
    siteDiaryEntryQueryKey(keys.entityId, section?.data?.id),
  );

  // TKL-F3.3 — teklif detayı: kırıntı adı teklif numarası (sayfa zaten çeker, ikinci istek yok).
  const offer = useQueryCacheSnapshot<OfferCrumbSource>([OFFER_QUERY_KEY, keys.entityId]);

  const projectName = project?.data?.name ?? site?.data?.project.name;

  /**
   * Sorgusu HATA vermiş türler. Yedek etikete düşerler, iskelette DONMAZLAR:
   * 404/403 alan bir kaydın adı hiç gelmeyecektir (bkz. `CrumbNames.unresolved`).
   * Proje için şantiye sorgusu da bir kaynaktır, o yüzden ikisi de hata
   * vermeden proje "çözülemedi" sayılmaz.
   */
  const unresolved = new Set<NamedEntity>();
  if (projectName === undefined && (project?.status === "error" || site?.status === "error")) {
    unresolved.add("project");
  }
  if (site?.data === undefined && site?.status === "error") unresolved.add("site");
  if (section?.data === undefined && section?.status === "error") unresolved.add("section");
  if (diaryEntry?.data === undefined && diaryEntry?.status === "error") unresolved.add("diaryEntry");
  if (offer?.data === undefined && offer?.status === "error") unresolved.add("offer");

  return {
    project: projectName,
    site: site?.data?.name,
    section: section?.data?.name,
    diaryEntry: diaryEntry?.data === undefined ? undefined : formatDateDots(diaryEntry.data.entry_date),
    offer: offer?.data?.offer_no,
    unresolved,
  };
}
