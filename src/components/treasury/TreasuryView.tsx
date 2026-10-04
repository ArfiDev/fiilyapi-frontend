"use client";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  BANK_ACCOUNT_LIST_MAX_LIMIT,
  useBankAccounts,
} from "@/lib/api/hooks/useBankAccounts";
import { useCashFlow } from "@/lib/api/hooks/useCashFlow";
import { useUpcomingPayments } from "@/lib/api/hooks/useUpcomingPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { BankAccountCards } from "./BankAccountCards";
import { CashFlowPanel } from "./CashFlowPanel";
import { UpcomingPaymentsPanel } from "./UpcomingPaymentsPanel";
import "./treasury.css";

/** İzin matrisi anahtarı — `GET /bank-accounts` erişimini `treasury` denetler. */
const TREASURY_PERMISSION_MODULE = "treasury";

/**
 * E9:65 "+ Ödeme Planla" — KARŞILIĞI OLAN UÇ YOKTUR (openapi.json'da ödeme
 * planlama ucu açılmadı). F-TH kanonu: rotası olmayan mockup öğesi SİLİNMEZ,
 * DEVRE DIŞI basılır; uydurma uç çağrılmaz, uydurma form açılmaz.
 */
const PLAN_PAYMENT_DISABLED_HINT = "Ödeme planlama ucu henüz açılmadı.";

/**
 * `/hazine` — mockup `Ekran 9 - Hazine.dc.html` (kanonik). Yorumlardaki sayılar
 * o dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (E9:20-33) ve sol menüsü (E9:36-59) BASILMAZ: kabuk
 * canon kazanır (F3 Topbar + Sidebar).
 *
 * ⚠️ ÜÇ BAĞIMSIZ VERİ KAYNAĞI: hesaplar · nakit akışı · yaklaşan ödemeler ayrı
 * sorgulardır ve HER BİRİ kendi yükleme/hata durumunu taşır — biri patlayınca
 * diğer ikisi yaşamaya devam eder.
 */
export function TreasuryView() {
  const permission = useModulePermission(TREASURY_PERMISSION_MODULE);

  // `is_active=true`: mockup PASİF hesap çizmiyor (E9:69-85'te üç kart da canlı
  // hesaptır) ve kapatılmış bir hesabın bakiyesini şeritte göstermek "elde bu
  // para var" izlenimi verirdi. Kırpma korkuluğu (TB3/F-TH): `limit` AÇIKÇA
  // gönderilir, `total` ile karşılaştırılır.
  const accountsQuery = useBankAccounts({
    isActive: true,
    limit: BANK_ACCOUNT_LIST_MAX_LIMIT,
  });
  const cashFlowQuery = useCashFlow();
  const upcomingQuery = useUpcomingPayments();

  if (!permission.canView || isForbidden(accountsQuery.error)) return <AccessDenied />;

  const accounts = accountsQuery.data?.items;
  const truncation = buildListTruncation(accounts?.length ?? 0, accountsQuery.data?.total);

  return (
    <div className="hazine">
      {/* 62 */}
      <p className="hazine__eyebrow">Mali</p>
      {/* 63-66 */}
      <div className="hazine__head">
        <h1 className="hazine__title">Hazine</h1>
        {/* 65 — devre dışı, gerekçesi görünür (title + alttaki bant). */}
        <Button
          disabled
          title={PLAN_PAYMENT_DISABLED_HINT}
          data-testid="hazine-plan-payment"
        >
          + Ödeme Planla
        </Button>
      </div>
      <p className="hazine-notice" data-testid="hazine-plan-payment-reason">
        {PLAN_PAYMENT_DISABLED_HINT}
      </p>

      {/* 69-85 — banka/kasa kartı şeridi (kendi yükleme/hata durumu). */}
      {accountsQuery.isLoading && <p className="hazine-notice">Yükleniyor…</p>}
      {accountsQuery.isError && (
        <p className="hazine-notice hazine-notice--danger" role="alert">
          {backendErrorMessage(accountsQuery.error)}
        </p>
      )}
      {truncation.isTruncated && (
        <p className="hazine-notice" data-testid="hazine-truncation-notice">
          {listTruncationMessage(truncation)}
        </p>
      )}
      {accounts !== undefined && accounts.length === 0 && (
        <p className="hazine-notice">Kayıtlı aktif banka/kasa hesabı yok.</p>
      )}
      {accounts !== undefined && accounts.length > 0 && <BankAccountCards accounts={accounts} />}

      {/* 88 — iki sütunlu ızgara */}
      <div className="hazine-panels">
        <CashFlowPanel
          cashFlow={cashFlowQuery.data}
          isLoading={cashFlowQuery.isLoading}
          errorMessage={
            cashFlowQuery.isError ? backendErrorMessage(cashFlowQuery.error) : undefined
          }
        />
        <UpcomingPaymentsPanel
          upcoming={upcomingQuery.data}
          isLoading={upcomingQuery.isLoading}
          errorMessage={
            upcomingQuery.isError ? backendErrorMessage(upcomingQuery.error) : undefined
          }
        />
      </div>

      {/* Görsel spec (T3) "yüklendi" iddiasını KAYNAK BAŞINA kurar — F-İK
          dersi: tek bayrak, ikinci kaynağın hâlâ pending olduğunu GİZLER ve
          kadraj "Yükleniyor…" hâlini donmuş yakalayabilir. */}
      {accountsQuery.data !== undefined && <span hidden data-testid="hazine-loaded-accounts" />}
      {cashFlowQuery.data !== undefined && <span hidden data-testid="hazine-loaded-cashflow" />}
      {upcomingQuery.data !== undefined && <span hidden data-testid="hazine-loaded-upcoming" />}
    </div>
  );
}
