import type { BadgeVariant } from "@/components/ui";
import type {
  ChartAccountResponse,
  ChartAccountType,
} from "@/lib/api/hooks/useChartOfAccounts";
import { EMPTY_CELL, formatAmount } from "@/lib/format";

/**
 * F-MU1 T3 · Hesap Planı ekranının SAF katmanı.
 *
 * Kanonik mockup: `Muhasebe - Hesap Planı.dc.html` (HP). Yorumlardaki sayılar O
 * dosyanın SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `chart-of-accounts-rows.test.ts`te yaşar.
 */

// --- Tür (HP:60 `Tür` = `account_type`) ----------------------------------

/**
 * 🔴 **`Tür` ≠ `Durum`.** İkisi de ekranda renkli basılır ve Türkçe'de ikisi de
 * "aktif" okunabilir, ama:
 *   * `Tür` = `account_type`, BEŞ üyeli kapalı bir enum (HP:78/154/192/199 +
 *     `equity` → BL:80, MT-1/KK-1 ile açıldı);
 *   * `Durum` = `is_active`, iki değerli bir KALDIRMA bayrağı (HP:80 nokta).
 *
 * Şema bunu ayrıca yazıyor (`ChartAccountResponse` açıklaması R3). `asset`ın
 * etiketi "Aktif"tir ve bu bir TÜRDÜR — kaydın kullanımda olduğunu SÖYLEMEZ:
 * HP:154'teki `257` hesabı `Pasif` türündedir ama noktası YEŞİLdir (HP:156),
 * yani kullanımdadır. Karıştıran bir uygulama pasife alınmış bir varlık
 * hesabını "Aktif" diye gösterirdi.
 */
export const ACCOUNT_TYPE_LABELS: Record<ChartAccountType, string> = {
  asset: "Aktif", // HP:78
  liability: "Pasif", // HP:154 · HP:166
  revenue: "Gelir", // HP:192
  expense: "Gider", // HP:199
  // 🔴 MOCKUP BOŞLUĞU (MT-1/KK-1 devri, 2026-08-16): `equity` beşinci üye olarak
  // backend'de açıldı ama Hesap Planı mockup'ında 5xx hesap HİÇ ÇİZİLMEMİŞ
  // (ölçüldü: kod evreni 100·101·102·120·127·150·191·252·254·257·320·360·391·
  // 600·730·760) — yani bu rozetin mockup'ta bir örneği YOKTUR. Etiket
  // uydurulmadı, `Mali Tablo - Bilanço.dc.html:80` bandındaki kendi sözcüğünden
  // alındı: `III. ÖZKAYNAKLAR`. Diğer dördü gibi TEK sözcük, tekil biçim.
  equity: "Özkaynak", // BL:80 (`III. ÖZKAYNAKLAR`)
};

export function accountTypeLabel(accountType: ChartAccountType): string {
  return ACCOUNT_TYPE_LABELS[accountType];
}

/** `asset`/`revenue` yeşil (HP:78/192), `liability`/`expense` kırmızı (HP:154/199). */
export function accountTypeVariant(accountType: ChartAccountType): BadgeVariant {
  return accountType === "asset" || accountType === "revenue" ? "success" : "danger";
}

// --- Durum (HP:62 `Durum` = `is_active`) ---------------------------------

/**
 * Noktanın ERİŞİLEBİLİR adı — renk TEK BAŞINA bilgi taşıyamaz (nokta bir
 * `div`di, HP:80).
 *
 * 🔴 Etiketler bilerek "Aktif/Pasif" DEĞİLDİR: o iki kelime `Tür` sütununun
 * rozetleridir ve aynı satırda ikinci kez geçseydi hangi sütunun ne söylediği
 * ekranda ayırt edilemezdi.
 */
export const ACCOUNT_STATUS_LABELS = {
  active: "Kullanımda",
  inactive: "Kullanım dışı",
} as const;

export function accountStatusLabel(isActive: boolean): string {
  return isActive ? ACCOUNT_STATUS_LABELS.active : ACCOUNT_STATUS_LABELS.inactive;
}

/**
 * HP:80 yalnız YEŞİL nokta çizer; mockup pasif bir hesabı hiç ÖRNEKLEMEMİŞTİR.
 * Bu bir "eksik ÖRNEK"tir, "eksik ALAN" değil (`is_active` şemada vardır ve
 * kaldırma yolu odur) → şef kararı: pasif nokta GRİdir.
 */
export function accountStatusTone(isActive: boolean): "on" | "off" {
  return isActive ? "on" : "off";
}

// --- Bakiye (HP:61 `Bakiye (₺)`) -----------------------------------------

export type BalanceTone = "success" | "danger";

/**
 * 🔴 NEGATİF bakiye PARANTEZ içinde yazılır — eksi işaretiyle değil
 * (HP:155 `(620.000)`). Muhasebe kanonu budur ve mockup'ın tek negatif örneği
 * de böyledir.
 *
 * Sarmalama, biçimlendirmenin ÜSTÜNDE ayrı bir katmandır: sayının kendisi
 * `formatAmount` ile yazılır (F-FAT2 kanonu — aynı para formülü iki yerde
 * yaşamaz), parantez yalnızca işaretin GÖSTERİMİdir.
 */
export function formatBalance(value: string | null): string {
  // IZN-F4b.2 — `null` = rol için gizli → "—" (Number(null) === 0 tuzağı: "0" BASILMAZ).
  if (value === null) return EMPTY_CELL;
  const amount = Number(value);
  if (Number.isFinite(amount) && amount < 0) return `(${formatAmount(Math.abs(amount))})`;
  return formatAmount(value);
}

/**
 * Bakiyenin rengi.
 *
 * 🔴 GÖREV EMRİNDEN SAPMA (gerekçesi mockup'tadır): emir "pozitif yeşil,
 * negatif kırmızı" diyordu, ama HP kendi içinde bunu YAPMIYOR — HP:167
 * (`320 Satıcılar`, `2.184.000`), HP:174, HP:181, HP:200 ve HP:207 hepsi
 * POZİTİF ve hepsi KIRMIZI. Ortak yanları işaretleri değil TÜRLERİdir
 * (`liability`/`expense`). Emrin kuralı harfiyen uygulansaydı mockup'ın beş
 * satırı yeşile dönerdi.
 *
 * Uygulanan kural ikisini de karşılar:
 *   * negatif ⇒ kırmızı (HP:155 — emrin açıkça alıntıladığı satır);
 *   * pozitif ⇒ `Tür` rengini izler, yani `asset`/`revenue` yeşil (HP:79/193 —
 *     emrin "pozitif yeşil"i tam olarak bu satırlarda doğrudur),
 *     `liability`/`expense` kırmızı (HP:167/200).
 */
export function balanceTone(value: string | null, accountType: ChartAccountType): BalanceTone {
  // IZN-F4b.2 — `null` (gizli) işaretsizdir: negatif sayılmaz, `Tür` rengini izler.
  const amount = value === null ? Number.NaN : Number(value);
  if (Number.isFinite(amount) && amount < 0) return "danger";
  return accountTypeVariant(accountType) === "success" ? "success" : "danger";
}

// --- Kontra göstergesi (`is_contra`) -------------------------------------

/**
 * 🔴 K5 · `is_contra`nın EKRANDAKİ tek görünür sonucu.
 *
 * Bayrak forma eklendi (K6/K7) ama liste onu OKUMADIĞI sürece kullanıcı yanlış
 * işaretlediğini asla göremez ve yanlış işaretlenmiş hesabı listede BULAMAZ.
 *
 * 🔴 `Bakiye` sütunu kontra BİLMEZ ve bilmeyecek: sunucunun bakiyesi ham
 * borç−alacak farkıdır (`balance.py:52-57`), işaret çevirimi YALNIZ bilanço
 * derlemesinde yapılır (`balance_sheet.py:180`). Yani bu rozet bakiyeyi
 * yorumlamaz, sadece "bu hesabın kalemi ters tarafta durur" der.
 *
 * Metin mockup'ın kendi dilidir: HP:154 hesap ADI `Birikmiş Amortismanlar (-)`
 * yazar — TDHP'nin kontra işareti ASCII `(-)`dir. Rozet o işareti hesap adının
 * içinden çıkarıp KODUN yanına, her kontra hesapta AYNI yere taşır (adında
 * `(-)` geçmeyen bir kontra hesap da işaretli görünsün diye).
 */
export const CONTRA_BADGE_TEXT = "(-)";

/** Renk/sembol TEK BAŞINA bilgi taşımaz — rozetin okunur bir adı olmalıdır. */
export const CONTRA_BADGE_LABEL = "Kontra hesap";

/**
 * Rozetin rengi NÖTRdür.
 *
 * 🔴 Kontra bir HATA ya da uyarı değil, hesabın yapısal özelliğidir. Yeşil ve
 * kırmızı bu ekranda ZATEN `Tür`ün (ve bakiyenin) anlamını taşıyor; üçüncü bir
 * renkli rozet aynı satırda hangi rengin neyi söylediğini belirsizleştirirdi.
 */
export const CONTRA_BADGE_VARIANT: BadgeVariant = "neutral";

// --- Sınıf bantları (HP:68-69 · 134-135 · 160-161 · 186-187) -------------

export type ClassBandTheme = "1" | "2" | "3" | "5" | "neutral";

/**
 * 🔴 Bant SUNUCUDAN GELMEZ. `ChartAccountResponse` yalnız `class_code` (kodun
 * ilk hanesi) taşır; `SINIF 1 — DÖNEN VARLIKLAR` bir sunucu alanı DEĞİL,
 * HP:69'un metnidir. Etiket burada, istemcide kurulur.
 */
const CLASS_BAND_LABELS: Record<string, string> = {
  "1": "SINIF 1 — DÖNEN VARLIKLAR", // HP:69
  "2": "SINIF 2 — DURAN VARLIKLAR", // HP:135
  "3": "SINIF 3 — KISA VADELİ YÜKÜMLÜLÜKLER", // HP:161
  // 🔴 HP:187 BİREBİR KOPYALANMAZ — ONAYLI SAPMA. Mockup o bandı `SINIF 5 —
  // GELİR TABLOSU HESAPLARI` yazıp ALTINA `600`/`730`/`760` dizer, yani etiket
  // bandın KENDİ satırlarıyla çelişir (sınıf 6 ve 7). Sınıf 5 TDHP'de
  // ÖZKAYNAKLAR'dır: canlı tohum `500 Sermaye`/`501 Ödenmemiş Sermaye (-)`/
  // `570 Geçmiş Yıllar Kârları`yı `equity` olarak basar
  // (`chart_seed_data.py:372` yorumu da `# SINIF 5 — ÖZKAYNAKLAR` der) ve
  // Bilanço ekranı aynı hesapları `III. ÖZKAYNAKLAR` altında gösterir.
  // Şemanın K15 notu kararı zaten vermiştir: **satırlar kazanır**, bant bir
  // sunucu alanı değildir. Mockup'ın etiketi basılsaydı aynı ekran kendini
  // yalanlardı: bant "gelir tablosu", satırın `Tür` sütunu "Özkaynak".
  // 🔴 `6` için bant EKLENMEZ: çizilmemiş sınıfta başlık icat edilmez (aşağı),
  // `SINIF 6 — GELİR TABLOSU HESAPLARI` bir MOCKUP/KULLANICI kararıdır.
  "5": "SINIF 5 — ÖZKAYNAKLAR",
};

/**
 * 🔴 Mockup'ta ÇİZİLMEMİŞ bir sınıf (`4`, `6`, `7`, `8`, `9`) BAŞLIK İCAT
 * ETTİRMEZ. Kod `9` ile başlayan bir hesap açılabilir (sunucu `[1-9]` kabul
 * eder) ve "SINIF 9 — NAZIM HESAPLAR" uydurmak, hiçbir mockup'ın söylemediği
 * bir muhasebe planını ekrana kalıcı olarak yazmak olurdu. Düz `SINIF N`
 * basılır.
 */
export function classBandLabel(classCode: string): string {
  return CLASS_BAND_LABELS[classCode] ?? `SINIF ${classCode}`;
}

/** Çizilmemiş sınıf NÖTR (slate) temaya düşer — dördünün renkleri ödünç ALINMAZ. */
export function classBandTheme(classCode: string): ClassBandTheme {
  return classCode === "1" || classCode === "2" || classCode === "3" || classCode === "5"
    ? classCode
    : "neutral";
}

// --- Satır akışı ---------------------------------------------------------

/**
 * Girinti adımı sayısı. `level` 1 = grup, 2 = ana hesap, 3 = alt hesap
 * (`codes.py`: `10` → 1, `100` → 2, `120.01` → 3).
 *
 * 🔴 GÖREV EMRİNDEN SAPMA: emir HP:76'yı (`100 Kasa`, 32px girintili TAM veri
 * satırı) `level === 3` sayıyordu ve `level === 2`yi grup satırı yapıyordu.
 * Sunucunun `codes.level()` fonksiyonu `100`ü **2** döndürür — yani emrin
 * kuralı uygulansaydı HP'nin ÇİZDİĞİ her yaprak (`100`,`120`,`150`,`191`,
 * `252`,`320`,`600`,`730`,`760` — mockup'taki bütün bakiyeli satırlar) grup
 * satırına dönüşür ve Tür/Bakiye/Durum sütunlarını KAYBEDERDİ.
 *
 * Uygulanan kural mockup'ın çizdiğidir: grup YALNIZ `level === 1`
 * (HP:71-73 `10`, 96-98 `12`, 114-116 `15`); `level >= 2` tam veri satırıdır.
 * Emrin 16px'lik ölçekleme fikri korunur — adım 16px, `level 2` = 2 adım =
 * 32px (HP:76'nın ölçtüğü değer), `level 3` = 3 adım = 48px.
 */
export const MAX_INDENT_STEPS = 3;

export function indentSteps(level: number): number {
  if (!Number.isFinite(level) || level < 2) return 0;
  return Math.min(Math.trunc(level), MAX_INDENT_STEPS);
}

export type ChartRow =
  | {
      readonly kind: "class";
      readonly key: string;
      readonly classCode: string;
      readonly label: string;
      readonly theme: ClassBandTheme;
    }
  | { readonly kind: "group"; readonly key: string; readonly account: ChartAccountResponse }
  | {
      readonly kind: "account";
      readonly key: string;
      readonly account: ChartAccountResponse;
      readonly indent: number;
      /**
       * K5 · kontra rozeti basılacak mı. Bayrak burada, SAF katmanda okunur;
       * bileşen `account.is_contra`ya kendi başına uzanmaz ki gösterge birim
       * testiyle bekçilenebilsin.
       */
      readonly isContra: boolean;
    };

/**
 * Düz listeyi bantlı akışa çevirir.
 *
 * 🔴 İSTEMCİDE YENİDEN SIRALAMA YOKTUR: sunucu `code ASC` döner ve sayfalama
 * o sıraya göre kesilir; istemcide yeniden sıralamak, ikinci sayfanın ilk
 * satırını birinci sayfanın ortasına taşımak olurdu. Bant yalnızca
 * `class_code` DEĞİŞTİĞİNDE açılır — aynı sınıf ikiye bölünmüş gelirse
 * (ki `code ASC` altında gelmez) iki bant basılır, satırlar taşınmaz.
 */
export function buildChartRows(
  accounts: readonly ChartAccountResponse[] | undefined,
): readonly ChartRow[] {
  if (accounts === undefined) return [];
  const rows: ChartRow[] = [];
  let previousClass: string | null = null;
  for (const account of accounts) {
    if (account.class_code !== previousClass) {
      previousClass = account.class_code;
      rows.push({
        kind: "class",
        key: `class-${account.class_code}-${account.id}`,
        classCode: account.class_code,
        label: classBandLabel(account.class_code),
        theme: classBandTheme(account.class_code),
      });
    }
    rows.push(
      account.level === 1
        ? { kind: "group", key: account.id, account }
        : {
            kind: "account",
            key: account.id,
            account,
            indent: indentSteps(account.level),
            isContra: account.is_contra,
          },
    );
  }
  return rows;
}
