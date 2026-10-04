"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { currentPeriod } from "@/components/timesheet/month";
import { useTimesheetData } from "@/components/timesheet/useTimesheetData";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSectionStock, SECTION_STOCK_LIST_MAX_LIMIT } from "@/lib/api/hooks/useSectionStock";
import { useSiteDiaryEntries, SITE_DIARY_LIST_MAX_LIMIT } from "@/lib/api/hooks/useSiteDiary";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { listTruncationMessage } from "@/lib/list-truncation";
import { formatPeriod } from "@/lib/format";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SITES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { groupSectionWorkers } from "./section-workers";
import { SectionBoqCard } from "./SectionBoqCard";
import { SectionDiaryPanel } from "./SectionDiaryPanel";
import { SectionPaymentsPanel } from "./SectionPaymentsPanel";
import { SectionStockPanel } from "./SectionStockPanel";
import { SectionStockSummaryList } from "./SectionStockSummaryList";
import { SectionTimesheetPanel } from "./SectionTimesheetPanel";
import { SectionWorkersList } from "./SectionWorkersList";
import { SECTION_TABS, SectionDetailTabs, sectionTabIndexOf } from "./SectionDetailTabs";
import { SectionHeroCard } from "./SectionHeroCard";
import "./section-detail.css";
import { SECTION_TAB_PARAM, routes, type SiteStockParams, type SiteTimesheetParams } from "@/lib/routes";

// Sekme şeridi ve `SECTION_TABS` tanımı `SectionDetailTabs.tsx`tedir (F-BOLLINK
// ayırması — bekçi testinin hook mock'u olmadan render edebilmesi için).
// İçerikler onaylı spec §3 kararı gereği HEPSİ pending kartıdır (BOQ-bölüm bağı
// kalıcı karar 1 gereği kapalı) — mockup'taki poz tablosu SAHTE VERİYLE basılmaz.

// D218 / D256 — alt satır kartlarının "→" bağlantıları. Bölüm seviyesinde rota
// yok; ikisi de ŞANTİYE seviyesindeki GERÇEK ekrana gider (her iki rota da
// yazılı: `SiteDetailTabs` `written: true`).
//
// 🔴 `carriesSection` ÖLÇÜLDÜ, varsayılmadı (F-BOLLINK):
//   - `puantaj` → `SiteTimesheetView` `searchParams.get("section")` OKUR
//     (`SiteTimesheetView.tsx`, `sectionParam`) → bölüm süzgeci taşınır.
//   - `stok` → `SiteStockView` HİÇ `useSearchParams` kullanmaz → parametre
//     eklemek ÖLÜ query yazmak olurdu, EKLENMEZ.
// Görünür gerekçe (`title`) bağlantının kendi tanımından TÜRETİLİR — eski
// "Bu bölüm yakında" metni BAYATTI: rotalar yazılmışken "yakında" diyordu.
//
// URL-1: `slug` YERİNE hedefin `routes` ÜRETİCİSİ taşınır — yol artık burada
// elle birleştirilmez. `carriesSection` kararı OLDUĞU GİBİ korunur; tek fark,
// süzgeci taşımayan bağlantının üreticisinin `?section=`i yapısal olarak
// ÜRETEMEYECEK olmasıdır (`routes.projects.sites.stock` böyle bir alan almaz).
const SIDE_LINKS = {
  timesheet: {
    route: (p: SiteTimesheetParams) => routes.projects.sites.timesheet(p),
    label: "Puantaj →",
    carriesSection: true,
    title: "Şantiye puantajını bu bölümün süzgeciyle açar",
  },
  // 🔴 STOK-BOLUM — `carriesSection: false` KORUNUR ama GEREKÇESİ DEĞİŞTİ.
  //
  // Eski gerekçe ÖLÇÜMDÜ ve BAYATLADI: *"`SiteStockView` HİÇ `useSearchParams`
  // kullanmaz → parametre eklemek ÖLÜ query yazmak olurdu"*. Ekran artık
  // `?section=` OKUYOR (backend `?section_id=` süzgeci açıldı).
  //
  // Bağlantı yine de süzgeci TAŞIMAZ ve sebebi ETİKETİN KENDİSİDİR: bu kartın
  // bağlantısı **"Tümü →"**dür — kullanıcıya şantiyenin TAMAMINI vaat eder.
  // Süzgeci sessizce eklemek etiketle çelişirdi. Bölüm süzgeçli hedef "Malzeme"
  // SEKMESİNİN kendi bağlantısındadır (`SectionStockPanel.siteStockHref`), ve
  // orada etiket de o cümleyi kurar.
  stock: {
    route: (p: SiteStockParams) => routes.projects.sites.stock(p),
    label: "Tümü →",
    carriesSection: false,
    title: "Şantiye genelindeki stok ekranını açar (bölüm süzgeci UYGULANMAZ)",
  },
} as const;

// Bölüm Detay ekranı (F-P6 T2, mockup Bölüm Detay.dc.html). Hero + sekmeler +
// iki alt kart — hepsi tek container'da orkestre edilir (`site-detail` desenin
// aksine burada tüm içerik pending olduğu için ayrı bir "boş durum" dalı yok).
export function SectionDetailView() {
  // 🔴 URL-3 — UC rota parametresi de "slug VEYA UUID"dur (ADRES anahtarlari).
  const {
    projectId: projectKey,
    siteId: siteKey,
    sectionId: sectionKey,
  } = useParams<{
    projectId: string;
    siteId: string;
    sectionId: string;
  }>();
  // Kapsam IKI BASAMAKLI: `sections.slug` santiye icinde, `sites.slug` proje
  // icinde tekildir. Belirsizlikte backend fail-closed 404 verir.
  const sectionQuery = useSection(sectionKey, { site: siteKey, project: projectKey });
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. Asagidaki ALTI cagrinin hepsi
  // (`useBoq`, `useTimesheetData`, `useSectionStock`, `useSiteDiaryEntries`,
  // `useSiteSubcontractorPayments`) UUID bekler.
  const sectionId = sectionQuery.data?.id ?? "";
  const siteId = siteQuery.data?.id ?? "";
  const projectId = siteQuery.data?.project.id ?? "";
  // BOQ-SEC-F: bölüm süzgeçli BOQ. Hook koşullu ÇAĞRILAMAZ, bu yüzden sekme
  // seçili olmasa da bağlanır; `enabled` kapısı `siteId`dedir. Süzgeç sorgu
  // ANAHTARINDADIR — şantiye BOQ ekranının önbelleğini EZMEZ.
  const sectionBoq = useBoq(siteId, sectionId);
  // F-BLMPUAN — bölüm süzgeçli puantaj. TEK çağrı: sekme paneli ve alt kart
  // AYNI türev kümesini paylaşır (ikinci bir ağ isteği/türev turu oluşmaz).
  //
  // 🔴 K2 KORUNUR: `useTimesheetData` `section_id`yi AĞA GÖNDERMEZ, süzgeci
  // yalnız GÖRÜNÜME uygular. Sunucu süzgeci (üçüncü argüman) BİLEREK
  // KULLANILMADI — o yol satır kümesini de süzer ve bu ekranı "Puantaj →"
  // bağlantısının açtığı `?section=` görünümünden FARKLI kılardı; ayrıca
  // `derive.ts`in tüm türevleri (adam-gün, `4+`, `3G`) yeniden yazılırdı.
  // Önbellek de şantiye ekranıyla PAYLAŞILIR (aynı `queryKey`).
  //
  // Dönem: ay gezinmesi YOKTUR (mockup bu sekme için hiçbir denetim çizmez) —
  // içinde bulunulan ay, `SiteTimesheetView` ile AYNI kaynaktan (`month.ts`).
  // İkinci bir varsayılan yazılmaz.
  const period = currentPeriod();
  const timesheet = useTimesheetData({ siteId, period, sectionId });
  // F-BLMSEK — bölüm süzgeçli günlük kayıt. Hook koşullu ÇAĞRILAMAZ (yukarıdaki
  // BOQ notunun aynısı), bu yüzden sekme seçili olmasa da bağlanır.
  //
  // 🔴 DET-1.1 — süzgeç ARTIK SUNUCUDA (`?section_id=`, Kural A: başlığı bu
  // bölüm ∪ bu bölüme miktar satırı yazılmış gün). Eski istemci süzgeci
  // (`section-diary.ts`) KALKTI: yalnız başlığa bakıyordu ve satır kolunu
  // SESSİZCE düşürürdü. `sectionId` boşken ("" — bölüm henüz çözülmedi) hook
  // ağa ÇIKMAZ; süzgeçsiz tam liste bölüm listesi gibi basılmaz.
  // 🔴 STOK-BOLUM — bölümün malzeme kırılımı. Hook koşullu ÇAĞRILAMAZ (kardeş
  // notların aynısı), bu yüzden sekme seçili olmasa da bağlanır: alt kart
  // ("Bölüm Malzeme Durumu") sekme seçili OLMADAN da bu veriyi basar, yani TEK
  // çağrı iki yüzeyi birden besler (ikinci bir ağ isteği oluşmaz).
  //
  // Sayfalama tavanı AÇIKÇA gönderilir: sunucu varsayılanı 50'dir ve 51.
  // (malzeme, poz) çiftini SESSİZCE düşürürdü (TB3/F-TH kırpılma dersi).
  const sectionStock = useSectionStock(sectionId, { limit: SECTION_STOCK_LIST_MAX_LIMIT });
  const diaryEntries = useSiteDiaryEntries(siteId, { limit: SITE_DIARY_LIST_MAX_LIMIT, sectionId });
  // F-BLMSEK T2 — bölüm süzgeçli TAŞERON hakedişi. Hook koşullu ÇAĞRILAMAZ
  // (yukarıdaki BOQ notunun aynısı), bu yüzden sekme seçili olmasa da bağlanır.
  //
  // 🔴 Bölüm parametresi YOK ve EKLENMEZ: liste ucu `section_id` KABUL ETMEZ
  // (ölçüldü — `project_id`/`site_id`/`period_*`/`status`/`q`/`limit`/`offset`).
  // Süzgeç yalnız GÖRÜNÜME uygulanır (`section-payments.ts`); imza değişmediği
  // için önbellek şantiye "Hakedişler" ekranıyla PAYLAŞILIR, ikinci istek yok.
  const subcontractorPayments = useSiteSubcontractorPayments(projectId, siteId);
  // İzin: ekran `sites:view`, "Düzenle" butonu `sites:full` (task-2-brief §İzin).
  const { canView, canWrite: moduleCanWrite } = useModulePermission("sites");
  // IZN-F2.x · bölüm düzenle = santiye.bolumler/bolum.detay Düzenler (VEYA).
  const canWrite = useButtonGate({ pages: SITES_EDIT, need: "edit", fallback: moduleCanWrite });
  // DET-1.2 · S4 — açık sekme URL'dedir (`?sekme=`): günlük kayıt detayının
  // kırıntısı/geri tuşu "Günlük Kayıt"a DÖNER. Tek kaynak URL; yerel kopya yok.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = sectionTabIndexOf(searchParams.get(SECTION_TAB_PARAM));

  /** `replace` — sekme geçişi geçmişi ŞİŞİRMEZ; varsayılan sekme parametreyi siler. */
  function selectTab(index: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (index === 0) params.delete(SECTION_TAB_PARAM);
    else params.set(SECTION_TAB_PARAM, SECTION_TABS[index].siteSlug);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  if (!canView || isForbidden(sectionQuery.error) || isForbidden(siteQuery.error)) {
    return <AccessDenied />;
  }
  if (sectionQuery.isError) {
    return <p className="section-detail__message">Bölüm yüklenemedi</p>;
  }
  if (sectionQuery.isLoading || !sectionQuery.data) {
    return <p className="section-detail__message">Yükleniyor…</p>;
  }

  /** Alt kart bağlantısının hedefi; süzgeci OKUYAN ekranda `?section=` taşınır. */
  function sideLinkHref(link: (typeof SIDE_LINKS)[keyof typeof SIDE_LINKS]): string {
    // 🔴 YOL/SORGU KURALI TEK IFADEDE: yol segmentleri ADRES anahtarlarini
    // tasir (okunur kalir), `?section=` ise KANONIK UUID'yi — cunku hedef
    // ekran onu `section_id` olarak UUID bekleyen uca BESLER.
    return link.route({
      projectId: projectKey,
      siteId: siteKey,
      section: link.carriesSection ? sectionId : undefined,
    });
  }

  const section = sectionQuery.data;
  const siteName = siteQuery.data?.name ?? "";
  const activeTabDef = SECTION_TABS[activeTab];
  const periodLabel = formatPeriod(period.year, period.month);
  // D219-246 — gruplama SUNUM kararıdır (bkz. `section-workers.ts`).
  const workerGroups = groupSectionWorkers(timesheet.view.rows);
  const workerIsReal =
    section.worker_count.available &&
    section.worker_count.count !== null &&
    section.worker_count.count !== undefined;

  /**
   * CANLI sekmelerin gövde dağıtımı. `siteSlug` üzerinden AYRIK dallar —
   * F-BLMSEK'te üçüncü canlı sekme gelince iç içe üçlü koşul okunamaz hâle
   * gelirdi. Dalların BASTIĞI DOM değişmedi (iki sekmenin görsel tabanı var):
   * eski `<>…</>` parçası da DOM üretmiyordu.
   */
  function livePanel() {
    switch (activeTabDef.siteSlug) {
      case "puantaj":
        return (
          <SectionTimesheetPanel
            sectionName={section.name}
            periodLabel={periodLabel}
            view={timesheet.view}
            isLoading={timesheet.isLoading}
            isError={timesheet.isError}
          />
        );
      case "gunluk-kayit":
        return (
          <SectionDiaryPanel
            sectionId={sectionId}
            sectionName={section.name}
            sections={siteQuery.data?.sections ?? []}
            items={diaryEntries.data?.items ?? []}
            total={diaryEntries.data?.total}
            isLoading={diaryEntries.isLoading}
            isError={diaryEntries.isError}
            diaryHref={routes.projects.sites.diary({ projectId: projectKey, siteId: siteKey })}
            // DET-1.2 — satır detay sayfasına gider; yol ADRES anahtarlarıyla.
            entryHref={(entryId) =>
              routes.projects.sites.sections.diaryEntry({
                projectId: projectKey,
                siteId: siteKey,
                sectionId: sectionKey,
                entryId,
              })
            }
          />
        );
      case "hakedisler":
        return (
          <SectionPaymentsPanel
            sectionId={sectionId}
            sectionName={section.name}
            items={subcontractorPayments.items}
            projectWideItems={subcontractorPayments.projectWideItems}
            isLoading={subcontractorPayments.isLoading}
            isError={subcontractorPayments.isError}
            isPartial={subcontractorPayments.isPartial}
            truncation={subcontractorPayments.truncation}
            paymentsHref={routes.projects.sites.progressPayments({
              projectId: projectKey,
              siteId: siteKey,
            })}
          />
        );
      case "stok":
        // 🔴 STOK-BOLUM — ARTIK PENDING DEĞİL. Beş sekmenin BEŞİ de gerçek veri
        // basıyor; bu, `SECTION_TABS`taki son `contentPending` alanının da
        // kalkması demektir (bkz. `SectionDetailTabs.tsx`).
        //
        // Bağlantı BURADA süzgeci TAŞIR (alt karttaki "Tümü →"nün aksine):
        // sekmenin cümlesi zaten "bu bölümün malzemesi"dir, dolayısıyla
        // `?section=` etiketle ÇELİŞMEZ, onu TAMAMLAR.
        return (
          <SectionStockPanel
            sectionName={section.name}
            siteStockHref={routes.projects.sites.stock({
              projectId: projectKey,
              siteId: siteKey,
              // `?section=` KANONIK UUID — hedef ekran onu `section_id` olarak
              // UUID bekleyen `GET /sites/{id}/stock` ucuna gecirir.
              section: sectionId,
            })}
            rows={sectionStock.data?.items}
            kpis={sectionStock.data?.kpis}
            total={sectionStock.data?.total}
            isLoading={sectionStock.isLoading}
            isError={sectionStock.isError}
          />
        );
      default:
        // "is-kalemleri". Yükleme/hata dalları AYRI basılır: `data` yokken boş
        // tabloya düşmek kullanıcıya "bu bölüme kalem atanmadı" YALANINI
        // söylerdi. Başka şantiyenin bölümü backend'de 404'tür.
        if (sectionBoq.isError) {
          return <p className="section-detail__message">İş kalemleri yüklenemedi</p>;
        }
        if (sectionBoq.isLoading || !sectionBoq.data) {
          return <p className="section-detail__message">Yükleniyor…</p>;
        }
        return (
          <SectionBoqCard
            groups={sectionBoq.data.groups}
            totals={sectionBoq.data.totals}
            sectionName={section.name}
          />
        );
    }
  }

  return (
    <div className="section-detail">
      <SectionHeroCard
        section={section}
        siteName={siteName}
        projectKey={projectKey}
        siteKey={siteKey}
        sectionKey={sectionKey}
        projectId={projectId}
        canEdit={canWrite}
      />

      <SectionDetailTabs
        projectKey={projectKey}
        siteKey={siteKey}
        activeIndex={activeTab}
        onSelect={selectTab}
      />

      {/* 🔴 STOK-BOLUM — BEŞ sekmenin BEŞİ de gerçek veri basıyor (eski not
          DÜŞMEZ: `livePanel()` dispatch'i BEŞ sekmenin BEŞİNİ de kapsar
          (dördü gerçek veri, "stok" `SectionStockPanel` ile kendi spesifik
          gerekçesini basar). Eski `activeTabDef.contentLive` dalı jenerik
          şablonun TEK tüketicisiydi — o tüketici kalmadığı için ayrım silindi
          (BOQ-SEC-F / `section_boq` emsali: okuyanı kalmayan kod SİLİNİR). */}
      <div className="section-panel" role="tabpanel">
        <div className="section-panel__body section-panel__body--flush">{livePanel()}</div>
      </div>

      <div className="section-detail__bottom-row">
        {/* D215-250: "Bu Bölümdeki İşçiler" — sahte satırlar basılmaz, başlıktaki
            sayı yalnız GERÇEK olduğunda basılır (worker_count bu dilimde
            yer tutucu — sahte "(48)" YAZILMAZ). */}
        <div className="section-side-card">
          <div className="section-side-card__head">
            <span>Bu Bölümdeki İşçiler{workerIsReal ? ` (${section.worker_count.count})` : ""}</span>
            {/* D218: "Puantaj →" — YAZILMIŞ rotaya gider ve bölüm süzgecini TAŞIR. */}
            <Link
              href={sideLinkHref(SIDE_LINKS.timesheet)}
              title={SIDE_LINKS.timesheet.title}
              className="section-side-card__link"
            >
              {SIDE_LINKS.timesheet.label}
            </Link>
          </div>
          {/* D219-246 — GERÇEK gruplanmış satırlar. Yer tutucu kart SİLİNDİ:
              bağ artık AÇIK, "henüz görüntülenemiyor" canlıyı yalanlardı. */}
          <SectionWorkersList
            groups={workerGroups}
            isLoading={timesheet.isLoading}
            isError={timesheet.isError}
            periodLabel={periodLabel}
          />
          {/* kalan-4 #280: `isPersonnelUnavailable`/`personnelTruncation`
              HİÇ tüketilmiyordu — kartoteks okunamazsa ya da sunucu
              tavanında kırpılırsa kart sessizce eksik satır basardı.
              Kardeş ekranın (`TimesheetNotices`) dersinin aynısı. */}
          {(timesheet.isPersonnelUnavailable || timesheet.personnelTruncation.isTruncated) && (
            <p
              className="section-detail__message"
              data-testid="section-workers-personnel-notice"
            >
              {timesheet.isPersonnelUnavailable
                ? "Personel kartoteksi okunamadı — yalnız bu ayda kaydı olan personel listeleniyor, yeni satır açılamaz."
                : listTruncationMessage(timesheet.personnelTruncation)}
            </p>
          )}
        </div>

        {/* D253-272: "Bölüm Malzeme Durumu" */}
        <div className="section-side-card">
          <div className="section-side-card__head">
            <span>Bölüm Malzeme Durumu</span>
            {/* D256: "Tümü →" — YAZILMIŞ stok rotasına gider; bölüm süzgeci
                hedef ekranda OKUNMADIĞI için query EKLENMEZ (ölü parametre). */}
            <Link
              href={sideLinkHref(SIDE_LINKS.stock)}
              title={SIDE_LINKS.stock.title}
              className="section-side-card__link"
            >
              {SIDE_LINKS.stock.label}
            </Link>
          </div>
          {/* 🔴 D253-272 — YER TUTUCU SİLİNDİ. Eski hâli `CardEmptyState` +
              `pendingModule="section_stock"` idi ve gerekçesi bir ÖLÇÜMDÜ
              ("`inventory/` içinde `section_id` SIFIR isabet"); ölçüm backend
              `186ffe9` ile BAYATLADI. Bağ AÇIK olduğu hâlde "henüz
              görüntülenemiyor" basmak CANLIYI YALANLARDI ("Bu Bölümdeki
              İşçiler" kartının aynı gerekçeyle silinmiş yer tutucusu emsaldir).
              Veri "Malzeme" sekmesiyle AYNI çağrıdan gelir — ikinci istek yok. */}
          <SectionStockSummaryList
            rows={sectionStock.data?.items}
            isLoading={sectionStock.isLoading}
            isError={sectionStock.isError}
          />
        </div>
      </div>
    </div>
  );
}
