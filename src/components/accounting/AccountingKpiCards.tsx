import type { JournalSummaryResponse } from "@/lib/api/hooks/useJournalSummary";
import type { VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency, formatDayMonthShort, formatPeriod } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { ACCOUNTING_REASONS, netBalanceTone, type Period } from "./accounting-labels";

interface AccountingKpiCardsProps {
  summary: JournalSummaryResponse | undefined;
  vat: VatReturnResponse | undefined;
  /** Beyanın dönemi — sayfa başlığındaki dönemin BİR AY ÖNCESİ. */
  vatPeriod: Period;
}

/**
 * Veri gelmeden sayı UYDURULMAZ: yerinde `—` durur.
 *
 * 🔴 Bu `—`, K-MKD3'ün "DEĞER 0" hâliyle KARIŞTIRILMAZ. Buradaki tek anlamı
 * "kaynak henüz cevap vermedi"dir (`undefined`); sunucu `0` derse ekran `₺0`
 * basar, `—` DEĞİL. Boş bir dönemin toplamı sıfırdır ve bu bir CEVAPTIR.
 */
const AWAITING = "—";

/**
 * MP:114-139 · BEŞ KPI kartı. Kaynaklar İKİ AYRI UÇTUR (`journal-summary` ·
 * `vat-return`) ve BEŞİNCİSİNİN ucu HİÇ YOKTUR.
 *
 * 🔴 **MOCKUP SAPMASI 1 — KART ETİKETLERİ (bildirildi).** MP:116/120 kartları
 * `Toplam Gelir` / `Toplam Gider` diye adlandırır ve altlarına
 * `₺4.120.000` / `₺3.842.600` yazar. Bu İKİ SAYI ölçüldü: MP:248-249'un
 * `Dönem Alacak` / `Dönem Borç` toplamlarının TA KENDİSİDİR (ve
 * `JournalSummaryResponse` şema notu aynı aritmetiği `4.120.000 − 3.842.600 =
 * 277.400` ile kanıtlar). Yani mockup, YEVMİYE TOPLAMLARINA gelir/gider adını
 * takıyor.
 *
 * Bu ad YANLIŞTIR ve ekranı YALANCI yapardı: bir müşteri tahsilatı `120`
 * hesabını ALACAKLANDIRIR ama GELİR DEĞİLDİR; bir malzeme alımı `153`ü
 * BORÇLANDIRIR ama GİDER DEĞİLDİR (stoğa girer). "Toplam Gelir ₺4.120.000"
 * yazan bir muhasebe ekranı, gelir tablosunun basacağı sayıdan farklı bir
 * sayıyı gelir diye ilan ederdi. Gerçek gelir/gider `/income-statement`
 * ucundadır ve o ekran AYRIDIR (`/mali-tablolar`).
 *
 * Bu yüzden kartlar F-MU1'in ölçülmüş etiketleriyle basılır: `Toplam Borç` /
 * `Toplam Alacak`. Sapma raporlandı.
 *
 * 🔴 **MOCKUP SAPMASI 2 — ALT SATIRLAR (bildirildi).** MP:118 `↑ %8,3`
 * (önceki döneme göre değişim) ve MP:122 `53 kayıt` (adet) BASILMAZ: ne
 * `journal-summary` ne de başka bir uç bu iki olguyu döndürür. Önceki dönem
 * için ikinci bir çağrı açıp yüzde ÜRETMEK, mockup'ın göstermelik sayısını
 * ekranda gerçekmiş gibi göstermek olurdu.
 */
export function AccountingKpiCards({ summary, vat, vatPeriod }: AccountingKpiCardsProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  const netTone = summary === undefined ? "neutral" : netBalanceTone(summary.net_balance);

  return (
    <div className="mu-pro-kpis">
      {/* MP:120-123 — borç KIRMIZI. */}
      <div className="mu-pro-kpi" data-testid="mu-kpi-debit">
        <div className="mu-pro-kpi__label">Toplam Borç</div>
        <div className="mu-pro-kpi__value mu-pro-kpi__value--danger">
          {summary === undefined ? AWAITING : formatCurrency(summary.total_debit)}
          <MaskedMark isHidden={isHidden} values={[summary?.total_debit]} />
        </div>
      </div>

      {/* MP:116-119 — alacak YEŞİL. */}
      <div className="mu-pro-kpi" data-testid="mu-kpi-credit">
        <div className="mu-pro-kpi__label">Toplam Alacak</div>
        <div className="mu-pro-kpi__value mu-pro-kpi__value--success">
          {summary === undefined ? AWAITING : formatCurrency(summary.total_credit)}
          <MaskedMark isHidden={isHidden} values={[summary?.total_credit]} />
        </div>
      </div>

      {/* MP:124-127 — `net_balance = ALACAK − BORÇ`; işareti RENK söyler
          (F-MU1 ölçümü: MP yalnız POZİTİF örnek çizer, negatifi yeşil basmak
          sayının işaretini gizlerdi). */}
      <div className="mu-pro-kpi" data-testid="mu-kpi-net">
        <div className="mu-pro-kpi__label">Net Bakiye</div>
        <div
          className={
            netTone === "neutral"
              ? "mu-pro-kpi__value"
              : `mu-pro-kpi__value mu-pro-kpi__value--${netTone}`
          }
          data-testid="mu-kpi-net-value"
        >
          {summary === undefined ? AWAITING : formatCurrency(summary.net_balance)}
          <MaskedMark isHidden={isHidden} values={[summary?.net_balance]} />
        </div>
      </div>

      {/* MP:128-131 — 🔴 KDV kartı `journal-summary`den DEĞİL `/vat-return`den
          gelir. `payable` sıfıra KIRPILMIŞ tarafdır (şema notu: negatif fark
          "ödenecek" değil DEVREDEN KDV'dir ve `carried_forward`ta yaşar), bu
          yüzden burada basılan sayı ASLA negatif olamaz ve kart "Borcu"
          demekte haklıdır. Vade TAKVİMDEN gelir, fatura verisinden değil —
          boş dönemde de doludur. */}
      <div className="mu-pro-kpi" data-testid="mu-kpi-vat">
        <div className="mu-pro-kpi__label">KDV Borcu</div>
        <div className="mu-pro-kpi__value mu-pro-kpi__value--warning">
          {vat === undefined ? AWAITING : formatCurrency(vat.payable)}
          <MaskedMark isHidden={isHidden} values={[vat?.payable]} />
        </div>
        <div className="mu-pro-kpi__note" data-testid="mu-kpi-vat-due">
          {/* 🔴 MOCKUP SAPMASI 3 (bildirildi): MP:131 YALNIZ `28 Tem vadeli`
              yazar. Kartın dönemi sayfa başlığından BİR AY GERİDE olduğu için
              (yukarıdaki not) sadece vadeyi basmak kullanıcıya sayının HANGİ
              aya ait olduğunu söylemezdi — beyan ayı da yazılır. */}
          {vat === undefined
            ? AWAITING
            : `${formatPeriod(vatPeriod.year, vatPeriod.month)} beyanı · ${formatDayMonthShort(vat.due_date)} vadeli`}
        </div>
      </div>

      {/* MP:132-135 — 🔴 BEŞİNCİ KARTIN UCU YOK. Kart SİLİNMEZ (kanon),
          devre dışı + gerekçesi EKRANDA basılır.

          🔴 `/invoices/summary`nin `pending_approval` alanı buraya
          BAĞLANMADI ve bu bilinçlidir: adı "bekleyen" dese de kümesi
          ONAY bekleyen faturalardır — MP'nin sorduğu ise GİB'e gönderilip
          CEVAP bekleyen e-faturalardır. İki küme farklıdır; bağlansaydı
          dört kapı da yeşil kalır, ekran yanlış sayıyı doğru etiketle
          basardı. */}
      <div className="mu-pro-kpi mu-pro-kpi--disabled" data-testid="mu-kpi-einvoice">
        <div className="mu-pro-kpi__label">e-Fatura Bekleyen</div>
        <div className="mu-pro-kpi__value mu-pro-kpi__value--muted">{AWAITING}</div>
        <div className="mu-pro-kpi__note" data-testid="mu-kpi-einvoice-reason">
          {pendingModuleLabel(ACCOUNTING_REASONS.vatReturnGib)}
        </div>
      </div>
    </div>
  );
}
