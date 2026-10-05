import { CheckCircleIcon, WarningTriangleIcon } from "@/components/ui/icons";
import type { IncomeStatementResponse } from "@/lib/api/hooks/useIncomeStatement";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency } from "@/lib/format";

import { absDecimalString } from "./cash-flow-statement";
import { incomeStatementDifference, isIncomeStatementReconciled } from "./income-statement";

/**
 * 🔴 K1.3 · MUTABAKAT ŞERİDİ — E11 mockup'ında ÇİZİLMEMİŞTİR ve bilinçli bir
 * SAPMAdır. Mockup `DÖNEM KARI = Toplam Gelir − Toplam Gider` özdeşliğini
 * varsayar; uç ise ikisinin AYRIŞABİLECEĞİNİ söylüyor (K1: maliyet aktarım
 * hesapları kalem tutarına girmez ama `period_profit()` onları sayar).
 *
 * Ayrışmayı hiç göstermemek, kullanıcıya toplamayan bir tabloyu TOPLUYORMUŞ
 * gibi göstermek olurdu; ayrı bir yüzey icat etmek ise mockup ailesinin
 * dilinden sapmak olurdu — iskelet `BalanceSheetBanner`ın AYNISIdır
 * (`fs-banner--ok` / `--off`), yalnız ton/ikon/metin döner.
 *
 * 🔴 Şerit MUTABIK dalda da BASILIR: yalnız kırmızı dalda basılan bir uyarı,
 * "hiç ölçülmedi" ile "ölçüldü ve tuttu" hâllerini ayırt EDİLEMEZ kılar
 * (`BalanceSheetBanner` kanonu).
 *
 * 🔴 IZN-F4b.2 · GECE KARARI — gelir/gider/kâr üçlüsünden biri `null` (rol için gizli) ise
 * mutabakat DOĞRULANAMAZ: "eşit değil" uyarısı VERİLMEZ, sahte "Mutabık" da basılmaz; nötr not + kilit.
 *
 * Sembol bekçisi (F-SEM): çıplak `✓`/`⚠` YAZILMAZ, ikonlar `ui/icons`in
 * inline SVG'leridir. 🔴 `≠` (U+2260) ve `−` (U+2212) KULLANILMAZ —
 * `src/styles/fonts.css`teki `unicode-range`lerin hiçbiri onları kapsamaz ve
 * kapsanmayan bir glif tarayıcıyı sistem yedeğine düşürür (F-SEM'in
 * `makine-yakit` kusuru). Kelimeyle yazılır; anlam korunur, glif riski
 * alınmaz.
 */
export function IncomeStatementBanner({ data }: { data: IncomeStatementResponse }) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  const reconciled = isIncomeStatementReconciled(
    data.total_revenue,
    data.total_expense,
    data.period_profit,
  );

  if (reconciled === null) {
    return (
      <p className="fs-notice" data-testid="mt-is-banner-unverifiable">
        <span>Gelir Tablosu mutabakatı doğrulanamıyor — tutarlar bu görünümde yok</span>
        {isHidden && <HiddenMark />}
      </p>
    );
  }

  if (reconciled) {
    return (
      <p className="fs-banner fs-banner--ok" data-testid="mt-is-banner">
        <CheckCircleIcon className="fs-banner__icon" />
        <span>{`Gelir Tablosu Mutabık — Toplam Gelir ile Toplam Gider farkı ${data.profit_label} ile aynı: ${formatCurrency(
          data.period_profit,
        )}`}</span>
      </p>
    );
  }

  return (
    <p className="fs-banner fs-banner--off" data-testid="mt-is-banner">
      <WarningTriangleIcon className="fs-banner__icon" />
      {/* 🔴 FARK MUTLAK basılır (bilanço şeridi emsali) ve işaret STRING
          düzeyinde atılır — `Math.abs(Number(...))` 2⁵³ üstü tutarlarda son
          basamağı yutardı. Gerekçe metni SABİTtir çünkü bir olgunun ADIdır:
          ayrışmanın kaynağı tek bir yerdedir (maliyet aktarım hesapları). */}
      <span>{`${data.profit_label}, Toplam Gelir ile Toplam Gider farkına eşit değil (fark: ${formatCurrency(
        absDecimalString(
          incomeStatementDifference(data.total_revenue, data.total_expense, data.period_profit) ?? "0",
        ),
      )}). Kaynağı maliyet aktarım fişleridir; ${data.profit_label} satırı Bilanço ile aynı sayıyı basar.`}</span>
    </p>
  );
}
