import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "../nav-config";
import { SETTINGS_NAV } from "@/components/settings/shell/settings-nav-config";
import { APP_DIR, buildRouteTree, type RouteNode } from "../route-tree.testkit";
import { ROUTE_TRAIL_ROOT } from "./route-tree";
import { backTarget, buildTrail, routeKeysOf } from "./trail";
import type { ParamName, TrailNode } from "./trail-node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(path.join(HERE, file), "utf8");

/**
 * Yorumları söker. Bekçilerin metin taraması KODA bakmalıdır: bu dosyaların
 * docstring'leri tam olarak yasakladıkları şeyleri (`router.back()`,
 * `/projeler/${id}`) örnek olarak YAZAR — yorum sökülmezse bekçi kendi
 * gerekçesini kusur sanardı (ve sahte-KIRMIZI verirdi).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/* ─── Ağaç yürüyüşü (yalnız bekçiler için) ────────────────────────────── */

const SENTINEL: Record<ParamName, string> = {
  projectId: "__PRJ__",
  siteId: "__SITE__",
  sectionId: "__SEC__",
  entityId: "__ENT__",
};

interface Visited {
  readonly segments: string[];
  readonly node: TrailNode;
}

function* walkTrailTree(node: TrailNode, prefix: string[]): Generator<Visited> {
  for (const [segment, child] of Object.entries(node.children ?? {})) {
    const segments = [...prefix, segment];
    yield { segments, node: child };
    yield* walkTrailTree(child, segments);
  }
  if (node.dynamic !== undefined) {
    const segments = [...prefix, SENTINEL[node.dynamic.param]];
    yield { segments, node: node.dynamic.node };
    yield* walkTrailTree(node.dynamic.node, segments);
  }
}

/** Dinamik segmentleri `*` yapar; ağaç ile dosya sistemi böyle kıyaslanır. */
function normalize(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      Object.values(SENTINEL).includes(segment) || /^\[.+\]$/.test(segment) ? "*" : segment,
    )
    .join("/");
}

/** `src/app/(app)` altındaki GERÇEK sayfaların yolları (elle liste DEĞİL). */
function realPagePaths(node: RouteNode, prefix: string[]): string[] {
  const out: string[] = [];
  if (node.hasPage) out.push(`/${prefix.join("/")}`.replace(/^\/$/, "/"));
  for (const [segment, child] of node.literalChildren) {
    out.push(...realPagePaths(child, [...prefix, segment]));
  }
  if (node.dynamicChild !== undefined) {
    out.push(...realPagePaths(node.dynamicChild.node, [...prefix, node.dynamicChild.name]));
  }
  return out;
}

/* ─── B1 · KÜME bekçisi ───────────────────────────────────────────────── */

describe("buildTrail — kırıntı kümesi", () => {
  const DEEP = "/projeler/gunesken-konut/santiyeler/a-blok/gunluk-kayit";

  it("mockup'ın çizdiği derin yolda (etiket, href) DİZİSİNİ birebir üretir", () => {
    // Kanon: `Şantiye - Günlük Kayıt.dc.html` 35-40 —
    // "Projeler / Güneşkent Konut / A-Blok / Günlük Kayıt".
    // 🔴 Tekil iddia ("içinde A-Blok var") YETMEZ: bir segment DÜŞSE de
    // geçerdi. Bekçi DİZİNİN TAMAMINI, sırasıyla ve href'leriyle sabitler.
    expect(buildTrail(DEEP, { project: "Güneşkent Konut", site: "A-Blok" })).toEqual([
      { label: "Projeler", href: "/projeler", pending: false },
      { label: "Güneşkent Konut", href: "/projeler/gunesken-konut", pending: false },
      {
        label: "A-Blok",
        href: "/projeler/gunesken-konut/santiyeler/a-blok",
        pending: false,
      },
      { label: "Günlük Kayıt", href: DEEP, pending: false },
    ]);
  });

  it("YAPISAL segment (`santiyeler`) kırıntıda GÖRÜNMEZ", () => {
    const labels = buildTrail(DEEP, { project: "P", site: "S" }).map((crumb) => crumb.label);
    expect(labels).not.toContain("santiyeler");
    expect(labels).toHaveLength(4);
  });

  it("POZİTİF KONTROL — kök rotada kırıntı TEK parçadır ve bağlantısızdır", () => {
    const trail = buildTrail("/");
    expect(trail).toHaveLength(1);
    expect(trail[0].label).toBe("Gösterge Paneli");
    expect(backTarget(trail)).toBeUndefined();
  });

  it("modül kökünde de TEK parçadır (yukarısı yok)", () => {
    expect(buildTrail("/stok")).toEqual([
      { label: "Stok & Depo", href: "/stok", pending: false },
    ]);
  });

  it("bölüm detayında dört adı da ayrı ayrı taşır", () => {
    const trail = buildTrail(
      "/projeler/p1/santiyeler/s1/bolumler/b1",
      { project: "Güneşkent", site: "A-Blok", section: "Kaba İnşaat" },
    );
    // 🔴 `toHaveTextContent` benzeri BÜTÜN-metin iddiası burada KULLANILMAZ:
    // "Güneşkent … A-Blok … Kaba İnşaat" birleşik metni, üç ad tek parçaya
    // çökse bile geçerdi. AYRIM parça bazında iddia edilir.
    expect(trail.map((crumb) => crumb.label)).toEqual([
      "Projeler",
      "Güneşkent",
      "A-Blok",
      "Kaba İnşaat",
    ]);
  });
});

/* ─── DET-1.2 · günlük kayıt detayı: sekmeye dönen ara parça ─────────── */

describe("buildTrail — günlük kayıt detayı (DET-1.2 · S4)", () => {
  const ENTRY = "/projeler/p1/santiyeler/s1/bolumler/b1/gunluk-kayit/e-24";
  const NAMES = { project: "Güneşkent", site: "A-Blok", section: "Kat 6–10", diaryEntry: "24.09.2026" };

  it("mockup kırıntısını birebir üretir: … / bölüm / Günlük Kayıt (SEKME) / tarih", () => {
    // Kanon: Günlük Kayıt Detay (Salt Okunur).dc.html 142-155.
    expect(buildTrail(ENTRY, NAMES)).toEqual([
      { label: "Projeler", href: "/projeler", pending: false },
      { label: "Güneşkent", href: "/projeler/p1", pending: false },
      { label: "A-Blok", href: "/projeler/p1/santiyeler/s1", pending: false },
      { label: "Kat 6–10", href: "/projeler/p1/santiyeler/s1/bolumler/b1", pending: false },
      {
        label: "Günlük Kayıt",
        href: "/projeler/p1/santiyeler/s1/bolumler/b1?sekme=gunluk-kayit",
        pending: false,
      },
      { label: "24.09.2026", href: ENTRY, pending: false },
    ]);
  });

  it("geri tuşu bölümün Günlük Kayıt SEKMESİNE döner (İş Kalemleri'ne değil)", () => {
    expect(backTarget(buildTrail(ENTRY, NAMES))?.href).toBe(
      "/projeler/p1/santiyeler/s1/bolumler/b1?sekme=gunluk-kayit",
    );
  });

  it("tarih gelmeden parça BEKLEMEDE (iskelet; yedek etiket yalnız ekran okuyucuya)", () => {
    const pending = buildTrail(ENTRY, { project: "P", site: "S", section: "B" });
    expect(pending[pending.length - 1]).toMatchObject({ pending: true, label: "Kayıt Detayı" });
    expect(pending.map((c) => c.label).join(" ")).not.toContain("e-24");
  });

  it("DET-1.3 · kayıt okunamazsa (404/403) son parça HİÇ basılmaz — kırıntı 'Günlük Kayıt'ta kalır (mockup hâl e)", () => {
    const failed = buildTrail(ENTRY, { project: "P", site: "S", section: "B", unresolved: new Set(["diaryEntry"] as const) });

    expect(failed.map((c) => c.label)).toEqual(["Projeler", "P", "S", "B", "Günlük Kayıt"]);
    expect(failed.map((c) => c.label)).not.toContain("Kayıt Detayı");
    // Geri tuşu bir seviye yukarı: bölüm (Günlük Kayıt artık SON parça).
    expect(backTarget(failed)?.href).toBe("/projeler/p1/santiyeler/s1/bolumler/b1");
  });

  it("başka düğümlerin çözülemeyen adı yine yedek etikete düşer (yalnız işaretli düğüm atlanır)", () => {
    const failed = buildTrail(ENTRY, { unresolved: new Set(["section"] as const), diaryEntry: "24.09.2026" });
    expect(failed[3]).toMatchObject({ pending: false, label: "Bölüm" });
  });

  it("`gunluk-kayit` segmentinin KENDİ sayfası yok: çıplak yol 'yakında' kırıntısına düşer", () => {
    // Ara parça yalnız kırıntıda görünür (`crumbHref`); adres olarak sayfa DEĞİLDİR.
    expect(buildTrail("/projeler/p1/santiyeler/s1/bolumler/b1/gunluk-kayit")).toHaveLength(1);
  });
});

/* ─── B2 · geri tuşu hedefi ───────────────────────────────────────────── */

describe("backTarget — deterministik bir seviye yukarı", () => {
  it("aynı yol HER ZAMAN aynı hedefi verir (geçmişten bağımsız)", () => {
    const at = (p: string) => backTarget(buildTrail(p, { project: "P", site: "S" }))?.href;
    expect(at("/muhasebe/mizan")).toBe("/muhasebe");
    expect(at("/muhasebe/mizan")).toBe("/muhasebe");
    expect(at("/projeler/p1/santiyeler/s1/puantaj")).toBe("/projeler/p1/santiyeler/s1");
    expect(at("/projeler/p1/santiyeler/s1")).toBe("/projeler/p1");
    expect(at("/projeler/p1")).toBe("/projeler");
  });

  it("POZİTİF KONTROL — kökte ve 'yakında' ekranında hedef YOKTUR", () => {
    expect(backTarget(buildTrail("/"))).toBeUndefined();
    expect(backTarget(buildTrail("/puantaj"))).toBeUndefined();
    // F-RAPOR: örnek `/raporlar`tan `/sirket-varliklari`ye taşındı —
    // `/raporlar` artık GERÇEK bir sayfa, "yakında" ekranı DEĞİL.
    expect(backTarget(buildTrail("/sirket-varliklari"))).toBeUndefined();
  });

  it("geri hedefi kırıntının SONDAN İKİNCİ parçasıdır, ayrı bir kural değil", () => {
    const trail = buildTrail("/projeler/p1/santiyeler/s1/stok/giris", {
      project: "P",
      site: "S",
    });
    expect(backTarget(trail)).toBe(trail[trail.length - 2]);
  });
});

/* ─── B4 · href üretimi ───────────────────────────────────────────────── */

describe("href üretimi — URL-1", () => {
  it("HER düğümün href'i, o düğüme giden YOLUN KENDİSİDİR", () => {
    // Bu tek iddia bütün ağacı bekçiler: bir üretici yanlış anahtarı okursa
    // (ör. `siteId` yerine `sectionId`), üretilen yol adresle ayrışır.
    let checked = 0;
    for (const { segments, node } of walkTrailTree(ROUTE_TRAIL_ROOT, [])) {
      if (node.href === undefined) continue;
      const pathname = `/${segments.join("/")}`;
      const trail = buildTrail(pathname);
      expect(trail[trail.length - 1].href, `son parça ≠ adres: ${pathname}`).toBe(pathname);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(60);
  });

  it("ARA parçaların href'i adresin GERÇEK bir önekidir", () => {
    for (const { segments, node } of walkTrailTree(ROUTE_TRAIL_ROOT, [])) {
      if (node.href === undefined) continue;
      const pathname = `/${segments.join("/")}`;
      // İki AYRI iddia. Gerçek bir sayfada HER parçanın href'i vardır
      // (href'siz parça yalnız "yakında" ekranında doğar), ve her href
      // adresin gerçek bir ÖNEKİDİR. Bunları tek satıra sıkıştırmak — ör.
      // eşleşmeyecek bir yedek değer uydurup `??` ile geçmek — okuyana
      // hangisinin bekçilendiğini SÖYLEMEZ.
      const hrefs = buildTrail(pathname).map((crumb) => crumb.href);
      expect(hrefs, `href taşımayan parça: ${pathname}`).not.toContain(undefined);
      for (const href of hrefs) {
        // DET-1.2: `crumbHref` parçası atasının bir GÖRÜNÜMÜNE (`?sekme=`)
        // bağlanır — YOL kısmı yine adresin gerçek önekidir; sorgu serbesttir.
        const [pathPart] = String(href).split("?");
        expect(pathname.startsWith(pathPart), `önek değil: ${href} ⊄ ${pathname}`).toBe(true);
      }
    }
  });

  it("route-tree.ts'te ELLE YAZILMIŞ yol string'i YOKTUR", () => {
    // Mutasyon: bir düğüme `href: (k) => `/projeler/${k.projectId}`` yaz → kırmızı.
    const code = stripComments(read("route-tree.ts"));
    const literals = code.match(/["'`]\/[^"'`\n]/g) ?? [];
    expect(literals, `elle yol: ${literals.join(", ")}`).toEqual([]);
    expect(code).toContain('from "@/lib/routes"');
  });

  it("kırıntı `router.back()`/`history.back()` KULLANMAZ (K2)", () => {
    for (const file of ["trail.ts", "TopbarBreadcrumb.tsx", "useCrumbNames.ts"]) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/router\.back|history\.back|useRouter/);
    }
  });
});

/* ─── B6 · adresteki anahtar BİREBİR taşınır ──────────────────────────── */

describe("anahtar taşıma — bozuk link üretilmez", () => {
  it("slug'ı OLMAYAN kaydın UUID'si href'e AYNEN girer", () => {
    // 🔴 `slug` sözleşmede hem opsiyonel hem nullable'dır; adı slug'lanamayan
    // kayıt URL'de yalnız UUID'siyle yaşar. Kırıntı anahtarı ÜRETMEZ, adresten
    // ALIR — yani `slug!` tipi bir varsayım burada yapısal olarak imkânsızdır.
    const uuid = "6f1c9a52-0b64-4f1e-9a2c-2f7d3e5a1b90";
    const trail = buildTrail(`/projeler/${uuid}/ozet`, { project: "Köprü Güçlendirme" });
    expect(trail[1].href).toBe(`/projeler/${uuid}`);
    expect(trail[2].href).toBe(`/projeler/${uuid}/ozet`);
  });

  it("YÜZDE KODLU slug İKİNCİ KEZ kodlanmaz", () => {
    // Mutasyon: `safeDecode`u kaldır → `k%25C3%25B6...` (bozuk link) → kırmızı.
    const encoded = encodeURIComponent("köprü-güçlendirme");
    const trail = buildTrail(`/projeler/${encoded}/ozet`);
    expect(trail[1].href).toBe(`/projeler/${encoded}`);
    expect(trail[1].href).not.toContain("%25");
  });

  it("kodlanmamış Türkçe slug GEÇERLİ bir URL'e kodlanır", () => {
    const trail = buildTrail("/projeler/köprü/ozet");
    expect(trail[1].href).toBe(`/projeler/${encodeURIComponent("köprü")}`);
  });

  it("bozuk yüzde dizisi kırıntıyı ÇÖKERTMEZ", () => {
    expect(() => buildTrail("/projeler/%zz")).not.toThrow();
  });

  it("`routeKeysOf` yalnız adresteki dinamik segmentleri toplar", () => {
    expect(routeKeysOf("/projeler/p1/santiyeler/s1/bolumler/b1")).toEqual({
      projectId: "p1",
      siteId: "s1",
      sectionId: "b1",
      entityId: "",
    });
    expect(routeKeysOf("/muhasebe/mizan")).toEqual({
      projectId: "",
      siteId: "",
      sectionId: "",
      entityId: "",
    });
  });
});

/* ─── Prototip kirliliği ──────────────────────────────────────────────── */

describe("segment eşleştirme prototipten okumaz", () => {
  it("`constructor` adlı bir slug DİNAMİK çocuğa düşer", () => {
    // Mutasyon: `Object.hasOwn` kapısını kaldır → `children["constructor"]`
    // `Object` yapıcısını döndürür, yürüyüş orada ölür ve proje parçası
    // KAYBOLUR (2 parça yerine 1) → kırmızı.
    const trail = buildTrail("/projeler/constructor", { project: "Constructor A.Ş." });
    expect(trail).toHaveLength(2);
    expect(trail[1].href).toBe("/projeler/constructor");
  });
});

/* ─── Yazılmamış rota (`[...slug]` → ComingSoon) ──────────────────────── */

describe("yazılmamış rota", () => {
  it("ComingSoon ekranının BASTIĞI adı basar ve bağlantı kurmaz", () => {
    // 🔴 F-RAPOR: örnek `/raporlar`tan `/sirket-varliklari`ye TAŞINDI (iddia
    // SİLİNMEDİ — F-MT kanonu). `/raporlar` bu dilimde gerçek bir sayfa oldu,
    // dolayısıyla ağaçta bir düğümü ve bir `href`i vardır; onu hâlâ
    // "yazılmamış rota" örneği saymak testi YALANCI kılardı.
    expect(buildTrail("/sirket-varliklari")).toEqual([
      { label: "Şirket Varlıkları", href: undefined, pending: false },
    ]);
    // ⚠️ Kabuk nav'ında catch-all'a düşen TEK öğe bu kaldı; o da yazıldığı gün
    // bu describe'ın örneği tanınmayan bir yola (`/olmayan-modul`) taşınmalı.
    expect(buildTrail("/olmayan-modul")[0].label).toBe("Olmayan Modul");
  });

  it("tanınmayan derin yolda da TEK parça kalır", () => {
    expect(buildTrail("/muhasebe/olmayan-sayfa")).toHaveLength(1);
    expect(buildTrail("/projeler/p1/santiyeler")).toHaveLength(1);
  });
});

/* ─── Kapsam: ağaç ⟺ dosya sistemi ────────────────────────────────────── */

describe("kırıntı ağacı uygulamanın GERÇEK rotalarını kapsar", () => {
  it("her `page.tsx` ağaçta, ağaçtaki her href bir `page.tsx`", () => {
    // 🔴 Elle yazılmış rota listesi YOK: kaynak `src/app/(app)` dosya
    // sistemidir (`route-tree.testkit.ts`). Yeni bir sayfa yazıp ağaca
    // eklemeyen dilim KIRMIZI alır — kırıntı sessizce bayatlayamaz.
    const real = new Set(realPagePaths(buildRouteTree(APP_DIR), []).map(normalize));
    const inTree = new Set<string>(["/"]);
    for (const { segments, node } of walkTrailTree(ROUTE_TRAIL_ROOT, [])) {
      if (node.href !== undefined) inTree.add(normalize(`/${segments.join("/")}`));
    }
    expect([...real].filter((p) => !inTree.has(p)), "ağaçta EKSİK rota").toEqual([]);
    expect([...inTree].filter((p) => !real.has(p)), "sayfası OLMAYAN düğüm").toEqual([]);
  });

  it("href taşıyan her düğümün etiketi doludur", () => {
    for (const { segments, node } of walkTrailTree(ROUTE_TRAIL_ROOT, [])) {
      if (node.href === undefined) continue;
      expect((node.label ?? "").length, `etiketsiz: /${segments.join("/")}`).toBeGreaterThan(0);
    }
  });
});

/* ─── Etiketler nav yapılandırmalarıyla AYNI ──────────────────────────── */

describe("etiket tutarlılığı", () => {
  it("kabuk nav'ındaki her öğenin etiketi kırıntının son parçasıyla aynıdır", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        const trail = buildTrail(item.href);
        expect(trail[trail.length - 1].label, `nav ≠ kırıntı: ${item.href}`).toBe(item.label);
      }
    }
  });

  it("Ayarlar alt sayfalarının etiketi `SETTINGS_NAV` ile aynıdır", () => {
    for (const group of SETTINGS_NAV) {
      for (const item of group.items) {
        const trail = buildTrail(item.href);
        expect(trail[trail.length - 1].label, `ayarlar ≠ kırıntı: ${item.href}`).toBe(item.label);
        expect(trail[0].label).toBe("Ayarlar");
      }
    }
  });
});

/* ─── K6 · ad gelmeden yalan söylenmez ────────────────────────────────── */

describe("çözülmemiş ad", () => {
  it("ad yokken parça BEKLEMEDEDİR ve ham anahtar metin olarak BASILMAZ", () => {
    const trail = buildTrail("/projeler/6f1c9a52-0b64-4f1e-9a2c-2f7d3e5a1b90");
    expect(trail[1].pending).toBe(true);
    expect(trail[1].label).toBe("Proje");
    expect(trail.map((c) => c.label).join(" ")).not.toContain("6f1c9a52");
  });

  it("sorgu HATA verdiyse beklemede kalmaz, yedek etikete düşer", () => {
    const trail = buildTrail("/projeler/p1/santiyeler/s1", {
      unresolved: new Set(["project", "site"] as const),
    });
    expect(trail.map((c) => [c.label, c.pending])).toEqual([
      ["Projeler", false],
      ["Proje", false],
      ["Şantiye", false],
    ]);
  });
});
