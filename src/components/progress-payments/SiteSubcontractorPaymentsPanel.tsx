"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge/Badge";
import { MaskedNote } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyPrecise } from "@/lib/format";
import type { SiteSubcontractorPaymentItem } from "@/lib/api/hooks/useSiteSubcontractorPayments";

import { projectWideNote } from "./shared/site-payment-scope";
import { buildSubcontractorRowSubtitle } from "./shared/subcontractor-row-subtitle";
import { PAYMENT_STATUS_BADGE } from "./shared/status";
import { routes } from "@/lib/routes";

// Şantiye "Hakedişler" sekmesi sağ sütunu (F-TH T5, mockup satır 135-166:
// "Taşeron Hakedişleri" paneli). Satır kabuğu (`pp-row*`) İŞVEREN sütunuyla
// PAYLAŞILIR (`progress-payments.css`, aynı visual dil) — kopyalanmaz.
export interface SiteSubcontractorPaymentsPanelProps {
  /** Sözleşmesi BU şantiyeye bağlı hakedişler — KPI toplamlarının kaynağı. */
  items: SiteSubcontractorPaymentItem[];
  /**
   * HAK-NULL · sözleşmesi PROJE GENELİ olan hakedişler. Şantiyeyi kapsarlar,
   * bu yüzden BASILIR; ama projenin her şantiyesinde tekrar döndükleri için
   * KPI toplamına GİRMEZLER ve bu ayrım görünür bir notla SÖYLENİR.
   *
   * Varsayılan `[]`: bu paneli çağıran ama proje geneli kümeyi henüz
   * geçirmeyen bir yer olursa panel eski davranışını aynen sürdürür.
   */
  projectWideItems?: readonly SiteSubcontractorPaymentItem[];
  isLoading: boolean;
  isError: boolean;
}

export function SiteSubcontractorPaymentsPanel({
  items,
  projectWideItems = [],
  isLoading,
  isError,
}: SiteSubcontractorPaymentsPanelProps) {
  // 🔴 "Hakediş YOK" iddiası ancak İKİ küme de boşken doğrudur. Eskiden bu
  // panel yalnız şantiyeye bağlı sözleşmelere bakıyordu ve proje geneli
  // sözleşmelerin parası sunucuda eleniyordu: canlıda tüm sözleşmeler proje
  // geneli olduğu için ekran "bu şantiyede taşeron hakedişi yok" diyordu —
  // ekranda duran YALAN buydu.
  const isTrulyEmpty = items.length === 0 && projectWideItems.length === 0;
  const note = projectWideNote(projectWideItems.length);
  const isAmountHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  return (
    <section className="spp__panel spp__panel--subcontractor">
      <div className="spp__panel-head">
        <span className="spp__panel-title">Taşeron Hakedişleri</span>
        <Link href={routes.progressPayments.subcontractor.list()} className="spp__panel-link">
          Tümü →
        </Link>
      </div>

      {isError ? (
        <p className="pp-message">Taşeron hakedişleri yüklenemedi</p>
      ) : isLoading ? (
        <p className="pp-message">Yükleniyor…</p>
      ) : isTrulyEmpty ? (
        <section className="pp-empty">
          <p className="pp-empty__title">Bu şantiyede taşeron hakedişi yok</p>
          <p className="pp-empty__hint">Sözleşme bu şantiyeye bağlandığında burada listelenir</p>
        </section>
      ) : (
        <>
          {/* IZN-F4b.2 — gizli tutarlar için listenin üstünde TEK kilit; satır tutarları `—`. */}
          <MaskedNote
            isHidden={isAmountHidden}
            values={[...items, ...projectWideItems].map((item) => item.grossTotal)}
          />
          {items.length > 0 && (
            <ul className="pp-list">
              {items.map((item) => (
                <SubcontractorPaymentRow key={item.id} item={item} />
              ))}
            </ul>
          )}

          {projectWideItems.length > 0 && (
            <>
              {/* 🔴 SESSİZ ATLAMA = İHLAL: satırlar basılıyor ama toplama
                  girmiyorlar — kullanıcı listede gördüğü tutarın KPI'da neden
                  olmadığını ancak bu notla anlayabilir. */}
              <p className="pp-scope-note" data-testid="site-payments-project-wide-note">
                {note}
              </p>
              <ul className="pp-list" data-testid="site-payments-project-wide">
                {projectWideItems.map((item) => (
                  <SubcontractorPaymentRow key={item.id} item={item} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * F-BLMSEK T2 — satır kabuğu DIŞARI AÇILDI. Bölüm Detay › "Hakediş" sekmesi
 * bu satırı OLDUĞU GİBİ yeniden kullanır; ikinci bir liste yazılsaydı zamanla
 * AYRIŞIRDI (mockup `Bölüm Detay.dc.html` 102-104 yalnız sekme düğmelerini
 * çizer, panel çizimi taşımaz — F-BLMPUAN'ın kanonik cevabı: yeni görsel dil
 * İCAT EDİLMEZ, şantiye bileşeni paylaşılır).
 *
 * `resolvedSectionName` OPSİYONELDİR ve şantiye ekranı onu GEÇMEZ → o ekranın
 * bastığı DOM birebir aynı kalır (`santiye-hakedisler.png` görsel tabanı).
 */
export function SubcontractorPaymentRow({
  item,
  resolvedSectionName,
}: {
  item: SiteSubcontractorPaymentItem;
  resolvedSectionName?: string | null;
}) {
  const badge = PAYMENT_STATUS_BADGE[item.status];
  const href = routes.progressPayments.subcontractor.detail({ paymentId: item.id });
  // Fix round 1 (coordinator review) — bileşik alt metin ("iş kategorisi ·
  // bölüm", mockup `Şantiye - Hakedişler.dc.html` satır 124; final inceleme
  // F-6: eski atıf "Ekran 2 satır 141" yanlıştı): iki parçanın "bilinmiyor" hâli AYRI anlamlar
  // taşıdığından `buildSubcontractorRowSubtitle` bunları ayırt eder (bkz.
  // dosyanın başlığı) — bölüm bileşeni artık HİÇ kaybolmaz.
  const subtitle = buildSubcontractorRowSubtitle(
    item.workCategory,
    item.sectionId,
    resolvedSectionName,
  );

  return (
    <li className="pp-row">
      <Link
        href={href}
        className="pp-row__link"
        aria-label={`${item.subcontractorName} — Hakediş #${item.sequenceNo}`}
      >
        <div className="pp-row__main">
          <p className="pp-row__title">
            {item.subcontractorName} #{item.sequenceNo}
          </p>
          {subtitle.isCombinedPending ? (
            <p className="pp-row__desc" title={subtitle.combinedPendingTitle}>
              —<span className="sr-only">{subtitle.combinedPendingTitle}</span>
            </p>
          ) : (
            <p className="pp-row__desc">
              {subtitle.segments.map((segment, index) => (
                <span key={index}>
                  {index > 0 && " · "}
                  {segment.kind === "text" ? (
                    <span>{segment.value}</span>
                  ) : (
                    <span title={segment.title}>
                      —<span className="sr-only">{segment.title}</span>
                    </span>
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="pp-row__side">
          <span className="pp-row__amount">{formatCurrencyPrecise(item.grossTotal)}</span>
          {item.isRevisionRequired ? (
            <Badge variant="danger">Revize Gerekli</Badge>
          ) : (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
        </div>
      </Link>
    </li>
  );
}
