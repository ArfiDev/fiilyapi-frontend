import { describe, expect, it } from "vitest";
import type { PageCatalogEntry } from "@/lib/api/hooks/usePages";
import { draftFromResponse } from "./page-access-draft";
import { buildSections, levelDistribution } from "./page-access-derive";
import { buildCatalogFixture, buildRolePagesFixture } from "./page-access.fixture";

describe("buildSections", () => {
  it("100 sayfayı 9 menü grubuna katalog sırasıyla dağıtır", () => {
    const catalog = buildCatalogFixture();
    const sections = buildSections(catalog);

    expect(catalog).toHaveLength(100);
    expect(sections.map((section) => section.name)).toEqual([
      "Genel",
      "Saha",
      "İK",
      "Planlama",
      "Teklif ve Sözleşmeler",
      "Stok & Satınalma",
      "Mali",
      "Proje içi sekmeler",
      "Ayarlar",
    ]);
    expect(sections.reduce((total, section) => total + section.pages.length, 0)).toBe(100);
  });

  it("proje içi grubu katalogdaki subgroup'tan Proje / Şantiye / Bölüm alt başlıklarını kurar", () => {
    const sections = buildSections(buildCatalogFixture());
    const projectInner = sections.find((section) => section.group === "proje_ici");

    expect(projectInner?.subsections.map((sub) => sub.title)).toEqual(["Proje", "Şantiye", "Bölüm"]);
  });

  it("alt başlıksız grup tek (başlıksız) alt bölümdür", () => {
    const saha = buildSections(buildCatalogFixture()).find((section) => section.group === "saha");

    expect(saha?.subsections).toHaveLength(1);
    expect(saha?.subsections[0].title).toBeNull();
  });

  it("grup, bitişik olmayan satırlarda da tek bölümde toplanır (ilk görünme sırası)", () => {
    const base = buildCatalogFixture();
    const scrambled: PageCatalogEntry[] = [base[0], base.find((p) => p.group === "saha")!, base[1]];

    const sections = buildSections(scrambled);

    expect(sections.map((section) => section.group)).toEqual(["genel", "saha"]);
    expect(sections[0].pages).toHaveLength(2);
  });
});

describe("levelDistribution", () => {
  it("yalnız sıfırdan büyük düzeyleri Düzenler → Görür → Görmez sırasıyla sayar", () => {
    const catalog = buildCatalogFixture();
    const draft = draftFromResponse(buildRolePagesFixture("r"));
    const saha = buildSections(catalog).find((section) => section.group === "saha")!;

    expect(levelDistribution(saha.pages, draft).map((item) => `${item.count} ${item.label}`)).toEqual([
      "5 Düzenler",
      "1 Görür",
    ]);
  });
});
