import { isActivePath } from "@/lib/shell/isActive";
import { navGroupHeadingFor } from "@/components/shell/nav-config";
import { routes } from "@/lib/routes";

/**
 * F-MUP T1 · Muhasebe modül SEKMELERİ — kanon `Muhasebe - Profesyonel.dc.html`
 * (MP), yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * 🔴 **KK-10 (bağlayıcı kullanıcı kararı, 2026-08-26):** `Muhasebe -
 * Profesyonel` mockup'ı `Ekran 8 - Muhasebe`in YERİNE geçer. Bunun NAVİGASYON
 * sonucu ölçüldü: MP'nin kendi sol menüsü (MP:36-72) DÜZ KABUKTUR — F-MU1'in
 * çizdiği girintili drill-in listesi MP'de YOKTUR. Modül sekmeleri sol
 * menüden çıkıp SAYFA İÇİ hap şeridine (MP:105-112) taşındı.
 *
 * Bu dosya bu yüzden artık bir SIDEBAR yapılandırması değil, bir SEKME
 * yapılandırmasıdır. `MuhasebeSidebar` + `accounting-shell.css` KALDIRILDI;
 * DOM'u `AccountingTabs.tsx` basar.
 *
 * 🔴 KABUK NAV'INA HİÇBİR ÖĞE EKLENMEZ/ÇIKARILMAZ (`shell/nav-config.ts`
 * dokunulmadı): drill sidebar'ın taşıdığı iki kardeş modül (`Hazine` ·
 * `Mali Tablolar`) zaten kabuk nav'ında yaşıyor (ölçüldü:
 * `shell/nav-config.ts:92` + `/hazine`), bu yüzden sidebar'ın kalkması
 * hiçbir yolu ULAŞILAMAZ bırakmaz.
 */

/** MP:101 — sayfa üstündeki breadcrumb metni. */
// NAV-F1: kabuk nav grubundan türetilir (KARARLAR.md b1974d8 — grup adı "Mali"); elle yazılırsa kayar.
export const ACCOUNTING_NAV_HEADING = navGroupHeadingFor(routes.accounting.root()) ?? "Mali";

/** MP:103 — modül başlığı. */
export const ACCOUNTING_NAV_PARENT = "Muhasebe";

export type AccountingNavItem =
  | {
      readonly kind: "link";
      readonly label: string;
      readonly href: string;
      /**
       * `true` ⇒ yalnız TAM eşleşmede aktif.
       *
       * 🔴 F-SD T7 DERSİ (sekme şeridinde de AYNEN geçerli): `/muhasebe` kök
       * sekmesi `exact` DEĞİLSE `isActivePath` onu `/muhasebe/mizan`de de
       * aktif sayar (prefix kuralı) ve şeritte İKİ hap birden beyaz yanar.
       * Kullanıcı hangi sekmede olduğunu okuyamaz.
       */
      readonly exact: boolean;
    }
  | {
      readonly kind: "disabled";
      readonly label: string;
      /**
       * 🔴 EKRANDA GÖRÜNÜR gerekçe (kanon: devre dışı basılan her öğe görünür
       * ve GERÇEK bir gerekçe taşır). Şerit dar olduğu için hap'ın ALTINDA
       * değil, şeridin altındaki tek bir not satırında toplanır — ama yine
       * `title`da SAKLANMAZ.
       */
      readonly reason: string;
    };

/**
 * MP:106-111 — mockup'ın çizdiği ALTI sekme + ölçülmüş BİR EK (aşağıdaki
 * `Dönem Kapanışı` notu).
 */
export const ACCOUNTING_TABS: readonly AccountingNavItem[] = [
  // MP:106 — etiket mockup'ta `Yevmiye`dir (`Yevmiye Defteri` DEĞİL; o,
  // sayfanın İÇİNDEKİ panelin başlığıdır, MP:141). Kök `exact`tir.
  { kind: "link", label: "Yevmiye", href: routes.accounting.root(), exact: true },
  // MP:107
  { kind: "link", label: "Hesap Planı", href: routes.accounting.chartOfAccounts(), exact: false },
  // MP:108
  { kind: "link", label: "Mizan", href: routes.accounting.trialBalance(), exact: false },
  // MP:109 — 🔴 KK-10 bu sekmeyi AÇIKÇA bu ekrana bağlıyor. Ekranın ne kadarı
  // canlı, ne kadarı devre dışı: `BankReconciliationView` başlığındaki ölçüm.
  {
    kind: "link",
    label: "Banka Mutabakatı",
    href: routes.accounting.bankReconciliation(),
    exact: false,
  },
  // MP:110 — GİB entegrasyonu KULLANICI KARARIYLA ertelendi; uç YOK.
  // Sekme SİLİNMEZ, devre dışı + görünür gerekçeyle basılır.
  {
    kind: "disabled",
    label: "e-Fatura",
    reason: "e-Fatura/GİB entegrasyonu ertelendi (kullanıcı kararı).",
  },
  // MP:111
  { kind: "link", label: "KDV Beyanı", href: routes.accounting.vatReturn(), exact: false },
  // 🔴 MOCKUP SAPMASI (F-MUP, bildirildi) — `Dönem Kapanışı` MP'nin sekme
  // şeridinde YOKTUR. Ekran F-DKAP ile AÇILDI, canlıdır ve kendi mockup'ı
  // (`Muhasebe - Dönem Kapanışı.dc.html`) vardır. Sırf MP çizmiyor diye
  // sekmeden düşürülseydi ÇALIŞAN bir ekran yalnız URL yazarak ulaşılır
  // hâle gelirdi — emirdeki "var olan çalışan ekranları sebepsiz bozma"
  // kuralının tam ihlali. MP'nin boşluğu, F-MU1'in `hesap-plani` için
  // ölçtüğü boşlukla AYNI SINIFTADIR.
  {
    kind: "link",
    label: "Dönem Kapanışı",
    href: routes.accounting.periodClosing(),
    exact: false,
  },
];

/** Aktiflik kararı — `exact` bayrağı `isActivePath`in prefix kuralını EZER. */
export function isAccountingNavItemActive(
  pathname: string,
  item: AccountingNavItem,
): boolean {
  if (item.kind !== "link") return false;
  return item.exact ? pathname === item.href : isActivePath(pathname, item.href);
}

/**
 * Verili yolda aktif görünen sekmelerin etiketleri. Testin "AYNI ANDA KAÇ
 * sekme aktif" sorusunu sorabilmesi için vardır (çift aktiflik bekçisi).
 */
export function activeAccountingNavLabels(pathname: string): readonly string[] {
  return ACCOUNTING_TABS.filter((item) => isAccountingNavItemActive(pathname, item)).map(
    (item) => item.label,
  );
}

/**
 * Devre dışı sekmelerin gerekçeleri — şeridin ALTINDA tek satırda basılır.
 * Şeridin kendisi dar olduğu için her hap'ın altına ayrı bir not koymak
 * ızgarayı bozardı; gerekçe yine de EKRANDADIR.
 */
export function disabledTabReasons(): readonly string[] {
  return ACCOUNTING_TABS.filter((item) => item.kind === "disabled").map(
    (item) => `${item.label}: ${item.reason}`,
  );
}
