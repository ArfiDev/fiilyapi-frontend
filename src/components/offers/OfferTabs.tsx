import Link from "next/link";

interface OfferTabsProps {
  /** "Teklifler N" — süzgeçsiz toplam; süzgeç açıkken `null` (sayaç basılmaz). */
  offerCount: number | null;
  /** Detay ve Şablonlar: "Teklifler" sekmesi listeye bağlantı olur (TD:77-79). Verilmezse liste ekranındaki etkin düğme. */
  listHref?: string;
  /** Şablonlar ekranında `false`: "Teklifler" listeye dönüş bağlantısıdır, etkin sekme değil. */
  isActive?: boolean;
}

/**
 * TL:78-81 · TD:77-82 — Liste, Detay ve Şablonlar'ın ortak sekme şeridi.
 * NAV-F2: yalnız "Teklifler" kalır; Poz Kütüphanesi / Teklif Şablonları / İşverenler kaldırıldı
 * (katalog ve şablonlar sol menüden açılır).
 */
export function OfferTabs({ offerCount, listHref, isActive = true }: OfferTabsProps) {
  const offersCount = offerCount !== null && <span className="offers-tab__count">{offerCount}</span>;
  return (
    <div className="offers-tabs" role="group" aria-label="Teklif sekmeleri">
      {listHref === undefined ? (
        <button type="button" className="offers-tab offers-tab--active" aria-current="page">
          Teklifler
          {offersCount}
        </button>
      ) : (
        <Link href={listHref} className={isActive ? "offers-tab offers-tab--active" : "offers-tab"}>
          Teklifler
          {offersCount}
        </Link>
      )}
    </div>
  );
}
