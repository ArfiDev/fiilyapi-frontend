"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import type { PageKey } from "@/lib/api/models";
import { useProjectPageVisibility } from "@/lib/auth/usePagePermission";

export interface SiteDetailTabsProps {
  /**
   * 🔴 URL-3 · ADRESTEKI anahtarlar (slug VEYA UUID) — kanonik UUID DEGIL.
   *
   * Bu serit YALNIZ YOL kurar ve aktif sekmeyi `activePath === href` TAM DIZE
   * karsilastirmasiyla bulur. Kanonik UUID gecirilseydi, slug'li bir adreste
   * href'ler UUID'ye kurulur, HICBIR sekme aktif gorunmez ve bir tikta
   * kullanicinin okunur adresi UUID'ye geri duserdi. Kusur 422 vermez,
   * yalnizca GOZLE gorulur — bu yuzden ad `...Key`tir, `...Id` degil.
   */
  projectKey: string;
  siteKey: string;
  /** Aktif yol dışarıdan verilir; bileşen routing hook'u çağırmaz. */
  activePath: string;
}

interface TabDef {
  label: string;
  /** IZN-F3.2 · Sekmenin sayfa-izni anahtarı (proje rolünde "none" → gizli; grant yok → görünür). */
  pageKey: PageKey;
  slug: string | null;
  /** Rotasi yazildi mi — yazilmamis sekmeler "Bu bölüm yakında" ipucu tasir. */
  written?: boolean;
}

// Sekmeler (spec §5.3, §7.3). Yedisinin de gercek rotasi vardir; hicbiri
// catch-all ComingSoon'a dusmez (`written` bayragi bunu tasir).
//
// 🔴 DRILL-KALDIR (2026-08-29): bu serit artik santiye gezinmesinin TEK
// KAYNAGIDIR. Eskiden ayni yedi madde `project-nav-config.ts`teki drill
// kenar cubugunda da duruyordu ve iki liste "ayrismamali" diye elle
// hizalaniyordu; cubuk kaldirilinca o ikinci kopya silindi. Yani buradaki
// SIRA ve KAPSAM artik baska bir dosyaya karsi degil, dogrudan mockup'a
// karsi olculur.
//
// "İş Kalemleri" Ekran 13 spec §2.2 ile eklendi — Şantiye Detay mockup'inda bu
// sekme YOKTUR, onayli sapma B'dir (§13); Bölümler'den hemen sonra durur.
// "Hakedişler" P7 T6 (`Şantiye - Hakedişler.dc.html`), "Günlük Kayıt" F-SD T2
// (`Şantiye - Günlük Kayıt.dc.html`), "Puantaj" F-PT T2
// (`Şantiye - Puantaj.dc.html`), "Belgeler" F-BC T2
// (`Şantiye - Belgeler.dc.html`), "Stok" F-ST T3 (`Şantiye - Stok.dc.html`)
// ile yazildi.
const TABS: TabDef[] = [
  { label: "Bölümler", pageKey: "santiye.bolumler", slug: null, written: true },
  { label: "İş Kalemleri", pageKey: "santiye.is_kalemleri", slug: "is-kalemleri", written: true },
  { label: "Puantaj", pageKey: "santiye.puantaj", slug: "puantaj", written: true },
  { label: "Stok", pageKey: "santiye.stok", slug: "stok", written: true },
  { label: "Hakedişler", pageKey: "santiye.hakedisler", slug: "hakedisler", written: true },
  { label: "Günlük Kayıt", pageKey: "santiye.gunluk_kayit", slug: "gunluk-kayit", written: true },
  { label: "Belgeler", pageKey: "santiye.belgeler", slug: "belgeler", written: true },
];

export function SiteDetailTabs({ projectKey, siteKey, activePath }: SiteDetailTabsProps) {
  const base = routes.projects.sites.detail({ projectId: projectKey, siteId: siteKey });
  // Adres anahtarı slug olabilir; kimlik çözümü önbellekten yapılır (`useProjectScopeId`), yeni istek YOK.
  const isPageVisible = useProjectPageVisibility(projectKey);

  return (
    <div className="site-detail-tabs" role="tablist" aria-label="Şantiye detay sekmeleri">
      {TABS.filter((tab) => isPageVisible(tab.pageKey)).map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = activePath === href;
        return (
          <Link
            key={tab.label}
            href={href}
            role="tab"
            aria-selected={active}
            title={tab.written ? undefined : "Bu bölüm yakında"}
            className={cx("site-detail-tabs__tab", active && "site-detail-tabs__tab--active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
