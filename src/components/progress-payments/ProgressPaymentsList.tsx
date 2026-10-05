"use client";

import { MaskedNote } from "@/components/ui/hidden-mark/HiddenMark";
import { EMPLOYER_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import Link from "next/link";

import { Badge } from "@/components/ui/badge/Badge";
import {
  type ProgressPaymentListItem,
  type ProgressPaymentListResponse,
} from "@/lib/api/hooks/useProgressPayments";
import { cx } from "@/lib/cx";
import { formatCompactCurrency } from "@/lib/format";

import { PROGRESS_PAYMENT_STATUS_BADGE } from "./status";
import { formatPaymentTitle } from "./title";
import { routes } from "@/lib/routes";

// P7 T2 + T6 ortak hakediş liste gövdesi. `/hakedisler` (proje-genel) ve
// şantiye "Hakedişler" sekmesi AYNI kaydın iki görünümüdür (T6 brief §Kalıcı
// mimari karar) — satır bileşeni burada TEK yerde yaşar, kopyalanmaz.
// Yükleniyor/hata/boş/liste dört dalı da burada; her iki görünüm aynı
// metinleri kullanır (T6 brief'te ayrı metin istenmedi).
// F-SZLEKR T2 KUSUR DÜZELTMESİ: boş durum ipucu ("+ Yeni Hakediş ile
// başlayın") ÖLÜ TALİMATTI — üç üretim çağıranının üçünde de yanlıştı (bir
// yerde etiket tutmuyor, bir yerde düğme hiç yok). Kök çözüm: `isFiltered`
// (boolean) yerine `emptyScope` (ayrık birlik) — iki bağımsız boolean dört
// hâl üretirdi, ikisi anlamsızdı. İpucundaki eylem metni artık HER ZAMAN
// `newActionLabel` prop'undan (çağıranın kendi düğme etiketiyle AYNI
// sabitten) okunur; prop verilmezse (`null`) eylem hiç VAAT EDİLMEZ —
// dürüst, eylemsiz bir metin basılır. Böylece düğme etiketi değişirse ipucu
// otomatik izler; unutma imkânsız.
export type ProgressPaymentsEmptyScope = "all" | "filtered" | "contract";

const EMPTY_TITLE: Record<ProgressPaymentsEmptyScope, string> = {
  all: "Henüz hakediş oluşturulmadı",
  filtered: "Seçili projede hakediş yok",
  contract: "Bu sözleşmede hakediş yok",
};

const NO_ACTION_HINT = "Hakedişler ekranından oluşturulan kayıtlar burada listelenir";

function emptyHint(emptyScope: ProgressPaymentsEmptyScope, newActionLabel: string | null): string {
  if (emptyScope === "filtered") {
    return "Tüm hakedişleri görmek için proje süzgecini Tüm Projeler yapın";
  }
  if (newActionLabel) return `${newActionLabel} ile başlayın`;
  return NO_ACTION_HINT;
}

export function ProgressPaymentsListBody({
  isError,
  isLoading,
  data,
  showProjectName = true,
  emptyScope = "all",
  newActionLabel = null,
}: {
  isError: boolean;
  isLoading: boolean;
  data?: ProgressPaymentListResponse;
  /**
   * FİNAL İNCELEME düzeltmesi #5: `/hakedisler` (proje-genel) listede proje
   * adı etiketi GEREKLİ — aynı "#5" farklı projelerde tekrar edebilir. Ama
   * şantiye "Hakedişler" sekmesinde (`SiteProgressPaymentsView`) proje zaten
   * breadcrumb'ta gösteriliyor, orada tekrar aynı etiket gürültü. Varsayılan
   * `true` → mevcut çağıran (`ProgressPaymentsView`) davranışı DEĞİŞMEZ.
   */
  showProjectName?: boolean;
  /**
   * F-PRJTAB T3: liste bir süzgeçle daraltılmışken boş dönerse "hiç hakediş
   * yok" demek YANLIŞ olur — kayıt olabilir, seçili projede yoktur. `contract`
   * F-SZLEKR T2'de eklendi: sözleşme-kapsamlı liste (`EmployerContractDetail
   * View`) için de "hiç hakediş yok" yanlıştır — bu sözleşmede yoktur.
   * Varsayılan `"all"` → mevcut çağıranların davranışı DEĞİŞMEZ.
   */
  emptyScope?: ProgressPaymentsEmptyScope;
  /**
   * F-SZLEKR T2: boş durum ipucundaki eylem metni. Çağıran kendi "+ Yeni
   * Hakediş" düğmesiyle AYNI sabitten geçirir (tek kaynak — düğme metni
   * değişirse ipucu unutulmaz). `null` (varsayılan) = eylem ÖNERİLMEZ (yazma
   * yetkisi yoksa ya da ekranda düğme hiç yoksa). `emptyScope === "filtered"`
   * iken YOK SAYILIR — süzgeç ipucu her zaman süzgeç talimatını basar.
   */
  newActionLabel?: string | null;
}) {
  const isAmountHidden = useCategoryHidden(EMPLOYER_PAYMENT_HIDDEN_CATEGORIES);
  if (isError) return <p className="pp-message">Hakedişler yüklenemedi</p>;
  if (isLoading || !data) return <p className="pp-message">Yükleniyor…</p>;
  if (data.items.length === 0) {
    return (
      <section className="pp-empty">
        <p className="pp-empty__title">{EMPTY_TITLE[emptyScope]}</p>
        <p className="pp-empty__hint">{emptyHint(emptyScope, newActionLabel)}</p>
      </section>
    );
  }
  return (
    <section className="pp-card">
      {/* IZN-F4b.2 — gizli tutarlar için listenin üstünde TEK kilit; satır tutarları `—`. */}
      <MaskedNote isHidden={isAmountHidden} values={data.items.map((item) => item.gross_total)} />
      <ul className="pp-list">
        {data.items.map((item) => (
          <ProgressPaymentRow key={item.id} item={item} showProjectName={showProjectName} />
        ))}
      </ul>
    </section>
  );
}

function ProgressPaymentRow({
  item,
  showProjectName,
}: {
  item: ProgressPaymentListItem;
  showProjectName: boolean;
}) {
  const badge = PROGRESS_PAYMENT_STATUS_BADGE[item.status];
  return (
    <li className="pp-row">
      <Link
        href={routes.progressPayments.detail({ paymentId: item.id })}
        className="pp-row__link"
        aria-label={`${item.project_name} — ${formatPaymentTitle(item)}`}
      >
        <div className="pp-row__main">
          {showProjectName && <p className="pp-row__project">{item.project_name}</p>}
          <p className="pp-row__title">{formatPaymentTitle(item)}</p>
          {item.description && <p className="pp-row__desc">{item.description}</p>}
        </div>
        <div className="pp-row__side">
          {/* FİNAL İNCELEME düzeltmesi #4: mockup (satır 99/103) kompakt
              basıyor ("₺2,10M") — `formatCurrencyPrecise` (kuruş hassasiyetli
              tam sayı) yerine bu ekranın kendi KPI şeridiyle (`formatCompact
              Currency`) TUTARLI hale getirildi. Ekran 15 detay ekranı kuruş
              hassasiyetli KALIR — orada tam tutar gerekir, burada YALNIZ
              liste satırı özet gösterimi değişti. */}
          {/* FİNAL İNCELEME düzeltmesi #3: mockup satır 99'da yalnız
              `pending_approval` durumundaki tutar primary mavidir (diğerleri
              koyu metin) — mevcut token'lar (`--color-primary`/`--color-text`)
              mockup değerleriyle birebir eşleştiğinden yeni token EKLENMEDİ,
              yalnız durum-bazlı modifier sınıfı eklendi. */}
          <span
            className={cx(
              "pp-row__amount",
              item.status === "pending_approval" && "pp-row__amount--pending",
            )}
          >
            {formatCompactCurrency(item.gross_total)}
          </span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </Link>
    </li>
  );
}
