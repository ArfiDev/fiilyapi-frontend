"use client";

import Link from "next/link";
import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  CHART_ACCOUNTS_MAX_LIMIT,
  useChartOfAccounts,
} from "@/lib/api/hooks/useChartOfAccounts";
import { LEDGER_MAX_LIMIT, useLedger } from "@/lib/api/hooks/useLedger";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";
import { isForbidden } from "@/lib/api/unwrap";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatAmount } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  ACCOUNTING_PERMISSION_MODULE,
  ACCOUNTING_REASONS,
  ACCOUNTING_URL,
  currentPeriod,
  type Period,
} from "./accounting-labels";
import { bankLedgerAccounts, ledgerClosingBalance } from "./bank-reconciliation";
import { LedgerTable } from "./LedgerTable";
import { PeriodPicker } from "./PeriodPicker";
import { AccountingTabs } from "./shell/AccountingTabs";
import "./accounting.css";
import "./accounting-pro.css";
import "./bank-reconciliation.css";

/**
 * F-MUP · `/muhasebe/banka-mutabakati` — kanonik mockup
 * `Muhasebe - Banka Mutabakatı.dc.html` (BM). KK-10 bu sekmeyi AÇIKÇA
 * Muhasebe ekranına bağladı.
 *
 * 🔴🔴 **EMRİN BİR PREMISE'İ ÖLÇÜLEREK ÇÜRÜTÜLDÜ — RAPORLANDI.**
 * Emir "backend işi 0, bağımlılık 0" diyor. `openapi.json` ölçüldü
 * (2026-08-26, 230+ yol): BANKA EKSTRESİ diye bir uç YOKTUR — ne okuma, ne
 * içe aktarma, ne mutabakat, ne eşleştirme. `/bank-accounts` VARDIR ama o
 * HAZİNE kartıdır; `balance` alanı şirketin KENDİ kayıtlarından türetilir
 * (şema notu: "türetilmiş `balance`, `balance.py`nin tek kaynağı"), yani
 * BANKANIN söylediği sayı DEĞİLDİR. Mutabakat tam da bu iki sayıyı
 * karşılaştırmaktır; biri yoksa karşılaştırma da yoktur.
 *
 * Ekran bu yüzden İKİYE BÖLÜNDÜ ve bölünme GÖRÜNÜRDÜR:
 *
 * | BM bölümü | Hâl | Kaynak / gerekçe |
 * |---|---|---|
 * | Sağ panel — defter satırları | **CANLI** | `/journal?account_id` |
 * | Kapanış bakiyesi (BM:243) | **CANLI** | `/trial-balance` |
 * | "Muhasebe Kayıt Bakiyesi" kartı | **CANLI** | `/trial-balance` |
 * | Sol panel — banka ekstresi | devre dışı | uç YOK |
 * | "↑ İçe Aktar" | devre dışı | uç YOK |
 * | "Banka Ekstresindeki Bakiye" kartı | devre dışı | uç YOK |
 * | "Fark" kartı | devre dışı | birinci karta bağlı |
 * | "Mutabakat Yap" | devre dışı | uç YOK |
 *
 * 🔴 Ölü yarıya SAHTE SATIR BASILMAZ. BM'nin beş örnek ekstre satırı
 * (`Hakediş Tahsilat – Güneşkent` …) ve beş yeşil ✓ eşleşme damgası ekrana
 * çıkarsa kullanıcı mutabakatın YAPILDIĞINI sanır — bu ekranın verebileceği
 * en pahalı yalan olurdu.
 *
 * 🔴 Seçicinin KÜMESİ mockup'takinden farklıdır; gerekçesi
 * `bank-reconciliation.ts`in `BANK_LEDGER_CODE_PREFIX` notundadır (banka
 * kartı ile defter hesabı arasında sözleşmede BAĞ YOK).
 */
export function BankReconciliationView() {
  const permission = useModulePermission(ACCOUNTING_PERMISSION_MODULE);
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view", fallback: permission.canView });

  const [period, setPeriod] = useState<Period>(() => currentPeriod(new Date()));
  const [accountId, setAccountId] = useState("");
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);

  const accountsQuery = useChartOfAccounts({ limit: CHART_ACCOUNTS_MAX_LIMIT });
  const trialBalanceQuery = useTrialBalance(period.year, period.month);
  // 🔴 Hesap SEÇİLMEDEN defter sorgusu HİÇ KURULMAZ (`enabled: false`).
  // Süzgeçsiz `/journal` TÜM hesapların satırlarını döndürürdü; ekran onları
  // basmasa bile `total` üzerinden kurulan kırpma uyarısı "İlk 0 kayıt
  // gösteriliyor (toplam N) — liste eksik" diye YANLIŞ bir cümle basıyordu
  // (yerel kadrajda ölçüldü ve düzeltildi).
  const hasAccount = accountId.length > 0;
  const ledgerQuery = useLedger({
    year: period.year,
    month: period.month,
    limit: LEDGER_MAX_LIMIT,
    enabled: hasAccount,
    ...(hasAccount ? { accountId } : {}),
  });

  if (
    !canViewAccounting ||
    isForbidden(accountsQuery.error) ||
    isForbidden(trialBalanceQuery.error) ||
    isForbidden(ledgerQuery.error)
  ) {
    return <AccessDenied />;
  }

  const allAccounts = accountsQuery.data?.items;
  const accountTruncation = buildListTruncation(
    allAccounts?.length ?? 0,
    accountsQuery.data?.total,
  );
  const bankAccounts =
    allAccounts === undefined ? undefined : bankLedgerAccounts(allAccounts);
  const selected = bankAccounts?.find((account) => account.id === accountId);
  const closing = hasAccount
    ? ledgerClosingBalance(trialBalanceQuery.data, accountId)
    : undefined;

  const ledgerRows = hasAccount ? ledgerQuery.data?.items : undefined;
  // 🔴 Kırpma uyarısı YALNIZ defter GERÇEKTEN istendiğinde kurulur.
  const ledgerTruncation = buildListTruncation(
    ledgerRows?.length ?? 0,
    hasAccount ? ledgerQuery.data?.total : undefined,
  );

  return (
    <div className="mu">
      {/* BM:68 */}
      <p className="mu__eyebrow">
        <Link href={ACCOUNTING_URL} className="mu__back" data-testid="bm-back">
          ← Muhasebe
        </Link>
      </p>

      <div className="mu__head">
        {/* BM:71 */}
        <h1 className="mu__title">Banka Mutabakatı</h1>
        <div className="mu__actions">
          {/* BM:74-78 — mockup BANKA KARTLARINI listeler; burada HESAP PLANI
              listelenir (bkz. `BANK_LEDGER_CODE_PREFIX` notu). Ham <select>
              YASAK; `Select` primitive'i. */}
          <Select
            size="row"
            aria-label="Banka hesabı"
            value={accountId}
            data-testid="bm-account"
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Hesap seçin</option>
            {bankAccounts?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </Select>
          {/* BM:79-82 */}
          <PeriodPicker period={period} onChange={setPeriod} />
          {/* BM:83 — ucu YOK; düğme SİLİNMEZ, devre dışı + gerekçesi EKRANDA. */}
          <Button variant="primary" disabled data-testid="bm-run">
            Mutabakat Yap
          </Button>
        </div>
      </div>

      <AccountingTabs />

      <p className="mu-notice" data-testid="bm-run-reason">
        “Mutabakat Yap”: {pendingModuleLabel(ACCOUNTING_REASONS.bankReconciliationRun)}.
      </p>
      {accountsQuery.isError && (
        <p className="mu-notice mu-notice--danger" data-testid="bm-accounts-error">
          {backendErrorMessage(accountsQuery.error, "Hesap listesi yüklenemedi.")}
        </p>
      )}
      {accountTruncation.isTruncated && (
        <p className="mu-notice" data-testid="bm-accounts-truncation">
          {listTruncationMessage(accountTruncation)}
        </p>
      )}
      {bankAccounts !== undefined && bankAccounts.length === 0 && (
        // 🔴 "Hesap yok" ile "henüz yüklenmedi" AYRI hâllerdir (K-MKD3).
        <p className="mu-notice" data-testid="bm-no-bank-accounts">
          Hesap planında kodu 102 ile başlayan bir banka hesabı yok; mutabakat
          yapılacak defter hesabı bulunamadı.
        </p>
      )}

      {/* BM:86-105 — ÜÇ özet kartı. BİRİ canlı, İKİSİ ölü. */}
      <div className="bm-cards">
        {/* BM:88-92 — ucu YOK. */}
        <div className="bm-card bm-card--disabled" data-testid="bm-card-statement">
          <div className="bm-card__label">Banka Ekstresindeki Bakiye</div>
          <div className="bm-card__value bm-card__value--muted">—</div>
          <div className="bm-card__note" data-testid="bm-card-statement-reason">
            {pendingModuleLabel(ACCOUNTING_REASONS.bankStatementBalance)}
          </div>
        </div>

        {/* BM:93-97 — CANLI. */}
        <div className="bm-card" data-testid="bm-card-book">
          <div className="bm-card__label">Muhasebe Kayıt Bakiyesi</div>
          <div className="bm-card__value" data-testid="bm-card-book-value">
            {closing === undefined ? "—" : formatAmount(closing)}
            <MaskedMark isHidden={isHidden} values={[closing]} />
          </div>
          <div className="bm-card__note">
            {!hasAccount
              ? "Bir hesap seçin"
              : selected === undefined
                ? "Seçili hesap listede yok"
                : closing === undefined
                  ? `${selected.code} bu dönemde hiç hareket görmedi`
                  : `${selected.code} · kapanış bakiyesi`}
          </div>
        </div>

        {/* BM:98-104 — birinci karta bağlı; o ölüyken fark HESAPLANAMAZ.
            Mockup burada `₺ 0` ve `✓ Mutabık` basıyor: o iki işaret ekrana
            çıkarsa kullanıcı hesapların TUTTUĞUNU sanır. Basılmaz. */}
        <div className="bm-card bm-card--disabled" data-testid="bm-card-diff">
          <div className="bm-card__label">Fark</div>
          <div className="bm-card__value bm-card__value--muted">—</div>
          <div className="bm-card__note" data-testid="bm-card-diff-reason">
            {pendingModuleLabel(ACCOUNTING_REASONS.bankReconciliationRun)}
          </div>
        </div>
      </div>

      <div className="bm-grid">
        {/* BM:107-135 — sol panel: banka ekstresi. UCU YOK. */}
        <section className="mu-panel bm-panel--disabled" aria-label="Banka Ekstresi">
          <div className="mu-panel__head">
            <span className="mu-panel__title">Banka Ekstresi</span>
            {/* BM:110 — SİLİNMEZ, devre dışı. */}
            <Button variant="secondary" disabled data-testid="bm-import">
              İçe Aktar
            </Button>
          </div>
          <div className="mu-panel__body">
            <p className="bm-empty" data-testid="bm-statement-reason">
              {pendingModuleLabel(ACCOUNTING_REASONS.bankStatementImport)}.
            </p>
          </div>
        </section>

        {/* BM:216-247 — sağ panel: defter satırları. CANLI. */}
        <section className="mu-panel" aria-label="Muhasebe Kayıtları">
          <div className="mu-panel__head">
            <span className="mu-panel__title" data-testid="bm-ledger-title">
              {selected === undefined
                ? "Muhasebe Kayıtları"
                : `${selected.code} – ${selected.name}`}
            </span>
          </div>
          <div className="mu-panel__body">
            {ledgerTruncation.isTruncated && (
              <p className="mu-notice" data-testid="bm-ledger-truncation">
                {listTruncationMessage(ledgerTruncation)}
              </p>
            )}
            {!hasAccount ? (
              <p className="bm-empty" data-testid="bm-ledger-idle">
                Defter satırlarını görmek için yukarıdan bir banka hesabı seçin.
              </p>
            ) : (
              <LedgerTable
                rows={ledgerRows}
                isLoading={ledgerQuery.isLoading}
                errorMessage={
                  ledgerQuery.isError
                    ? backendErrorMessage(ledgerQuery.error, "Defter yüklenemedi.")
                    : undefined
                }
              />
            )}
          </div>

          {/* BM:243-246 — kapanış bakiyesi; kaynağı MİZAN, defter satırları
              DEĞİL (satırlar sayfalanmıştır). */}
          <div className="mu-pro-foot" data-testid="bm-closing">
            <span className="mu-pro-foot__cell">
              Kapanış Bakiyesi:{" "}
              <strong className="mu-pro-foot__value">
                {closing === undefined ? "—" : formatAmount(closing)}
                <MaskedMark isHidden={isHidden} values={[closing]} />
              </strong>
            </span>
          </div>
        </section>
      </div>

      {trialBalanceQuery.isError && (
        <p className="mu-notice mu-notice--danger" data-testid="bm-trial-error">
          {backendErrorMessage(trialBalanceQuery.error, "Kapanış bakiyesi yüklenemedi.")}
        </p>
      )}

      {/* Görsel spec "yüklendi" iddiasını KAYNAK BAŞINA kurar. */}
      {accountsQuery.data !== undefined && <span hidden data-testid="bm-loaded-accounts" />}
      {trialBalanceQuery.data !== undefined && <span hidden data-testid="bm-loaded-trial" />}
    </div>
  );
}
