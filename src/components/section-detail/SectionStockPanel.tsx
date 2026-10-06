"use client";

import Link from "next/link";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatQuantity } from "@/lib/format";
import type {
  SectionStockKpis,
  SectionStockRow,
} from "@/lib/api/hooks/useSectionStock";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { boqLabel, SECTION_STOCK_NO_BOQ_REASON } from "./section-stock-derive";
import "./section-detail.css";

/**
 * STOK-BOLUM · Bölüm Detay › "Malzeme" sekmesinin GÖVDESİ.
 *
 * 🔴 BU PANEL ARTIK PENDING DEĞİL — VE ESKİ GEREKÇESİ ÇÜRÜDÜ. Önceki hâli
 * *"`inventory/` içinde `section_id` SIFIR kolon isabeti"* ölçümüne dayanıyordu
 * ve o ölçüm 2026-08-29'da BAYATLADI: backend `186ffe9` (PR #98)
 * `stock_entry_lines.section_id` + `.boq_item_id` kolonlarını ve
 * `GET /sections/{section_id}/stock` ucunu açtı. Panel o uçtan beslenir.
 *
 * 🔴 "BAKİYE" BASILMAZ ve bu bir eksiklik DEĞİL ürün kararıdır ("STOK DEPODA
 * DURUR, BÖLÜM TÜKETİR"). Uç bakiye DÖNDÜRMEZ; bölüme ikinci bir bakiye kaynağı
 * açmak aynı malzeme için zamanla sapan iki sayı üretirdi. Sütun başlıkları bu
 * yüzden "Mevcut Stok" DEĞİL, sunucunun kendi adlarıdır.
 *
 * 🔴 "ATANAN" İLE "SARF" AYRI SÜTUNDUR. Tek bir toplam basılsaydı `+10 alım`
 * ile `−4 sarf` birbirini götürür ve ekran 4 birimin harcandığını HİÇ
 * söyleyemezdi. Sarf toplamı `issued_quantity`dir.
 *
 * 🔴 MOCKUP YOK: `Bölüm Detay.dc.html` bu sekme için panel ÇİZMEZ (aktif sekme
 * D100 "İş Kalemleri"dir). Yeni bir görsel dil İCAT EDİLMEZ — kardeş panellerin
 * (`SectionBoqCard`/`SectionPaymentsPanel`) kabuğu ve `section-stock__*`
 * sınıfları GENİŞLETİLİR.
 *
 * Yükleme/hata dalları AYRI basılır (kardeş panellerin emsali): veri yokken boş
 * tablo basmak kullanıcıya *"bu bölümde hiç malzeme hareketi yok"* YALANINI
 * söylerdi.
 */
export interface SectionStockPanelProps {
  /** Başlıkta basılır — jenerik doldur-boşluk yerine bölümün kendi kimliği. */
  sectionName: string;
  /**
   * Şantiye stok ekranı — 🔴 bu bağlantı bölüm süzgecini TAŞIR (`?section=`).
   * Süzgecin anlamı DARDIR ve hedef ekran onu kendi bandında etiketler:
   * satır kümesini daraltır, bakiyeyi DEĞİŞTİRMEZ.
   */
  siteStockHref: string;
  rows: readonly SectionStockRow[] | undefined;
  kpis: SectionStockKpis | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * kalan-4 #283: sunucunun SÜZGEÇLENMEMİŞ toplamı (`SectionStockResponse.total`).
   * `limit=200` tavanına dayanan bir bölümde 201. (malzeme, poz) çifti
   * SESSİZCE düşer — bu alan olmadan panel kırpılmayı GİZLERDİ.
   */
  total: number | undefined;
}

export function SectionStockPanel({
  sectionName,
  siteStockHref,
  rows,
  kpis,
  isLoading,
  isError,
  total,
}: SectionStockPanelProps) {
  const truncation = buildListTruncation(rows?.length ?? 0, total ?? 0);
  return (
    <section
      className="section-stock"
      data-testid="section-stock"
      aria-labelledby="section-stock-title"
    >
      <div className="section-stock__head">
        <h2 className="section-stock__title" id="section-stock-title">
          {sectionName} · Stok Hareketleri
        </h2>
        <Link className="section-stock__link" href={siteStockHref}>
          Şantiye stok ekranı →
        </Link>
      </div>
      <div className="section-stock__body">
        {!isLoading && !isError && truncation.isTruncated && (
          <p className="section-stock__hint" data-testid="section-stock-truncation">
            {listTruncationMessage(truncation)} Bu bölümün malzeme satırları listenin dışında
            kalmış olabilir.
          </p>
        )}
        <SectionStockBody
          rows={rows}
          kpis={kpis}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </section>
  );
}

function SectionStockBody({
  rows,
  kpis,
  isLoading,
  isError,
}: Pick<SectionStockPanelProps, "rows" | "kpis" | "isLoading" | "isError">) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  if (isError) {
    return (
      <p className="section-detail__message" data-testid="section-stock-error">
        Bölüm malzeme kırılımı yüklenemedi
      </p>
    );
  }
  if (isLoading || rows === undefined || kpis === undefined) {
    return <p className="section-detail__message">Yükleniyor…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="section-detail__message" data-testid="section-stock-empty">
        Bu bölüme atfedilmiş stok hareketi yok. Malzeme, “Stok Girişi” formunda
        satır bazında bir bölüme atfedildiğinde burada görünür.
      </p>
    );
  }

  return (
    <>
      <SectionStockKpiStrip kpis={kpis} isCostHidden={isCostHidden} />
      {/* IZN-F4d.2: tutar toplamı gizliyse (`null`) "toplamına girmedi" notu yalan olurdu. */}
      {kpis.total_value !== null && kpis.lines_without_price > 0 && (
        <p className="section-stock__hint" data-testid="section-stock-price-notice">
          {kpis.lines_without_price} satırın birim fiyatı yok — bu satırlar
          “Tutar” toplamına GİRMEDİ.
        </p>
      )}
      <table className="section-stock__table" data-testid="section-stock-table">
        <thead>
          <tr>
            <th scope="col">Malzeme</th>
            <th scope="col">İş Kalemi</th>
            <th scope="col" className="section-stock__num">
              Atanan
            </th>
            {/* 🔴 SARF = `issued_quantity`. "Atanan"la aynı hücrede toplanmaz. */}
            <th scope="col" className="section-stock__num">
              Sarf
            </th>
            <th scope="col" className="section-stock__num">
              Net
            </th>
            <th scope="col" className="section-stock__num">
              Tutar
              <MaskedMark isHidden={isCostHidden} values={(rows ?? []).map((row) => row.total_value)} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const boq = boqLabel(row);
            // Satır anahtarı (malzeme, poz) ÇİFTİDİR — uç satırları bu çift
            // başına açar ve aynı malzeme birden çok pozda görünebilir.
            const key = `${row.item_id}:${row.boq_item_id ?? "-"}`;
            return (
              <tr key={key} data-testid={`section-stock-row-${row.code}`}>
                <td>
                  <span className="section-stock__item-name">{row.name}</span>
                  <span className="section-stock__item-code">{row.code}</span>
                </td>
                <td>
                  {boq ?? (
                    // Poz atfı YOKLUĞU meşrudur (backend fail-open), bir
                    // "pending" gerekçesi DEĞİLDİR — metin bunu söyler.
                    <span
                      className="section-stock__no-boq"
                      title={SECTION_STOCK_NO_BOQ_REASON}
                      data-testid={`section-stock-noboq-${row.code}`}
                    >
                      Poz atanmadı
                      <span className="sr-only"> — {SECTION_STOCK_NO_BOQ_REASON}</span>
                    </span>
                  )}
                </td>
                <td className="section-stock__num">
                  {formatQuantity(row.assigned_quantity)} {row.unit}
                </td>
                <td
                  className="section-stock__num section-stock__num--issued"
                  data-testid={`section-stock-issued-${row.code}`}
                >
                  {formatQuantity(row.issued_quantity)} {row.unit}
                </td>
                <td className="section-stock__num">
                  {formatQuantity(row.net_quantity)} {row.unit}
                </td>
                <td className="section-stock__num">{rupees(row.total_value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** `null` (maskeli, IZN-F4d.2) → "—"; `₺—` ya da `₺0` BASILMAZ. */
function rupees(value: string | null): string {
  return value === null ? "—" : `₺${formatAmount(value)}`;
}

/**
 * Bölüm malzeme şeridi. **YER TUTUCU YOKTUR** — dördü de gerçek sayıdır
 * (backend `SectionStockKpis`: "dördü de gerçek sayıdır"). `MetricPlaceholder`
 * zarfı bu uçta HİÇ dönmez, o yüzden burada zarf açan bir dal da yoktur.
 */
function SectionStockKpiStrip({ kpis, isCostHidden }: { kpis: SectionStockKpis; isCostHidden: boolean }) {
  return (
    <dl className="section-stock__kpis" data-testid="section-stock-kpis">
      <div className="section-stock__kpi">
        <dt>Sarf Değeri</dt>
        <dd data-testid="section-stock-kpi-issued-value">
          {rupees(kpis.issued_value)}
          <MaskedMark isHidden={isCostHidden} values={[kpis.issued_value]} />
        </dd>
      </div>
      <div className="section-stock__kpi">
        <dt>Toplam Tutar</dt>
        <dd data-testid="section-stock-kpi-total-value">
          {rupees(kpis.total_value)}
          <MaskedMark isHidden={isCostHidden} values={[kpis.total_value]} />
        </dd>
      </div>
      <div className="section-stock__kpi">
        <dt>Malzeme Çeşidi</dt>
        <dd data-testid="section-stock-kpi-item-count">{kpis.item_count}</dd>
      </div>
      <div className="section-stock__kpi">
        <dt>Fiyatsız Satır</dt>
        <dd data-testid="section-stock-kpi-lines-without-price">{kpis.lines_without_price}</dd>
      </div>
    </dl>
  );
}
