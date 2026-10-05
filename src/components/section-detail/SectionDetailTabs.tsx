"use client";
import { routes, type SectionTabKey } from "@/lib/routes";
import type { PageKey } from "@/lib/api/models";
import { useProjectPageVisibility } from "@/lib/auth/usePagePermission";

/**
 * Bölüm detayı sekme şeridi (D99-105).
 *
 * 🔴 KABUL EDİLMİŞ SAPMA: bölüm seviyesinde ROTA YOKTUR (task-2-brief §Rota:
 * drill sidebar'a bölüm eklenmez). Bu yüzden `SiteDetailTabs`/`ProjectDetailTabs`
 * gibi `Link` tabanlı değil, `<button>` ile geçiş yapar. DET-1.2 · S4: seçim
 * artık YEREL state değil `?sekme=` URL parametresidir (sahibi
 * `SectionDetailView`; şerit yalnız `activeIndex`/`onSelect` alır).
 * Şerit bu dosyaya AYRILDI (F-BOLLINK) ki bekçi testi onu hook mock'u olmadan
 * render edebilsin — F-PRJTAB kanonu: *koruma, yüzeyin araca KAYDEDİLMESİDİR.*
 *
 * 🔑 İKİ AYRI GERÇEK KARIŞTIRILMAZ (F-BOLLINK ölçümü, 2026-08-17):
 *   - "modül YAZILMADI" → hiçbir rotası yok, kullanıcı hiçbir yerde göremez.
 *   - "modül YAZILDI ama BÖLÜM kapsamlı içerik bağlanmadı" → şantiye
 *     seviyesinde ekran VAR, yalnız bu bölüme kırılmıyor.
 * BEŞ sekmenin BEŞİ de ikinci durumdadır (DÖRDÜNDE bölüm bağı bu arada AÇILDI): `is-kalemleri`, `puantaj`, `stok`,
 * `hakedisler`, `gunluk-kayit` rotalarının hepsi yazılı (ölçüldü). Eski
 * `pendingModule: "boq" | "timesheet" | …` alanı kullanıcıya "modül yok"
 * diyordu — YANLIŞ bilgiydi; yerine `contentPending` (bölüm bağı yok) geçti.
 *
 * `siteSlug` + `moduleWritten` bekçinin çapasıdır: `tab-strip-routes.test.tsx`
 * iddiayı dosya sistemindeki gerçek rota ağacıyla karşılaştırır ve İKİ YÖNDE de
 * kırmızıya döner — `moduleWritten: false` denip rota YAZILIRSA da (kusurun
 * kendisi buydu), `true` denip rota silinir/yeniden adlandırılırsa da.
 */

export interface SectionTabDef {
  readonly label: string;
  /** IZN-F3.2 · Sekmenin sayfa-izni anahtarı (proje rolünde "none" → gizli; grant yok → görünür). */
  readonly pageKey: PageKey;
  /**
   * Bu sekmenin içeriğini taşıyan/taşıyacak ŞANTİYE seviyesi rota dilimi
   * (`/projeler/{p}/santiyeler/{s}/<slug>`). HER ZAMAN doludur — `moduleWritten`
   * ile birlikte bekçinin İKİ YÖNLÜ çapasını kurar.
   */
  readonly siteSlug: SectionTabKey;
  /**
   * İDDİA: o rota bugün YAZILI mı? Bekçi bunu dosya sistemindeki gerçek rota
   * ağacıyla karşılaştırır — `false` iddia edilip rota yazılırsa da, `true`
   * iddia edilip rota silinirse de test KIRMIZI olur.
   */
  readonly moduleWritten: boolean;
}

/**
 * BOQ-SEC-F — sekmenin İÇERİK hâli, AYRIK BİRLİK olarak.
 *
 * `tab-strip-routes` bekçisi bugüne kadar iki hâl tanıyordu: (a) bir rotaya
 * çözülen `href`li sekme, (b) `contentPending` gerekçesiyle devre dışı sekme.
 * Bölüm şeridi YEREL state ile geçiş yapar (rota yok) ve İş Kalemleri sekmesi
 * artık GERÇEK içerik basıyor — ikisi de değil. İşaretlenmezse bekçi canlı bir
 * sekmeyi "gerekçesiz" sayıp kırmızı olurdu.
 *
 * Ayrık birlik BİLİNÇLİ: `contentPending: string | null` yazılsaydı, gerekçe
 * basan dal `null`ı da kabul etmek zorunda kalır ve derleyici "canlı sekmenin
 * gerekçesi yok" gerçeğini KORUYAMAZDI — ekran sessizce boş bir gerekçe basardı.
 */
export type SectionTabContent =
  /** İçerik bu ekranda GERÇEKTEN basılır. */
  | { readonly contentLive: true; readonly contentPending?: undefined }
  /** İçerik basılmaz; gerekçe `pending-modules` anahtarından gelir. */
  | { readonly contentLive?: undefined; readonly contentPending: string };

// 🔴 `moduleWritten` ÖLÇÜLDÜ (2026-08-17), varsayılmadı: beş rotanın BEŞİ de
// `src/app/(app)/projeler/[projectId]/santiyeler/[siteId]/` altında yazılıdır.
export const SECTION_TABS: readonly (SectionTabDef & SectionTabContent)[] = [
  // BOQ-SEC-F: bölüm bağı AÇILDI — `GET /sites/{id}/boq?section_id=` canlı.
  {
    label: "İş Kalemleri",
    pageKey: "bolum.is_kalemleri",
    siteSlug: "is-kalemleri",
    moduleWritten: true,
    contentLive: true,
  },
  // F-BLMPUAN: bölüm bağı AÇILDI — `TimesheetEntry.section_id` var ve matris
  // bölüm süzgeciyle görünüme uygulanıyor (K2: süzgeç istemcide).
  {
    label: "İşçiler & Puantaj",
    pageKey: "bolum.puantaj",
    siteSlug: "puantaj",
    moduleWritten: true,
    contentLive: true,
  },
  // 🔴 STOK-BOLUM (2026-08-29): bölüm bağı AÇILDI — `stock_entry_lines.
  // section_id`/`.boq_item_id` kolonları ve `GET /sections/{id}/stock` ucu
  // geldi (backend `186ffe9`). Bu, `contentPending`in bu dizideki SON
  // kullanımıydı; artık BEŞ sekmenin BEŞİ de `contentLive`dır.
  //
  // ⚠️ `SectionTabContent` ayrık birliği YİNE DE SİLİNMEZ: bekçinin
  // (`tab-strip-routes.test.tsx`) tanıdığı iki hâl korunur, aksi hâlde bir
  // sonraki pending sekme geldiğinde tip yeniden icat edilirdi.
  { label: "Malzeme",
    pageKey: "bolum.malzeme", siteSlug: "stok", moduleWritten: true, contentLive: true },
  // F-BLMSEK T2: bölüm bağı AÇILDI — `SubcontractorProgressPaymentListItem`
  // `section_id` taşır. İŞVEREN hakedişi taşımaz (ölçüldü, sıfır isabet); o
  // eksiklik sekmeyi yer tutucuda tutmak yerine panelin GÖRÜNÜR kapsam
  // satırında basılır (`section_employer_progress_payments`).
  { label: "Hakediş",
    pageKey: "bolum.hakedis", siteSlug: "hakedisler", moduleWritten: true, contentLive: true },
  // F-BLMSEK: bölüm bağı AÇILDI. DET-1.1: süzgeç SUNUCUDA (`?section_id=`,
  // Kural A — başlığı bu bölüm ∪ bu bölüme satır yazılmış gün).
  { label: "Günlük Kayıt",
    pageKey: "bolum.gunluk_kayit", siteSlug: "gunluk-kayit", moduleWritten: true, contentLive: true },
];

/**
 * DET-1.2 · S4 — `?sekme=` değerinden sekme sırası. Sekme kimliği şantiye rota
 * dilimiyle (`siteSlug`) AYNIDIR. Değer yok ya da tanınmıyorsa varsayılan
 * sekme (0 · İş Kalemleri) — uydurma değer ekranı boş bırakmaz.
 */
export function sectionTabIndexOf(value: string | null): number {
  const index = SECTION_TABS.findIndex((tab) => tab.siteSlug === value);
  return index === -1 ? 0 : index;
}

export interface SectionDetailTabsProps {
  /** ADRESTEKI anahtarlar (slug VEYA UUID) — bu serit YALNIZ YOL kurar. */
  projectKey: string;
  siteKey: string;
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function SectionDetailTabs({
  projectKey,
  siteKey,
  activeIndex,
  onSelect,
}: SectionDetailTabsProps) {
  const base = routes.projects.sites.detail({ projectId: projectKey, siteId: siteKey });
  const isPageVisible = useProjectPageVisibility(projectKey);

  return (
    <div className="section-tabs" role="tablist" aria-label="Bölüm detay sekmeleri">
      {/* Gizli sekme dizide KALIR: `index` URL (`?sekme=`) ve `activeIndex` ile paylaşılan kimliktir. */}
      {SECTION_TABS.map((tab, index) => ({ tab, index }))
        .filter(({ tab }) => isPageVisible(tab.pageKey))
        .map(({ tab, index }) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            // Bekçi çapaları (DOM'dan okunur — sabiti import etmek bileşenin
            // kendi mantığını atlardı, F-PRJTAB kanonu).
            data-content-pending={tab.contentPending ?? undefined}
            data-content-live={tab.contentLive ? "true" : undefined}
            data-module-route={`${base}/${tab.siteSlug}`}
            data-module-written={String(tab.moduleWritten)}
            className={
              activeIndex === index ? "section-tabs__tab section-tabs__tab--active" : "section-tabs__tab"
            }
            onClick={() => onSelect(index)}
          >
            {tab.label}
          </button>
        ))}
    </div>
  );
}
