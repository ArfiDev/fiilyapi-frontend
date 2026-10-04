import { navGroupHeadingFor } from "@/components/shell/nav-config";
import { routes } from "@/lib/routes";
/**
 * F-MT T2 · Mali Tablolar segment yapılandırması (BL:24-31 kaynaklı).
 *
 * 🔴 Drill sidebar KALDIRILDI (kullanıcı kararı 2026-08-27, F-MALI dilimi):
 * `FinancialStatementsSidebar.tsx` ve onun ÖZEL kullandığı ihraçlar
 * (`FINANCIAL_NAV_PARENT`, `FINANCIAL_SIBLING_NAV`,
 * `isFinancialNavItemCurrent`, `isFinancialNavItemAncestor`,
 * `isFinancialNavItemMirrorCurrent`, `activeFinancialNavLabels`) bu turda
 * SİLİNDİ. Kalan ihraçlar `FinancialStatementsSegments.tsx` (üç ekranın
 * ortak segment denetimi) ve ekran kök bileşenleri tarafından hâlâ CANLI
 * kullanılıyor.
 *
 * 🔴 KABUK NAV'INA HİÇBİR ÖĞE EKLENMEZ (`nav-config.ts` dokunulmadı):
 * "Mali Tablolar" girdisi kabuk canon'undan beri duruyor.
 */

/** BL:25 — kök ekranda `mt-eyebrow` grup başlığı olarak basılır. */
// NAV-F1: kabuk nav grubundan türetilir (KARARLAR.md b1974d8 — grup adı "Mali"); elle yazılırsa kayar.
export const FINANCIAL_NAV_HEADING = navGroupHeadingFor(routes.financialStatements.root()) ?? "Mali";

export const FINANCIAL_STATEMENTS_URL = routes.financialStatements.root();
export const BALANCE_SHEET_URL = routes.financialStatements.balanceSheet();
export const CASH_FLOW_URL = routes.financialStatements.cashFlow();

export type FinancialNavItem =
  | {
      readonly kind: "link";
      readonly label: string;
      readonly href: string;
      /**
       * `true` ⇒ yalnız TAM eşleşmede CURRENT.
       *
       * 🔴 Muhasebe emsalinden FARKI: burada ÜST ÖĞE de bir bağlantıdır
       * (BL:27 `/mali-tablolar` kök ekranına gider). `exact` olmasaydı
       * `isActivePath`in prefix kuralı onu `/mali-tablolar/bilanco`da da
       * CURRENT sayardı ve sayfada İKİ `aria-current="page"` doğardı.
       */
      readonly exact: boolean;
    }
  | {
      /**
       * 🔴 F-NAVRETRY T2 (kullanıcı kararı, 2026-08-19) — ÜST ÖĞEYLE AYNI
       * HEDEFİ gösteren TIKLANABİLİR satır.
       *
       * `Gelir Tablosu` ekranı KÖKTE yaşar (E11 mockup'ı onu `/mali-tablolar`
       * olarak çiziyor; ayrı bir `/mali-tablolar/gelir-tablosu` rotası AÇILMAZ
       * — mockup'a aykırı olurdu). `mirrorsHref` üst öğenin `href`iyle
       * BİREBİR aynıdır ve `FinancialStatementsSegments` onu bir `Link`e
       * çevirir — satır tıklanınca kullanıcı üst öğeyle AYNI yere gider.
       *
       * 🔴 `kind` HÂLÂ `"mirror"`dur, `"link"` DEĞİL: segment denetimi
       * `aria-current` HİÇ BASMAZ (bkz. `FinancialStatementsSegments.tsx`),
       * bu yüzden bu ayrım artık yalnız `financialNavItemHref`in hedef
       * çözümlemesinde kullanılıyor.
       */
      readonly kind: "mirror";
      readonly label: string;
      readonly mirrorsHref: string;
    };

/** BL:28-30 — üst öğenin altındaki ÜÇ girintili alt sekme. */
export const FINANCIAL_SUB_NAV: readonly FinancialNavItem[] = [
  // BL:28 — 🔴 F-MT2 K3 (yönetim kararı A): uç AÇILDI (`GET /income-statement`)
  // ve ekran KÖKTE (`/mali-tablolar`) yaşıyor. F-NAVRETRY T2 (2026-08-19):
  // satır artık TIKLANABİLİR (üst öğenin hedefine giden bir `Link`), ama
  // `aria-current` hiç basılmaz (bkz. tip tanımı yorumu).
  {
    kind: "mirror",
    label: "Gelir Tablosu",
    mirrorsHref: FINANCIAL_STATEMENTS_URL,
  },
  // BL:29 — bu dilimin ekranı. `exact: true`: alt yolu yoktur ama kural
  // kardeşleriyle aynıdır ve üst öğeyle çift yanmayı yapısal olarak keser.
  { kind: "link", label: "Bilanço", href: BALANCE_SHEET_URL, exact: true },
  // BL:30 — kardeş görev (T3); backend ucu MT-1 ile canlıdadır.
  { kind: "link", label: "Nakit Akışı", href: CASH_FLOW_URL, exact: true },
];

/**
 * Öğenin HEDEF rotası — `link` için `href`, `mirror` için `mirrorsHref`.
 *
 * 🔴 İki `kind` da bir yere GİDER; ayrımları hedefte değil `aria-current`
 * davranışındadır. Segment denetimi (üç ekranın ortak geçişi) yalnız hedefi
 * sorar, bu yüzden `kind`a dallanmak zorunda kalmaz.
 */
export function financialNavItemHref(item: FinancialNavItem): string {
  return item.kind === "mirror" ? item.mirrorsHref : item.href;
}
