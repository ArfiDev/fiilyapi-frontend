"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import type { ProjectType } from "@/lib/api/hooks/useProjects";
import { employerContractTabHref } from "../contracts/employer-contract-tabs";
import { routes } from "@/lib/routes";
import type { PageKey } from "@/lib/api/models";
import { useProjectPageVisibility } from "@/lib/auth/usePagePermission";

/**
 * URL-3 · Sekme şeridinin İKİ ayrı proje anahtarına ihtiyacı vardır ve bunları
 * birbirine karıştırmak SESSİZ iki kusur üretir:
 *
 *  · `projectKey` — YOL segmentine giren okunur anahtar (`slug ?? id`).
 *    🔴 Aktif sekme `activePath === href` ile TAM DİZE karşılaştırmasıdır:
 *    href slug'la, adres çubuğu UUID'yle kurulursa hiçbir sekme aktif
 *    görünmez. Bu yüzden burada ADRESTEKİ anahtar taşınır, kaydın slug'ı değil.
 *  · `projectId` — kanonik UUID. Üç sekme (İşveren/Taşeron Hakediş, Belgeler)
 *    ve İş Kalemleri hedefi SORGU parametresi kurar (`?project_id=`, `?proje=`)
 *    ve o değer UUID bekleyen uçlara BESLENİR. Oraya slug verilseydi hedef
 *    ekran boş liste ya da 422 gösterirdi (`routes.ts` YOL/SORGU kuralı).
 */
export interface ProjectTabKeys {
  /** Adres çubuğundaki anahtar — yol segmentleri ve aktif sekme eşleşmesi. */
  projectKey: string;
  /** Kanonik UUID — sorgu parametresi kuran sekmeler. */
  projectId: string;
}

export interface ProjectDetailTabsProps extends ProjectTabKeys {
  /** Aktif yol dışarıdan verilir; bileşen routing hook'u çağırmaz. */
  activePath: string;
  /**
   * 🔴 F-PKK K1 — İKİ SEKME PROJE TÜRÜNE GÖRE KOŞULLUDUR.
   *
   * Ayrımı yapan alan ÖLÇÜLDÜ: `ProjectDetailResponse.project_type`
   * (`ProjectType = "taahhut" | "kendi_yatirim" | "kat_karsiligi"`).
   * `contracting`/`investment`/`land_share` kartlarının hangisinin dolu
   * geldiği YALNIZ BİR İPUCUDUR ve ayrım için KULLANILMAZ: üçü de
   * `… | null`dır, yani boş bir `land_share` kartı taşıyan kat karşılığı
   * projesi sekmeleri sessizce kaybederdi.
   */
  projectType: ProjectType;
}

interface TabDef {
  label: string;
  /**
   * IZN-F3.2 · Sekmenin sayfa-izni anahtarı. Proje rolünde (ya da ana rolde) bu anahtarın grant'ı
   * "none" ise sekme GİZLENİR; grant yoksa görünür (IZN-F1 menü kuralı).
   */
  pageKey: PageKey;
  /**
   * Bu sekmenin GÖRÜNDÜĞÜ proje türleri. Tanımsızsa sekme HER türde görünür
   * (bugünkü beş sekmenin hepsi böyledir) — yani alan eklemek mevcut
   * davranışı değiştirmez.
   */
  types?: readonly ProjectType[];
  /**
   * Sekmenin GERÇEK hedef yolu. Hedef ekran proje kimliğini ya yol
   * segmentinde ya da query param olarak okur; param adları hedef ekranın
   * BUGÜN okuduğu adlardır (uydurma yok).
   *
   * 🔴 F-PRJKALEM · ZORUNLUDUR. Eskiden isteğe bağlıydı: hedefi olmayan
   * sekme `written: false` ile devre-dışı `<span>` basılıyor ve altına
   * görünür bir gerekçe notu konuyordu. Bugün ŞERİTTEKİ BEŞ SEKMENİN
   * BEŞİNİN DE hedefi var, yani o mekanizmanın hiç çağıranı kalmadı ve
   * bekçisiz ölü kod hâline gelirdi (kayıtlı kanon: "çağıran kod yoksa
   * bekçisiz kalır") — bu yüzden mekanizma SİLİNDİ. Rotası olmayan bir
   * mockup öğesi ileride yine çıkarsa kural değişmedi (F-TH kanonu:
   * silinmez, devre-dışı + görünür gerekçeyle basılır); mekanizma o gün
   * geri yazılır ve o gün BEKÇİSİ de olur.
   */
  hrefFor: (keys: ProjectTabKeys) => string;
  /**
   * İsteğe bağlı açıklama (`title`). Mockup'ta olmayan GÖRÜNÜR metin
   * eklenmez; `title` ise zaten kullanılan bir mekanizmadır
   * (`SectionDetailView` `SIDE_LINKS[].title` emsali).
   */
  title?: string;
}

/**
 * 🔴 F-PRJKALEM · AYNI EKRANDA AYNI ETİKET İKİ FARKLI KÜMEYE GİDİYOR.
 * Sekme şeridindeki "İş Kalemleri" SÖZLEŞME POZUNA, şantiye kartındaki
 * "📋 İş Kalemleri" çipi ŞANTİYE BOQ'una gider. Mockup'ta ayrımı anlatan
 * görünür bir metin YOK ve mockup sadakati gereği icat da EDİLMEZ; ayrım
 * `title` ile verilir. Anlatan taraf YENİ GELEN taraftır (sekme) — çip
 * bilinen ve dokunulmayan davranıştır.
 *
 * Çıplak glif yasağı: tipografik sembol yok, düz sözcük + normal tire.
 */
export const WORK_ITEMS_TAB_TITLE =
  "Sözleşme pozları - proje sözleşmesinin iş kalemleri";

// Sekmeler (spec §4.1, §7.3) — adlar ve SIRA mockup'tan gelir
// (`Proje Detay - Şantiyeler.dc.html:87-91`), değiştirilmez.
//
// "Şantiyeler" bu ekranın kendisidir (kök rota).
//
// 🔴 "İş Kalemleri" — F-PRJKALEM · PROJE SEVİYESİNDE VARDIR VE DOLUDUR.
// Eski gerekçe ("iş kalemleri şantiye bazında tutulur") YARIM DOĞRUYDU:
// doğru olan kısmı ŞANTİYE BOQ'udur (`GET /sites/{id}/boq`) ve gerçekten
// şantiye kapsamlıdır — proje düzeyinde "tüm şantiyelerin BOQ'u" diye bir
// kavram YOK. Ama proje düzeyinde AYRI ve FARKLI bir küme var: SÖZLEŞME
// POZLARI (`GET /projects/{project_id}/contract/items`,
// `EmployerContractItemsResponse`). Ekranı da YAZILI: E14'ün "İş Kalemleri"
// sekmesi (`EmployerContractDetailView`, `tab === "items"`). Sekme hedefi
// olmadığı için değil, hedefi BAĞLANMADIĞI için kapalıydı.
//
// ⚠️ Bu yüzden `SiteCard`taki "📋 İş Kalemleri" çipiyle çelişki YOKTUR:
// çip ŞANTİYE BOQ'una, sekme SÖZLEŞME POZUNA gider — iki farklı küme.
//
// "İşveren Hakediş" P7 dilimiyle geldi (`/hakedisler`); proje kimliği
// `project_id` query paramı ile taşınır.
//
// "Taşeron Hakediş" TH + F-TH dilimleriyle geldi (`/hakedisler/taseron`);
// `subcontractor-filters.ts` `project_id` paramını okur.
//
// "Belgeler" BC + F-BC dilimleriyle geldi (`/belgeler`); `ArchiveDocumentsView`
// proje süzgecini `proje` paramından okur (PROJECT_PARAM).
/**
 * F-PKK · İki yeni ekranın rota kurucuları. Sekme şeridi DIŞINDA da okunurlar
 * (sayfaların kendi `activePath` karşılaştırması) — dize iki yerde
 * yazılsaydı aktif sekme sessizce hiç işaretlenmezdi.
 */
export const projectSummaryHref = (projectId: string) =>
  routes.projects.summary({ projectId });
export const projectAllocationHref = (projectId: string) =>
  routes.projects.sharing({ projectId });

const TABS: TabDef[] = [
  {
    label: "Şantiyeler",
    pageKey: "proje.santiyeler",
    // YOL sekmesi — adresteki anahtar taşınır (aktif sekme eşleşmesi).
    hrefFor: ({ projectKey }) => routes.projects.detail({ projectId: projectKey }),
  },
  // 🔴 F-PKK K1 · "Proje Özeti" — İKİ mockup, TEK rota. Ekran proje türüne
  // göre KY (`Proje - Kendi Yatırım`) ya da KK (`Proje - Kat Karşılığı`)
  // düzenini basar. Taahhütte YOKTUR: o türün özeti bu ekranın kendisidir
  // (`Proje Detay - Şantiyeler`) ve maliyet ucunun kâr bloğu taahhütte
  // ünite/satış taşımaz (`_profit`: `realized_sales`/`remaining_stock_value`
  // taahhütte `None`).
  {
    label: "Proje Özeti",
    pageKey: "proje.ozet",
    types: ["kendi_yatirim", "kat_karsiligi"],
    hrefFor: ({ projectKey }) => projectSummaryHref(projectKey),
  },
  // 🔴 F-PKK K1 · "Paylaşım Tablosu" (`Kat Karşılığı - Paylaşım`) YALNIZ kat
  // karşılığında. Öteki türlerde `GET /projects/{id}/land-share/summary`
  // 404 döner (şema notu: boş özet DEĞİL) — sekme basılsaydı kullanıcı her
  // seferinde açıklanamayan bir boş ekrana giderdi.
  {
    label: "Paylaşım Tablosu",
    pageKey: "proje.paylasim_tablosu",
    types: ["kat_karsiligi"],
    hrefFor: ({ projectKey }) => projectAllocationHref(projectKey),
  },
  // 🔴 F-PRJKALEM · href ELLE YAZILMAZ: kanonik kurucu `employerContractTabHref`
  // kullanılır. Dize burada da yazılsaydı, sözleşme sekmelerinin param adı ya da
  // kanonik-kısa-URL kuralı değiştiğinde bu sekme sessizce ayrışırdı — aynı
  // gerekçeyle `projectSummaryHref`/`projectAllocationHref` de tek yerde durur.
  {
    label: "İş Kalemleri",
    pageKey: "proje.is_kalemleri",
    // SORGU kuran hedef — kanonik UUID (bkz. `ProjectTabKeys`).
    hrefFor: ({ projectId }) => employerContractTabHref(projectId, "items"),
    title: WORK_ITEMS_TAB_TITLE,
  },
  {
    label: "İşveren Hakediş",
    pageKey: "proje.isveren_hakedis",
    hrefFor: ({ projectId }) => routes.progressPayments.list({ projectId }),
  },
  {
    label: "Taşeron Hakediş",
    pageKey: "proje.taseron_hakedis",
    hrefFor: ({ projectId }) => routes.progressPayments.subcontractor.list({ projectId }),
  },
  {
    label: "Belgeler",
    pageKey: "proje.belgeler",
    hrefFor: ({ projectId }) => routes.documents({ projectId }),
  },
];

export function ProjectDetailTabs({
  projectKey,
  projectId,
  activePath,
  projectType,
}: ProjectDetailTabsProps) {
  const isPageVisible = useProjectPageVisibility(projectId);
  const visibleTabs = TABS.filter(
    (tab) => (!tab.types || tab.types.includes(projectType)) && isPageVisible(tab.pageKey),
  );

  // 🔴 Final inceleme F-4 (a11y) — `ProgressPaymentsTabs`in kanonu burada da
  // uygulanır: `role="tablist"`/`role="tab"`/`aria-selected` KALDIRILDI. Bu
  // roller ekran okuyucuya "burada ok tuşlarıyla dolaşılan, aynı sayfada
  // panel değiştiren bir sekme grubu var" der; oysa burada gerçek `tabpanel`
  // YOKTUR ve her sekme SAYFA DEĞİŞTİREN bir `<Link>`tir. Doğru semantik:
  // gezinme bölgesi (`<nav>`) + aktif linkte `aria-current="page"`. Görsel
  // sunum DEĞİŞMEZ (sınıf adları aynı kalır).
  return (
    <nav className="project-hero__tabs" aria-label="Proje detay sekmeleri">
      {visibleTabs.map((tab) => {
        const href = tab.hrefFor({ projectKey, projectId });
        // ⚠️ `activePath` `usePathname()`ten gelir ve QUERY TAŞIMAZ; query
        // içeren href'ler (Belgeler, İşveren/Taşeron Hakediş ve artık İş
        // Kalemleri) burada hiç eşleşmez. Bu MEVCUT ve KABUL EDİLMİŞ desendir:
        // o sekmelerin hedef ekranları bu şeridi hiç basmaz (E14 kendi
        // `EmployerContractTabs`ini basar), yani yanlış sekmenin aktif
        // görünme riski YOKTUR.
        const active = activePath === href;
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            title={tab.title}
            className={cx("project-hero__tab", active && "project-hero__tab--active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
