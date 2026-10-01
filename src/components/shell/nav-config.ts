import {
  DashboardIcon,
  InboxIcon,
  BarChartIcon,
  BuildingIcon,
  CalendarCheckIcon,
  CalendarIcon,
  UserIcon,
  TruckIcon,
  BoxIcon,
  CartIcon,
  FileTextIcon,
  BankIcon,
  WalletIcon,
  ClockIcon,
  TrendingUpIcon,
  ListIcon,
  FolderIcon,
  SparkleIcon,
  CalculatorIcon,
  BooksIcon,
} from "@/components/ui/icons";
import { isActivePath } from "@/lib/shell/isActive";
import { routes } from "@/lib/routes";

export type NavItem = {
  label: string;
  href: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
};
export type NavGroup = { heading: string; items: NavItem[] };

// Kabuk sol menusu — canon: Ekran 1, BES duz grup (F-NAVSAHA'ya kadar DORTtu;
// `Saha & İK` kullanici karariyla `Saha` + `İK` olarak ikiye ayrildi).
// Yapilmamis rotalar [...slug] catch-all ile ComingSoon'a duser.
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Genel",
    items: [
      { label: "Gösterge Paneli", href: "/", Icon: DashboardIcon },
      { label: "Onay Kutusu", href: routes.approvalInbox(), Icon: InboxIcon },
      // AI-1 · FİİL AI Asistanı. Mockup (`AI Chat.dc.html`) kabuk sol menüsünü
      // ÇİZMEZ (kendi sohbet-geçmişi sütununu çizer), bu yüzden konum kabuk
      // canon'undan seçildi: "Genel" grubu tek bir modüle ait olmayan çapraz
      // yüzeylerin yeridir (Gösterge Paneli · Onay Kutusu · Raporlar) ve asistan
      // da tam olarak öyledir. Rota GERÇEKTİR (`/asistan`), ComingSoon DEĞİL.
      { label: "FİİL AI", href: routes.assistant(), Icon: SparkleIcon },
      { label: "Raporlar", href: routes.reports(), Icon: BarChartIcon },
      { label: "Projeler", href: routes.projects.list(), Icon: BuildingIcon },
    ],
  },
  // 🔴 F-NAVSAHA · KULLANICI KARARI 2026-09-05 (tartışılmaz): tek `Saha & İK`
  // grubu İKİYE ayrıldı — *"ik ve saha kısmını ayır; ik'da sadece personel
  // olsun, saha kısmında da puantaj, makine ekipman ve günlük kayıt olacak"*.
  //
  // Bu bir SAPMADIR ve ölçüldü: mockup'ların sol menüsü `Saha & İK`ı TEK grup
  // çizer ve `Günlük Kayıt`ı sol menüde HİÇ çizmez (`Ekran 7 - Şantiye
  // Günlüğü Girişi.dc.html` 30-60 · `Şantiye - Günlük Kayıt.dc.html`: ikisinde
  // de `Saha & İK` → Puantaj · Personel · Makine & Ekipman). Kullanıcı kararı
  // mockup'ı EZER; gerekçe burada durur ki bir sonraki tur bunu "mockup'tan
  // sapma kusuru" sanıp geri almasın.
  //
  // Grup SIRASI: `Saha` bugünkü `Saha & İK`ın yerini alır, `İK` hemen ardına
  // girer — öğe sırası kullanıcının saydığı sıradır.
  {
    heading: "Saha",
    items: [
      { label: "Puantaj", href: routes.timesheet(), Icon: CalendarCheckIcon },
      { label: "Makine & Ekipman", href: routes.equipment.list(), Icon: TruckIcon },
      // Rota GERÇEKTİR (`/gunluk-kayit`), ComingSoon DEĞİL — bu dilimde
      // yazıldı. Ekran daha önce YALNIZ şantiye altında yaşıyordu
      // (`.../santiyeler/[siteId]/gunluk-kayit`); kök ikizi `/puantaj` ↔
      // `Şantiye › Puantaj` çiftinin aynı deseniyle açıldı.
      //
      // Simge `CalendarIcon`: settedeki 33 glif ölçüldü, `ClipboardIcon` diye
      // bir glif YOK (yeni glif İCAT EDİLMEDİ). `CalendarIcon` kabuk nav'ında
      // HİÇ kullanılmıyordu, yani tekrara gerek kalmadı; kardeşi
      // `CalendarCheckIcon` Puantaj'ındır ve ikisi aynı grupta tutarlı okunur:
      // Puantaj = günün TEYİDİ (takvim + tik), Günlük Kayıt = günün KAYDI
      // (takvim). Ekran zaten gün eksenlidir (`derive.ts · isoDate`).
      { label: "Günlük Kayıt", href: routes.siteDiary(), Icon: CalendarIcon },
    ],
  },
  {
    heading: "İK",
    items: [{ label: "Personel", href: routes.personnel.list(), Icon: UserIcon }],
  },
  // PLN-F1 · K21 — mockup'ların sol menüsü `Planlama`yı `Saha & İK` ile
  // `Stok & Satınalma` arasına çizer (Planlama - Panel.dc.html:57-61); kodda
  // o yer `İK` ile `Stok & Satınalma` arasıdır. 🔴 Öğe EKRANIYLA gelir
  // (§3.10 F0-10, PLN-F1.3 §0-B): F1'de yalnız Bütçe + Katalog; PLN-F3.6b'de
  // Panel · Günlük İlerleme Raporu · Haftalık QURR K21 sırasındaki yerlerine
  // eklendi: Panel · Adam-Saat Bütçesi · Günlük İlerleme Raporu · Haftalık
  // QURR · Birim Oran Kataloğu.
  //
  // Etiketler kırıntı ağacıyla (`breadcrumb/route-tree.ts` `planlama.*`)
  // BİREBİR aynıdır — "etiket tutarlılığı" bekçisi (`trail.test.ts`) bunu
  // zorunlu kılar; lider görevindeki kısa/gündelik adlar ("Panel", "Günlük
  // Rapor") konuşma dilidir, ekranın kendi h1'i ve kırıntısı UZUN addır.
  //
  // Simgeler settedeki mevcut glif setinden (yeni glif İCAT EDİLMEDİ):
  //   Planlama Paneli → `TrendingUpIcon` (KPI/eğri panosu; Mali Tablolar'la
  //     PAYLAŞILIR, kabuk canonunda zaten tekrar eden simge deseni var).
  //   Günlük İlerleme Raporu → `FileTextIcon` (rapor/belge; Sözleşmeler ve
  //     Fatura Yönetimi ile PAYLAŞILIR).
  //   Haftalık QURR → `BarChartIcon` (grafik ağırlıklı haftalık özet;
  //     "Raporlar" (Genel grubu) ile PAYLAŞILIR — QURR da S-eğrisi/PF
  //     grafikleri taşıyan bir rapor kalemidir).
  {
    heading: "Planlama",
    items: [
      { label: "Planlama Paneli", href: routes.planning.panel(), Icon: TrendingUpIcon },
      { label: "Adam-Saat Bütçesi", href: routes.planning.budget(), Icon: CalculatorIcon },
      { label: "Günlük İlerleme Raporu", href: routes.planning.dailyReport(), Icon: FileTextIcon },
      { label: "Haftalık QURR", href: routes.planning.weeklyReport(), Icon: BarChartIcon },
      { label: "Birim Oran Kataloğu", href: routes.planning.catalog(), Icon: BooksIcon },
      // TKL-F1.3 · ÜS-14: rozet YOK, izinle süzülmez; simge settedeki `ListIcon` (Bordro ile paylaşılır).
      { label: "İş Kalemi Kataloğu", href: routes.planning.workItemCatalog(), Icon: ListIcon },
    ],
  },
  {
    heading: "Stok & Satınalma",
    items: [
      { label: "Stok & Depo", href: routes.stock(), Icon: BoxIcon },
      { label: "Satınalma & Teklif", href: routes.purchasing.root(), Icon: CartIcon },
    ],
  },
  {
    heading: "Sözleşme & Mali",
    items: [
      { label: "Sözleşmeler", href: routes.contracts.list(), Icon: FileTextIcon },
      // F-P8 T2: SY (`Satış Yönetimi.dc.html` 40) mockup'ın PROJE bloğunda
      // çizilir; kabuk canon'unda karşılığı YOKTU — ünite satışı/tahsilatı
      // mali bir yüzey olduğu için "Sözleşme & Mali" grubuna, sözleşmelerin
      // hemen ardına eklendi. Rota GERÇEKTİR (`/satis`), ComingSoon DEĞİL;
      // nav href guard testi bunu ayrıca doğrular.
      { label: "Satış Yönetimi", href: routes.sales.root(), Icon: BuildingIcon },
      { label: "Muhasebe", href: routes.accounting.root(), Icon: BankIcon },
      // F-FAT2 T2: FY (`Fatura Yönetimi.dc.html` 39) mockup'ın "Mali" bloğunda
      // Muhasebe'nin hemen ardında durur; rota GERÇEKTİR (`/faturalar`),
      // ComingSoon DEĞİL.
      { label: "Fatura Yönetimi", href: routes.invoices.list(), Icon: FileTextIcon },
      { label: "Hazine", href: routes.treasury.root(), Icon: WalletIcon },
      // 🔴 F-UNIT1 T4 · ÖLÜ EKRAN DÜZELTMESİ. `/hazine/cek-senet` (E10 · Çek &
      // Ödeme) sayfası, görünümü, 401 satırlık testi ve 2 görsel karesiyle
      // AYLARDIR duruyordu ama repoda ona giden TEK BİR `Link`/`push` YOKTU:
      // ekran yalnız elle URL yazılarak açılabiliyordu.
      //
      // Konumu mockup ölçüldü: DÖRT fatura mockup'ının da sol menüsünde
      // `💳 Çek & Ödeme` bir NAV ÖĞESİDİR, başka ekrandaki bir düğme değil
      // (`Fatura Yönetimi.dc.html` 44 · `Fatura - Gelen Detay` 39 ·
      // `Fatura - Kes` 39 · `Fatura - Giden Detay` 40). Komşuları da oradan
      // gelir: FY 43 `🏦 Hazine`, FY 45 `📊 Mali Tablolar` — yani Hazine'nin
      // HEMEN ARDINDA. Ekranın kendi breadcrumb'ı da bunu doğruluyor
      // ("Hazine · Çek & Senet Yönetimi", E10:62) ve rota zaten `/hazine`
      // altında yaşıyor.
      //
      // Simge `WalletIcon`: mockup'ın emojisi 💳 bir karttır ve settedeki tek
      // kart/cüzdan glifi budur (üçüncü path yuvasına sokulmuş kartı çizer).
      // Paylaşılan simge burada BİLGİ de taşır — bu ekran Hazine'nin alt
      // yüzeyidir. Simge tekrarı kabuk canonunda zaten var (`BuildingIcon` ×3,
      // `FileTextIcon` ×2); yeni glif İCAT EDİLMEDİ.
      { label: "Çek & Ödeme", href: routes.treasury.financialInstruments(), Icon: WalletIcon },
      { label: "Hakedişler", href: routes.progressPayments.list(), Icon: ClockIcon },
      { label: "Mali Tablolar", href: routes.financialStatements.root(), Icon: TrendingUpIcon },
      { label: "Bordro", href: routes.payroll.root(), Icon: ListIcon },
      { label: "Şirket Varlıkları", href: routes.companyAssets(), Icon: BuildingIcon },
      // F-BC T4: Ekran 12 gerçek rotasıdır (`/belgeler`) — ComingSoon'dan çıktı.
      // Eski `/belge-arsivi` href'i hiç yazılmamış bir rotaydı; nav href guard
      // testi bu öğenin gerçek bir sayfaya düştüğünü ayrıca doğrular.
      { label: "Belge Arşivi", href: routes.documents(), Icon: FolderIcon },
    ],
  },
];

/**
 * 🔴 F-UNIT1 T4 · ÇİFT AKTİFLİK BEKÇİSİ. `Çek & Ödeme` kabuk nav'ındaki İLK
 * iç içe href'tir (`/hazine/cek-senet`, `/hazine`in altı). `isActivePath` bir
 * PREFİX kuralıdır: `/hazine/cek-senet` yolunda hem `Hazine` hem `Çek & Ödeme`
 * eşleşir, yani sidebar'da İKİ öğe birden mavi yanar ve aynı `<nav>` içinde
 * İKİ `aria-current="page"` basılır. Muhasebe drill-in nav'ı aynı tuzağa
 * `exact` bayrağıyla çözüm bulmuştu (F-SD T7 dersi); kabukta bayak yerine
 * EN UZUN EŞLEŞME seçilir — bayrak unutulabilir, uzunluk kuralı yeni iç içe
 * rotalarda kendiliğinden doğru davranır ve nav'da karşılığı OLMAYAN bir alt
 * rotada (`/hazine/baska-sey`) üst öğeyi aktif tutmaya devam eder.
 *
 * Bugünkü davranış DEĞİŞMEZ: `Çek & Ödeme` dışında hiçbir nav href'i bir
 * başkasının öneki değildir, yani her yolda eşleşme kümesi en fazla tektir.
 */
export function activeNavHref(pathname: string): string | undefined {
  let best: string | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isActivePath(pathname, item.href)) continue;
      if (best === undefined || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/**
 * 🔴 F-NAVSAHA · ÜST-ETİKET (eyebrow) NAV'DAN TÜRER, KOPYALANMAZ.
 *
 * Canon `ReportsCatalogView`de yazılıydı: *"Metin KOPYALANMAZ, nav'dan TÜRER:
 * grup yeniden adlandırılırsa bu satır kendiliğinden ona uyar."* Ama dört ekran
 * onu ELLE yazıyordu (`Saha &amp; İK`) ve grup ikiye ayrılınca sol menü `İK`
 * derken Personel sayfası hâlâ `Saha & İK` dedi.
 *
 * Bu kusuru GÖRSEL KAPI YAKALAYAMAZ: etiket zaten öyle yazıyordu, yani içerik
 * baytı değişmiyordu. Yakalayan tek şey türetmenin KENDİSİdir — bu yardımcı
 * çağrıldığı sürece grup adı/üyeliği değişince etiket kendiliğinden düzelir.
 *
 * Ekranın nav href'ini verir, o href'i taşıyan grubun başlığını alır.
 */
export function navGroupHeadingFor(href: string): string | undefined {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.href === href))?.heading;
}

// Slug'dan modul adi: once nav'da ara, yoksa baslik-case fallback.
export function moduleNameForSlug(slug: string): string {
  const href = "/" + slug;
  for (const group of NAV_GROUPS) {
    const found = group.items.find((i) => i.href === href);
    if (found) return found.label;
  }
  return slug
    .split("-")
    .map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1))
    .join(" ");
}
