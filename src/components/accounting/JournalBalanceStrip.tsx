"use client";

import { AlertIcon, CheckCircleIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount } from "@/lib/format";

import { balanceNarration, type JournalTotals } from "./journal-entry-form";

/**
 * 🔴 **DENGE GÖSTERGESİ** — kullanıcı dengesizliği GÖNDERMEDEN ÖNCE görür.
 *
 * Kanon: `Form - Yevmiye Kaydi.dc.html` `M:194-217` (dengesiz) ve `M:220-246`
 * (dengeli). İSKELET TEK, TON İKİ: mockup iki bloğu ayrı ayrı çizer ama
 * ızgaraları (`1fr 190px 190px 210px`), sırası ve tipografisi birebir aynıdır —
 * ayrı bir bileşen açmak aynı yüzeyi iki kez bakımda tutardı.
 *
 * Sunucu dengesiz fişi 422 ile reddeder ("Fiş dengede değil…") ama bu SON
 * ÇAREdir: kullanıcı hangi tarafın ne kadar eksik olduğunu ancak burada,
 * yazarken görebilir.
 *
 * Toplamlar ve fark `journalTotals`tan gelir — `lib/decimal.ts`in kayıpsız
 * aritmetiği. Kayan noktayla karşılaştırma yapılsaydı `0.1 + 0.2` fişi
 * "dengesiz" görünürdü.
 *
 * 🔴 `M:198`/`M:226` satır içi SVG'leri yerine `ui/icons`ın mevcut ikonları
 * kullanılır (daire+ünlem = `AlertIcon`, daire+tik = `CheckCircleIcon`):
 * ui/ katmanına yeni ikon eklemeden aynı iki biçim elde edilir.
 *
 * 🔴 `M:206`/`M:210` toplamlar DENGESİZKEN kırmızı/yeşil, `M:234`/`M:238`
 * DENGELİYKEN nötr koyudur — renk burada dekorasyon değil DURUM taşır.
 */
export function JournalBalanceStrip({ totals }: { totals: JournalTotals }) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  // IZN-F4b.2 — gizli bacak varsa denge DOĞRULANAMAZ: nötr "doğrulanamıyor", "dengede değil" DEĞİL.
  const narration = totals.isVerifiable
    ? balanceNarration(totals.isBalanced)
    : { title: "Denge doğrulanamıyor", detail: "Bazı satır tutarları rolünüz için gizli" };
  const StateIcon = totals.isVerifiable && totals.isBalanced ? CheckCircleIcon : AlertIcon;
  const valueTone = (side: "debit" | "credit") =>
    totals.isBalanced ? "mu-balance__value--neutral" : `mu-amount--${side}`;

  return (
    <div
      className={cx(
        "mu-balance",
        totals.isVerifiable && (totals.isBalanced ? "mu-balance--ok" : "mu-balance--off"),
      )}
      data-testid="mu-balance-strip"
    >
      {/* `M:197-203` — ikon + iki satırlık anlatı, ızgaranın esneyen ilk hücresi. */}
      <div className="mu-balance__state" role="status">
        <StateIcon className="mu-balance__icon" width={18} height={18} />
        <div>
          <p className="mu-balance__state-title" data-testid="mu-balance-state">
            {narration.title}
          </p>
          <p className="mu-balance__state-detail" data-testid="mu-balance-state-detail">
            {narration.detail}
          </p>
        </div>
      </div>
      <div className="mu-balance__cell">
        <span className="mu-balance__label">Toplam Borç</span>
        <span
          className={cx("mu-balance__value", valueTone("debit"))}
          data-testid="mu-balance-debit"
        >
          {formatAmount(totals.totalDebit)}
          <MaskedMark isHidden={isHidden} values={[totals.totalDebit]} />
        </span>
      </div>
      <div className="mu-balance__cell">
        <span className="mu-balance__label">Toplam Alacak</span>
        <span
          className={cx("mu-balance__value", valueTone("credit"))}
          data-testid="mu-balance-credit"
        >
          {formatAmount(totals.totalCredit)}
          <MaskedMark isHidden={isHidden} values={[totals.totalCredit]} />
        </span>
      </div>
      {/* `M:212-215` / `M:240-243` — Fark VURGULU kutudadır; ızgaranın öteki
          hücreleri düz zemindir. Tek sayı iki kutu arasında dolaşmaz. */}
      <div className="mu-balance__cell mu-balance__diff">
        <span className="mu-balance__label">Fark</span>
        <span className="mu-balance__value mu-balance__diff-value" data-testid="mu-balance-difference">
          {formatAmount(totals.difference)}
        </span>
      </div>
    </div>
  );
}
