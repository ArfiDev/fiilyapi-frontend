import Link from "next/link";

import { routes } from "@/lib/routes";

/** F-TH kanonu: rotası olmayan mockup öğesi silinmez, gerekçeyle devre-dışı basılır (ÜS-F3-3). */
const SOON_TITLE = "Yakında · bu sekme sonraki sürümde açılacak";

interface OfferTabsProps {
  /** "Teklifler N" — süzgeçsiz toplam; süzgeç açıkken `null` (sayaç basılmaz). */
  offerCount: number | null;
  /** "Poz Kütüphanesi N" — İş Kalemi Kataloğu kalem sayısı (T9); yüklenmeden `null`. */
  catalogCount: number | null;
  /** Detay: "Teklifler" sekmesi listeye bağlantı olur (TD:77-79). Verilmezse liste ekranındaki etkin düğme. */
  listHref?: string;
  /** Etkin sekme (TKL-F4.5): Şablonlar ekranında "templates" — "Teklifler" bağlantıya döner (`listHref` ŞART). */
  active?: "offers" | "templates";
  /** "Teklif Şablonları N" — şablon sayısı; bilinmiyorsa (`null`/verilmedi) sayaç basılmaz. */
  templateCount?: number | null;
}

/** TL:78-81, 246 · TD:77-82 — Liste ve Detay'ın ortak sekme şeridi. */
export function OfferTabs({ offerCount, catalogCount, listHref, active = "offers", templateCount }: OfferTabsProps) {
  const offersCount = offerCount !== null && <span className="offers-tab__count">{offerCount}</span>;
  return (
    <div className="offers-tabs" role="group" aria-label="Teklif sekmeleri">
      {listHref === undefined ? (
        <button type="button" className="offers-tab offers-tab--active" aria-current="page">
          Teklifler
          {offersCount}
        </button>
      ) : (
        <Link href={listHref} className={active === "offers" ? "offers-tab offers-tab--active" : "offers-tab"}>
          Teklifler
          {offersCount}
        </Link>
      )}
      {/* T9: poz kütüphanesi = şirket geneli İş Kalemi Kataloğu; ayrı bir teklif kataloğu YOK. */}
      <Link href={routes.planning.workItemCatalog()} className="offers-tab">
        Poz Kütüphanesi
        {catalogCount !== null && <span className="offers-tab__count">{catalogCount}</span>}
      </Link>
      <Link
        href={routes.offers.templates()}
        className={active === "templates" ? "offers-tab offers-tab--active" : "offers-tab"}
        {...(active === "templates" ? { "aria-current": "page" as const } : {})}
      >
        Teklif Şablonları
        {templateCount !== null && templateCount !== undefined && <span className="offers-tab__count">{templateCount}</span>}
      </Link>
      <button type="button" className="offers-tab" disabled title={SOON_TITLE}>
        İşverenler
        <span className="offers-tab__soon">Yakında</span>
      </button>
    </div>
  );
}
