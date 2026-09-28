/**
 * F-KIRINTI · pathname → kırıntı DİZİSİ (saf yürüyüş).
 *
 * Bu modül React'e, önbelleğe ve DOM'a DOKUNMAZ: girdi bir yol ve çözülmüş
 * adlar, çıktı bir `Crumb[]`. Geri tuşunun hedefi de buradan türer (K2) —
 * yani "kırıntı ne diyorsa geri tuşu oraya gider" bir gerekçe değil, tek bir
 * fonksiyonun sonucudur ve ikisi ayrışamaz.
 */
import { routes } from "@/lib/routes";

import { moduleNameForSlug } from "../nav-config";
import { ROUTE_TRAIL_ROOT } from "./route-tree";
import { EMPTY_KEYS, type NamedEntity, type ParamName, type RouteKeys, type TrailNode } from "./trail-node";

export interface Crumb {
  /** Ekranda basılacak metin; `pending` ise ekran okuyucuya okunan yedek. */
  readonly label: string;
  /** Bağlantı hedefi. Son parçada da doludur; BAĞLANTI KURMA kararı görünümde. */
  readonly href?: string;
  /**
   * Ad henüz çözülmedi → iskelet basılır.
   *
   * 🔴 K6: ham UUID/slug BASILMAZ. `/projeler/a1b2-…` yolunda kırıntının
   * "a1b2-…" yazması kullanıcıya bir şey SÖYLEMEZ ve ad gelince metin
   * boyunca zıplar; iskelet ikisini de yapmaz.
   */
  readonly pending: boolean;
}

export interface CrumbNames {
  readonly project?: string;
  readonly site?: string;
  readonly section?: string;
  /** DET-1.2 — günlük kaydın tarihi ("24.09.2026"). */
  readonly diaryEntry?: string;
  /**
   * Adı ÇÖZÜLEMEYEN türler (sorgu hata verdi: 404 / 403 / kopuk ağ).
   *
   * 🔴 İskeletin ÜÇÜNCÜ hâli. `pending` "henüz gelmedi" demektir ve bir gün
   * gelmesi beklenir; hata almış bir sorgunun adı ASLA gelmeyecektir, o
   * yüzden sonsuza kadar shimmer basmak yalan olur. Bu küme o farkı taşır:
   * içindeki tür yedek etiketine ("Şantiye") düşer, iskelete değil.
   */
  readonly unresolved?: ReadonlySet<NamedEntity>;
}

/** Kök rota (`/`) — kabuk nav'ının ilk öğesiyle AYNI etiket (bekçi doğrular). */
const HOME_LABEL = "Gösterge Paneli";

/**
 * 🔴 ÇİFT KODLAMA TUZAĞI — bu dilimde ÖLÇÜLEREK yakalandı.
 *
 * URL-3 sonrası yol segmentleri SLUG'dur ve slug Türkçe karakter içerebilir
 * (`/projeler/kopru-guclendirme` masum, `/projeler/köprü` değil). Tarayıcı
 * adres çubuğunda o segment YÜZDE KODLU durur (`k%C3%B6pr%C3%BC`) ve
 * `usePathname` onu o hâliyle verebilir. `routes.ts`in `seg()` yardımcısı ise
 * her segmenti `encodeURIComponent`ten geçirir — kodlanmış bir metni İKİNCİ
 * kez kodlamak `%` işaretini `%25` yapar ve kırıntı SESSİZCE bozuk bir link
 * üretirdi (`k%25C3%25B6...`), kusur ancak tıklanınca görülürdü.
 *
 * Çözüm anahtarı SAKLARKEN çözmektir: üretici zaten kodlayacaktır. Kodlanmamış
 * gelen segmentte çözme etkisizdir (no-op), tek yönlü bir kayıp yoktur.
 * Bozuk bir yüzde dizisi (`%zz`) `decodeURIComponent`i FIRLATIR — o durumda
 * segment olduğu gibi taşınır, kırıntı çökmez.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function segmentsOf(pathname: string): string[] {
  // Sorgu dizesi ve çapa kırıntıya girmez; `usePathname` zaten vermez ama
  // fonksiyon saf olduğu için testler ve gelecekteki çağıranlar için ayıklanır.
  const withoutQuery = pathname.split("?")[0].split("#")[0];
  return withoutQuery.split("/").filter((segment) => segment.length > 0);
}

interface Step {
  readonly node: TrailNode;
  readonly param?: ParamName;
}

/**
 * Bir segmentin gideceği çocuk düğüm.
 *
 * 🔴 `Object.hasOwn` ŞART. `children` düz bir nesne literalidir; `children[
 * "constructor"]` ya da `children["toString"]` prototipten DOLU döner ve
 * `/toString` gibi bir yol sessizce "eşleşmiş" sayılırdı. Bu bir teori değil:
 * `trail.test.ts` bunu mutasyonla ölçer.
 */
function childFor(node: TrailNode, segment: string): Step | undefined {
  if (node.children !== undefined && Object.hasOwn(node.children, segment)) {
    return { node: node.children[segment] };
  }
  if (node.dynamic !== undefined) {
    return { node: node.dynamic.node, param: node.dynamic.param };
  }
  return undefined;
}

/**
 * Yolun dinamik segmentlerini toplar (adları çözecek hook'un girdisi).
 *
 * Yürüyüş İKİ KEZ yapılır ve bu bilinçlidir: React kancaları koşullu
 * çağrılamaz, yani adlar İSTENMEDEN önce hangi anahtarların gerektiği
 * bilinmelidir. Yürüyüş saf ve O(segment) olduğu için maliyeti yoktur.
 */
export function routeKeysOf(pathname: string): RouteKeys {
  let node = ROUTE_TRAIL_ROOT;
  let keys = EMPTY_KEYS;
  for (const segment of segmentsOf(pathname)) {
    const step = childFor(node, segment);
    if (step === undefined) return keys;
    node = step.node;
    if (step.param !== undefined) keys = { ...keys, [step.param]: safeDecode(segment) };
  }
  return keys;
}

function crumbOf(node: TrailNode, keys: RouteKeys, names: CrumbNames): Crumb {
  const resolved = node.named === undefined ? undefined : names[node.named];
  const failed =
    node.named !== undefined && (names.unresolved?.has(node.named) ?? false);
  return {
    label: resolved ?? node.label ?? "",
    href: (node.href ?? node.crumbHref)?.(keys),
    pending: node.named !== undefined && resolved === undefined && !failed,
  };
}

/** DET-1.3 — adı çözülemeyen ve `omitWhenUnresolved` işaretli düğüm basılmaz. */
function isOmitted(node: TrailNode, names: CrumbNames): boolean {
  return node.omitWhenUnresolved === true && node.named !== undefined && (names.unresolved?.has(node.named) ?? false);
}

/**
 * Yazılmamış rotanın kırıntısı.
 *
 * 🔴 `[...slug]` catch-all'ı yüzünden bu uygulamada yazılmamış bir yol 404
 * DEĞİL 200 döner ve `ComingSoon` basılır. O ekran başlığını
 * `moduleNameForSlug(slug[0])` ile üretir (`app/(app)/[...slug]/page.tsx`) —
 * kırıntı da AYNI çağrıyı yapar. Yani kırıntı "yakında" ekranı için bir yol
 * UYDURMAZ; sayfanın kendi başlığını tekrarlar ve bağlantı basmaz (tek parça
 * = son parça = bağlantısız). "Raporlar" yolunda kullanıcı gerçekten Raporlar
 * yüzeyindedir; yüzey henüz yazılmamıştır, bu bir yalan değil bir durumdur.
 */
function comingSoonTrail(firstSegment: string): Crumb[] {
  return [{ label: moduleNameForSlug(firstSegment), pending: false }];
}

export function buildTrail(pathname: string, names: CrumbNames = {}): Crumb[] {
  const segments = segmentsOf(pathname);
  if (segments.length === 0) {
    return [{ label: HOME_LABEL, href: ROUTE_TRAIL_ROOT.href?.(EMPTY_KEYS), pending: false }];
  }

  let node = ROUTE_TRAIL_ROOT;
  let keys = EMPTY_KEYS;
  const crumbs: Crumb[] = [];
  for (const segment of segments) {
    const step = childFor(node, segment);
    if (step === undefined) return comingSoonTrail(segments[0]);
    node = step.node;
    if (step.param !== undefined) keys = { ...keys, [step.param]: safeDecode(segment) };
    if (isOmitted(node, names)) continue;
    if (node.href !== undefined || node.crumbHref !== undefined) crumbs.push(crumbOf(node, keys, names));
  }
  // 🔴 SON segmentin SAYFASI yoksa o adreste bir sayfa YOKTUR: yol yapısal bir
  // klasörde bitmiştir (`/projeler/<p>/santiyeler`) ve Next onu da `[...slug]`
  // catch-all'a düşürür. Kırıntı orada üst parçaları basmaya devam etseydi
  // "Projeler / Güneşkent Konut" derdi ama ekranda "Projeler — yakında"
  // yazardı; kırıntı ekrandan BAŞKA bir şey söyleyemez.
  return node.href === undefined ? comingSoonTrail(segments[0]) : crumbs;
}

/**
 * Geri tuşunun hedefi — K2: TARAYICI GEÇMİŞİ DEĞİL, "bir seviye yukarı".
 *
 * 🔴 `router.back()` YASAKTIR ve gerekçesi ölçülebilir: kullanıcı derin bir
 * linkle (e-posta, WhatsApp, yer imi) geldiğinde bu sekmenin geçmişi BOŞTUR
 * ve tuş kullanıcıyı uygulamadan ÇIKARIR. Hedef bu yüzden yalnız YOLDAN
 * türer: aynı yol → her zaman aynı hedef, geçmişten bağımsız.
 *
 * Kırıntı tek parçaysa (kök rota, modül kökü, "yakında" ekranı) yukarısı
 * YOKTUR ve tuş BASILMAZ — devre dışı bir tuş basmak, gidilecek bir yer
 * varmış gibi görünürdü.
 *
 * 🔴 SEKME-F2 D2 (ÖLÇÜLDÜ) — bazı köklerin KENDİ sayfası yoktur, yalnız bir
 * alt sayfaya yönlendirirler (`/ayarlar` → `redirect(routes.settings.
 * users())`, `app/(app)/ayarlar/page.tsx`). `route-tree.ts`teki `ayarlar`
 * düğümünün `href`i YİNE DE `/ayarlar`ın KENDİSİDİR — URL-1 bekçisi
 * ("href taşıyan her düğümün href'i, o düğüme giden YOLUN KENDİSİDİR") bunu
 * ZORUNLU kılar (`routes.settings.users()`e taşımak DENENDİ, o bekçiyi
 * KIRDI — ÇÜRÜTÜLDÜ, `trail.test.ts` "URL-1"). Yani "Ayarlar" atasının
 * kırıntıdaki href'i (`/ayarlar`) ile TARAYICIDA GERÇEKTEN VARACAĞI sayfa
 * (`/ayarlar/kullanicilar`) FARKLI iki şeydir. Bu harita YALNIZ o farkı
 * `backTarget`e taşır, kırıntı LİNKİNİ (`route-tree.ts`) DEĞİŞTİRMEZ:
 * `/ayarlar/kullanicilar` sayfasındayken ata "Ayarlar"a tıklamak
 * yönlendirmeden geçip AYNI sayfaya döner — sahte bir "yukarı". Böyle bir
 * döngü, tuşun HİÇ basılmamasından daha kötüdür — devre dışı bırakılır.
 */
const ROOT_REDIRECT_TARGETS: Readonly<Record<string, string>> = {
  [routes.settings.root()]: routes.settings.users(),
};

export function backTarget(trail: Crumb[]): Crumb | undefined {
  const parent = trail[trail.length - 2];
  if (parent === undefined || parent.href === undefined) return undefined;
  const current = trail[trail.length - 1];
  const parentRealTarget = ROOT_REDIRECT_TARGETS[parent.href] ?? parent.href;
  if (current?.href !== undefined && current.href === parentRealTarget) return undefined;
  return parent;
}
