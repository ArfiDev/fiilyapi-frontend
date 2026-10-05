"use client";

import Link from "next/link";
import { useState } from "react";

import { ACCOUNTING_PERMISSION_MODULE } from "@/components/accounting/accounting-labels";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { BalanceSheetResponse } from "@/lib/api/hooks/useBalanceSheet";
import { useBalanceSheet } from "@/lib/api/hooks/useBalanceSheet";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  BALANCE_SHEET_EXPORT_REASON,
  balanceSheetAsOfOptions,
  defaultBalanceSheetAsOf,
} from "./balance-sheet";
import { BalanceSheetBanner } from "./BalanceSheetBanner";
import { BalanceSheetSideCard } from "./BalanceSheetSideCard";
import { FinancialStatementsSegments } from "./FinancialStatementsSegments";
import {
  BALANCE_SHEET_URL,
  FINANCIAL_STATEMENTS_URL,
} from "./shell/financial-statements-nav-config";
import "./financial-statements.css";

/**
 * BL · `/mali-tablolar/bilanco` — mockup `Mali Tablo - Bilanço.dc.html`.
 * Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (BL:14-22) BASILMAZ: kabuk canon'udur.
 *
 * 🔴 SOL MENÜ (BL:24-31) DA BASILMAZ — 🔴 ONAYLI SAPMA (kullanıcı kararı
 * 2026-08-27). Mockup BL:24-31 bu menüyü ÇİZER; kullanıcı birebir şunu
 * söyledi: «biliyorum bu mockupta öyle ama sen dediğimi yap». Yani bu
 * mockup-birebir kuralından BİLİNÇLİ, ONAYLI bir sapmadır — SONRAKİ TUR
 * "mockup çiziyor" DİYE GERİ ALMASIN. Drill
 * sidebar global kabuk sidebar'ıyla BİREBİR aynı konum/genişlikteydi
 * (`fixed; top: 52px; left: 0; width: 220px; z-index: 90`) ve onu ÖRTÜYORDU:
 * bu ekrana girince ana menü kayboluyordu. Kullanıcı bunu kusur olarak
 * bildirdi; ana menü artık üç ekranda da AYNEN yerinde kalır (`.app-content`
 * ofseti hiç değişmiyordu, dolayısıyla layout da kaymaz).
 *
 * 🔴 Sidebar yapraklarda `/bilanco ↔ /nakit-akisi` DOĞRUDAN geçişinin TEK
 * taşıyıcısıydı; geçiş `FinancialStatementsSegments`e taşındı ve aşağıda
 * `fs__actions` içinde basılır. Rota grubunda `layout.tsx` YOKTUR — artık
 * paylaşılacak bir kabuk parçası kalmadığı için GEREKMEZ.
 *
 * 🔴 EKRAN SALT-OKURDUR: uç yalnız `GET` tanımlar; burada hiçbir mutasyon
 * yoktur. Dönem kilidi rozeti de YOKTUR (MT-K8: bilanço salt-okumadır).
 *
 * 🔴 Süzgeç URL'de TAŞINMAZ (bileşen state'i) ⇒ `useSearchParams` yoktur ve
 * `Suspense` sarmalayıcısı GEREKMEZ (`muhasebe/page.tsx` kanonu).
 */
export function BalanceSheetView() {
  const permission = useModulePermission(ACCOUNTING_PERMISSION_MODULE);
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view", fallback: permission.canView });

  // 🔴 Varsayılan gün YEREL takvimden türetilir (`toISOString()` UTC'ye çevirir
  // ve TR saatinde ay sonunu bir gün geri kaydırırdı — TB5 dersi).
  const [asOfOptions] = useState(() => balanceSheetAsOfOptions(new Date()));
  const [asOf, setAsOf] = useState(() => defaultBalanceSheetAsOf(new Date()));

  const balanceSheetQuery = useBalanceSheet(asOf);

  if (!canViewAccounting || isForbidden(balanceSheetQuery.error)) {
    return <AccessDenied />;
  }

  const data = balanceSheetQuery.data;
  const errorMessage = balanceSheetQuery.isError
    ? backendErrorMessage(balanceSheetQuery.error, "Bilanço yüklenemedi.")
    : undefined;

  return (
    <div className="fs mali-tablolar-content">
      {/* BL:33 — mockup'ın geri bağlantısı. `←` (U+2190) `fonts.css`
            kapsamındadır ve `symbol-subset-guard`da ONAYLIDIR. */}
      <p className="fs__eyebrow">
        <Link
          href={FINANCIAL_STATEMENTS_URL}
          className="fs__back"
          data-testid="bl-back"
        >
          ← Mali Tablolar
        </Link>
      </p>

      <div className="fs__head">
        {/* BL:35 */}
        <h1 className="fs__title">Bilanço</h1>
        <div className="fs__actions">
          {/* Yaprak geçişi (kullanıcı kararı 2026-08-27) — CURRENT bu
                ekrandır. */}
          <FinancialStatementsSegments currentHref={BALANCE_SHEET_URL} />
          {/* 🔴 BL:37 — NOKTA-ZAMAN seçici (mizanın birikimli aralığından
                FARKLI): üç ayrı TEK GÜN. Ham `<select>` YASAK, `ui` primitive'i
                kullanılır. */}
          <Select
            size="row"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            aria-label="Bilanço tarihi"
            data-testid="bl-as-of"
          >
            {asOfOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {/* BL:38 — düğmenin UCU YOK; SİLİNMEZ (F-TH kanonu), devre dışı +
                gerekçesi EKRANDA (`title`da SAKLANMAZ). */}
          <Button variant="secondary" disabled data-testid="bl-export-pdf">
            PDF
          </Button>
        </div>
      </div>

      <p className="fs-notice" data-testid="bl-export-reason">
        “PDF”: {pendingModuleLabel(BALANCE_SHEET_EXPORT_REASON)}.
      </p>

      {errorMessage !== undefined && (
        <p className="fs-notice fs-notice--danger" data-testid="bl-error">
          {errorMessage}
        </p>
      )}
      {errorMessage === undefined && data === undefined && (
        <p className="fs-notice" data-testid="bl-loading">
          Bilanço yükleniyor…
        </p>
      )}

      {data !== undefined && <BalanceSheetBody data={data} />}

      {/* Görsel spec'in "yüklendi" iddiasının damgası. */}
      {data !== undefined && <span hidden data-testid="bl-loaded" />}
    </div>
  );
}

/**
 * Veri geldikten sonraki gövde. Ayrı bir bileşen olması, yükleme/hata
 * dallarında `data`nın `undefined` olabileceğini TİPİN KENDİSİNİN söylemesini
 * sağlar (`VatReturnView` emsali) — isteğe bağlı zincir yerine.
 */
function BalanceSheetBody({ data }: { data: BalanceSheetResponse }) {
  return (
    <>
      {/* 🔴 K3 — denge banner'ı. Veri gelmeden BASILMAZ: `is_balanced`
          bilinmezken "dengede" demek de "dengesiz" demek de uydurma olurdu. */}
      <BalanceSheetBanner data={data} />

      {/* BL:42 — iki kart YAN YANA. */}
      <div className="fs-sides">
        {/* BL:44-63 */}
        <BalanceSheetSideCard
          side={data.assets}
          tone="assets"
          testId="bl-assets"
        />
        {/* BL:66-88 */}
        <BalanceSheetSideCard
          side={data.liabilities}
          tone="liabilities"
          testId="bl-liabilities"
        />
      </div>
    </>
  );
}
