"use client";

import Link from "next/link";
import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { useVatReturn } from "@/lib/api/hooks/useVatReturn";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatAmount, formatCurrency } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  ACCOUNTING_PERMISSION_MODULE,
  ACCOUNTING_REASONS,
  ACCOUNTING_URL,
  currentPeriod,
  shiftPeriod,
  type Period,
} from "./accounting-labels";
import { AccountingTabs } from "./shell/AccountingTabs";
import { PeriodPicker } from "./PeriodPicker";
import {
  buildVatTaxableRows,
  vatDeductionBaseTotal,
  vatOutcome,
  vatTaxableBaseTotal,
} from "./vat-return";
import "./accounting.css";

/**
 * KDV · `/muhasebe/kdv-beyani` — mockup `Muhasebe - KDV Beyanı.dc.html`.
 * Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * 🔴 EKRAN SALT-OKURDUR: uç yalnız `GET` tanımlar (`put/post/delete/patch`
 * şemada `never`). Burada hiçbir mutasyon yoktur.
 *
 * 🔴 Süzgeç URL'de TAŞINMAZ ⇒ `Suspense` GEREKMEZ (`muhasebe/page.tsx`).
 */
export function VatReturnView() {
  const permission = useModulePermission(ACCOUNTING_PERMISSION_MODULE);
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view", fallback: permission.canView });

  // 🔴 K4 — beyanname ÖNCEKİ AYIN beyanıdır: mockup Haziran'ı gösterirken
  // vadeyi 28.07 yazar (KDV:45 ve :68 birlikte bunu söyler). Mizan'ın
  // varsayılanı (içinde bulunulan ay) burada YANLIŞ olurdu.
  const [period, setPeriod] = useState<Period>(() => shiftPeriod(currentPeriod(new Date()), -1));

  const vatQuery = useVatReturn(period.year, period.month);

  if (!canViewAccounting || isForbidden(vatQuery.error)) {
    return <AccessDenied />;
  }

  const data = vatQuery.data;
  const errorMessage = vatQuery.isError
    ? backendErrorMessage(vatQuery.error, "KDV beyannamesi yüklenemedi.")
    : undefined;

  return (
    <div className="mu">
      {/* KDV:39 */}
      <p className="mu__eyebrow">
        <Link href={ACCOUNTING_URL} className="mu__back" data-testid="kdv-back">
          ← Muhasebe
        </Link>
      </p>

      <div className="mu__head">
        {/* KDV:41 */}
        <h1 className="mu__title">KDV Beyannamesi</h1>
        <div className="mu__actions">
          {/* 🔴 KDV:43-47 — TEK AY (Mizan'ın birikimli aralığından FARKLI):
              beyanname bir takvim ayının beyanıdır. `PeriodPicker` bu yüzden
              OLDUĞU GİBİ, etiketsiz kullanılır. */}
          <PeriodPicker period={period} onChange={setPeriod} />
          {/* KDV:48-49 — ikisi de e-Fatura/GİB entegrasyonunun parçasıdır ve
              o entegrasyon ERTELENDİ; düğmeler SİLİNMEZ, devre dışı +
              gerekçeleri EKRANDA. */}
          <Button variant="secondary" disabled data-testid="kdv-xml">
            XML İndir
          </Button>
          <Button variant="primary" disabled data-testid="kdv-send">
            GİB&apos;e Gönder
          </Button>
        </div>
      </div>

      {/* F-MUP T1 — MP:105-112 modül sekmeleri; drill-in sidebar'ın YERİNE.
          Şerit sayfa BAŞLIĞININ ALTINDADIR (MP:103 → MP:105). */}
      <AccountingTabs />

      <p className="mu-notice" data-testid="kdv-send-reason">
        “XML İndir” / “GİB&apos;e Gönder”: {pendingModuleLabel(ACCOUNTING_REASONS.vatReturnGib)}.
      </p>

      {errorMessage !== undefined && (
        <p className="mu-notice mu-notice--danger" data-testid="kdv-error">
          {errorMessage}
        </p>
      )}
      {errorMessage === undefined && data === undefined && (
        <p className="mu-notice" data-testid="kdv-loading">
          KDV beyannamesi yükleniyor…
        </p>
      )}

      {data !== undefined && <VatReturnBody data={data} />}

      {/* Görsel spec (T6) "yüklendi" iddiasının damgası. */}
      {data !== undefined && <span hidden data-testid="kdv-loaded" />}
    </div>
  );
}

/**
 * Veri geldikten sonraki gövde. Ayrı bir bileşen olması, yükleme/hata
 * dallarında `data`nın `undefined` olabileceğini tipin kendisinin
 * söylemesini sağlar (isteğe bağlı zincir yerine).
 */
function VatReturnBody({ data }: { data: VatReturnResponse }) {
  const outcome = vatOutcome(data);
  const taxableRows = buildVatTaxableRows(data);
  const taxableBaseTotal = vatTaxableBaseTotal(taxableRows);
  const deductionBaseTotal = vatDeductionBaseTotal(data.deductions);

  return (
    <>
      {/* KDV:53-70 — ÜÇ özet kartı. */}
      <div className="mu-vat-cards">
        {/* KDV:55-59 — hesaplanan KIRMIZI (satıştan doğan BORÇ). */}
        <div className="mu-vat-card" data-testid="kdv-card-calculated">
          <div className="mu-vat-card__label">Hesaplanan KDV</div>
          <div className="mu-vat-card__value mu-vat-card__value--danger">
            {formatCurrency(data.calculated_vat)}
          </div>
          <div className="mu-vat-card__note">Satışlardan doğan</div>
        </div>
        {/* KDV:60-64 — indirilecek YEŞİL (alımdan doğan ALACAK). */}
        <div className="mu-vat-card" data-testid="kdv-card-deductible">
          <div className="mu-vat-card__label">İndirilecek KDV</div>
          <div className="mu-vat-card__value mu-vat-card__value--success">
            {formatCurrency(data.deductible_vat)}
          </div>
          <div className="mu-vat-card__note">Alımlardan doğan</div>
        </div>
        {/* 🔴 K1 — ÜÇÜNCÜ kart VURGU kartıdır ve İKİ dalı vardır. Ton
            `vatOutcome`un kararına bağlıdır: turuncu = devlete borç,
            yeşil = devletten alacak. */}
        <div
          className={`mu-vat-card mu-vat-card--accent mu-vat-card--${outcome.kind}`}
          data-testid="kdv-card-outcome"
        >
          <div className="mu-vat-card__label">{outcome.cardTitle}</div>
          <div className="mu-vat-card__value" data-testid="kdv-outcome-amount">
            {formatCurrency(outcome.amount)}
          </div>
          <div className="mu-vat-card__note">{outcome.cardNote}</div>
        </div>
      </div>

      {/* KDV:72 — iki panel YAN YANA. */}
      <div className="mu-vat-grid">
        {/* KDV:74-104 — Tablo 1. */}
        <section className="mu-panel" aria-label="Tablo 1 — Matrah ve Vergi">
          <div className="mu-panel__head">
            <span className="mu-panel__title">Tablo 1 — Matrah ve Vergi</span>
          </div>
          <div className="mu-table-scroll">
            <table className="mu-table mu-vat-table">
              <thead>
                <tr>
                  {/* 🔴 KDV:78 — sütun KALIR ama sunucuda karşılığı YOK;
                      içerik oranın kendisinden türer (bkz. `vat-return.ts`). */}
                  <th scope="col">İşlem</th>
                  <th scope="col" className="is-right">
                    KDV %
                  </th>
                  <th scope="col" className="is-right">
                    Matrah
                  </th>
                  <th scope="col" className="is-right">
                    Vergi
                  </th>
                </tr>
              </thead>
              <tbody>
                {taxableRows.map((row, index) => (
                  <tr
                    // Anahtar İNDEKSLE tamamlanır: sunucu bir gün aynı oranı
                    // iki kez dönerse `key` çakışırdı (`data-testid` DEĞİŞMEZ).
                    key={`${row.key}-${index}`}
                    className={row.isExempt ? "mu-vat-exempt" : undefined}
                    data-testid={`kdv-taxable-${row.key}`}
                  >
                    <td>{row.label}</td>
                    <td className="is-right">{row.rate}</td>
                    {/* 🔴 K7 — burada SIFIR `0` YAZILIR, `—` DEĞİL (KDV:93-94).
                        Mizan'ın tam TERSİ kuraldır; iki ekran iki kural,
                        mockup böyle. */}
                    <td className="is-right is-mono">{formatAmount(row.base)}</td>
                    <td
                      className={`is-right is-mono${row.isExempt ? "" : " mu-amount--debit"}`}
                    >
                      {formatAmount(row.vat)}
                    </td>
                  </tr>
                ))}
                {/* 🔴 KDV:96-101 — toplam satırı `tfoot` DEĞİL, `tbody`nin son
                    `tr`idir (mockup böyle çiziyor). */}
                <tr className="mu-vat-total mu-vat-total--calculated" data-testid="kdv-taxable-total">
                  <td>Toplam Hesaplanan</td>
                  <td />
                  <td className="is-right is-mono" data-testid="kdv-taxable-base-total">
                    {formatAmount(taxableBaseTotal)}
                  </td>
                  {/* Vergi toplamı SUNUCUDAN gelir (`calculated_vat`); burada
                      ikinci bir toplama YAPILMAZ. */}
                  <td className="is-right is-mono mu-vat-total__accent">
                    {formatAmount(data.calculated_vat)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* KDV:106-144 — İndirimler + sonuç şeridi AYNI panelin içinde. */}
        <section className="mu-panel" aria-label="İndirimler">
          <div className="mu-panel__head">
            <span className="mu-panel__title">İndirimler</span>
          </div>
          <div className="mu-table-scroll">
            <table className="mu-table mu-vat-table">
              <thead>
                <tr>
                  <th scope="col">Kaynak</th>
                  <th scope="col" className="is-right">
                    Matrah
                  </th>
                  <th scope="col" className="is-right">
                    KDV
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 🔴 Mockup İKİ satır çizer (`Mal Alışları` / `Hizmet
                    Alımları`, KDV:117/122) ama sunucu TEK satır döner
                    (`Alışlar`): ayrımın veri modelinde karşılığı YOKTUR
                    (MU-2'de ölçülüp kararlaştırıldı). Satır UYDURULMAZ —
                    `deductions` ne dönüyorsa o basılır; fark AÇIK BORÇtur. */}
                {data.deductions.map((row, index) => (
                  <tr
                    key={`${row.source}-${index}`}
                    data-testid={`kdv-deduction-${row.source}`}
                  >
                    <td>{row.source}</td>
                    <td className="is-right is-mono">{formatAmount(row.base)}</td>
                    <td className="is-right is-mono mu-amount--credit">{formatAmount(row.vat)}</td>
                  </tr>
                ))}
                {/* KDV:126-130 — toplam satırı YEŞİL zeminlidir. */}
                <tr className="mu-vat-total mu-vat-total--deduction" data-testid="kdv-deduction-total">
                  <td>Toplam İndirim</td>
                  <td className="is-right is-mono" data-testid="kdv-deduction-base-total">
                    {formatAmount(deductionBaseTotal)}
                  </td>
                  <td className="is-right is-mono mu-vat-total__accent">
                    {formatAmount(data.deductible_vat)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* KDV:134-143 — sonuç şeridi panelin İÇİNDEDİR (ayrı bir kart
              değil): üstünde 2px'lik renk çizgisi, altında zemin. */}
          <div
            className={`mu-vat-result mu-vat-result--${outcome.kind}`}
            data-testid="kdv-result"
          >
            <div>
              <div className="mu-vat-result__title">{outcome.resultTitle}</div>
              {/* 🔴 K1 — devreden dalda tarih satırı HİÇ BASILMAZ: ödenecek
                  tutar yokken "son ödeme tarihi" olgusal olarak yanlıştır. */}
              {outcome.resultDate !== null && (
                <div className="mu-vat-result__date" data-testid="kdv-result-date">
                  {outcome.resultDate}
                </div>
              )}
            </div>
            <div className="mu-vat-result__amount">{formatCurrency(outcome.amount)}</div>
          </div>
        </section>
      </div>
    </>
  );
}
