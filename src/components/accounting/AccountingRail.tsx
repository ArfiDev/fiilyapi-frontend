import type { TrialBalanceResponse } from "@/lib/api/hooks/useTrialBalance";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { ACCOUNTING_REASONS } from "./accounting-labels";
import { accountBalanceRailRows, type AccountBalanceSide } from "./accounting-pro";

interface AccountBalancesPanelProps {
  data: TrialBalanceResponse | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
}

/** Kapanış tarafı → para tonu. `flat` NÖTRDÜR ve bir HATA DEĞİLDİR. */
const SIDE_TONE: Record<AccountBalanceSide, string> = {
  credit: "mu-pro-rail__amount--danger",
  debit: "mu-pro-rail__amount--strong",
  flat: "mu-pro-rail__amount--flat",
  hidden: "mu-pro-rail__amount--flat",
};

/**
 * MP:165-209 · sağ rayın "Hesap Bakiyeleri" paneli — mini mizan.
 *
 * 🔴 KAYNAK: `/trial-balance` (`year`+`month`). Kümesi mizan ekranıyla AYNI
 * uçtur, yani rayda görünen sayı Mizan sekmesindeki sayıyla YAPISAL olarak
 * aynıdır; ikinci bir formül yazılsaydı iki ekran aynı hesap için farklı
 * sayı basabilir ve hiçbir kolon farkı ele vermezdi.
 *
 * 🔴 **ÜÇ HÂL AYRI AYRI BASILIR** (K-MKD3): `undefined` (kaynak henüz
 * cevaplamadı) · boş `rows` (dönemde HİÇBİR hesap hareket görmedi) · dolu
 * liste. Tek bayrağa indirgenseydi boş bir dönem "yükleniyor" gibi görünür,
 * yükleniyor da "hareket yok" gibi görünürdü.
 *
 * 🔴 SATIR KIRPILMAZ. Mockup yedi satır çizer; sunucu kaç satır dönerse
 * hepsi basılır ve ray KENDİ İÇİNDE kaydırılır. Sessizce ilk N'e kırpmak,
 * bakiyesi olan bir hesabı ekrandan silmek olurdu. Kaç satır olduğu
 * başlıkta YAZAR.
 *
 * 🔴 **PENCERE, SAYFANIN DÖNEMİYLE AYNI DEĞİLDİR — ve bu EKRANDA YAZAR.**
 * Ölçüldü (`/trial-balance` uç açıklaması): mizanın penceresi BİRİKİMLİDİR —
 * "yılın Ocak ayından `month`un SON GÜNÜNE kadar". KPI şeridi ise TEK AYIN
 * yevmiye toplamıdır. Yani sayfa başlığı "Temmuz 2026" derken bu raydaki
 * sayılar Ocak–Temmuz kapanışıdır. İkisi TUTMAK ZORUNDA DEĞİLDİR; okuyucu
 * bunu bilmezse rayı yevmiye toplamlarıyla karşılaştırıp "tutmuyor" sanır.
 * Açıklama satırı bu yüzden pencereyi de söyler.
 */
export function AccountBalancesPanel({
  data,
  isLoading,
  errorMessage,
}: AccountBalancesPanelProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  const rows = data === undefined ? undefined : accountBalanceRailRows(data.rows);

  return (
    <section className="mu-pro-rail" aria-label="Hesap Bakiyeleri">
      <div className="mu-pro-rail__head">
        {/* MP:166 */}
        {/* IZN-F4b.2 — gizli bakiyeler için panel başlığında TEK kilit; satırlar `—`. */}
        <span className="mu-pro-rail__title">
          Hesap Bakiyeleri
          <MaskedMark isHidden={isHidden} values={rows?.map((row) => row.amount) ?? []} />
        </span>
        {rows !== undefined && (
          <span className="mu-pro-rail__count" data-testid="mu-rail-count">
            {rows.length} hesap
          </span>
        )}
      </div>

      {errorMessage !== undefined && (
        <p className="mu-notice mu-notice--danger" data-testid="mu-rail-error">
          {errorMessage}
        </p>
      )}
      {errorMessage === undefined && isLoading && (
        <p className="mu-pro-rail__state" data-testid="mu-rail-loading">
          Hesap bakiyeleri yükleniyor…
        </p>
      )}
      {errorMessage === undefined && rows !== undefined && rows.length === 0 && (
        <p className="mu-pro-rail__state" data-testid="mu-rail-empty">
          Bu dönemde hiçbir hesap hareket görmedi.
        </p>
      )}

      {rows !== undefined && rows.length > 0 && (
        <ul className="mu-pro-rail__list" data-testid="mu-rail-list">
          {rows.map((row) => (
            <li className="mu-pro-rail__row" key={row.accountId}>
              <span className="mu-pro-rail__code">{row.code}</span>
              <span className="mu-pro-rail__name">{row.name}</span>
              <span
                className={`mu-pro-rail__amount ${SIDE_TONE[row.side]}`}
                data-testid={`mu-rail-amount-${row.code}`}
              >
                {formatAmount(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Renk burada dekorasyon değil TARAF taşır; okunmadan anlaşılmaz.
          Pencere de yazar: ray BİRİKİMLİ, KPI şeridi TEK AYLIK. */}
      <p className="mu-pro-rail__legend">
        Yıl başından bu yana kapanış bakiyesi — alacak kalanı kırmızı, borç
        kalanı koyu, tam kapanan hesap soluk sıfır.
      </p>
    </section>
  );
}

/**
 * MP:211-238 · sağ rayın "e-Fatura" paneli.
 *
 * 🔴 UCU YOK. Panel SİLİNMEZ (kanon: rotası/ucu olmayan mockup öğesi devre
 * dışı + GÖRÜNÜR gerekçeyle basılır), ama SAHTE SATIR DA BASMAZ: mockup'ın
 * üç örnek satırı (`Akın İnşaat` · `Yılmaz Elektrik` · `Demirsan A.Ş.`)
 * ekrana çıkarsa kullanıcı onları gerçek veri sanar.
 */
export function EInvoicePanel() {
  return (
    <section className="mu-pro-rail mu-pro-rail--disabled" aria-label="e-Fatura">
      <div className="mu-pro-rail__head">
        <span className="mu-pro-rail__title">e-Fatura</span>
      </div>
      <p className="mu-pro-rail__state" data-testid="mu-einvoice-reason">
        {pendingModuleLabel(ACCOUNTING_REASONS.vatReturnGib)}
      </p>
    </section>
  );
}
