import { describe, expect, it } from "vitest";

import { buildTrail } from "./trail";

describe("kırıntı — Teklif Hazırlama (TKL-F3.4)", () => {
  it("/teklif-hazirlama/yeni → Teklif Hazırlama › Yeni Teklif; üst bağlantı listeye gider", () => {
    const crumbs = buildTrail("/teklif-hazirlama/yeni");
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Teklif Hazırlama", "Yeni Teklif"]);
    expect(crumbs[0]?.href).toBe("/teklif-hazirlama");
  });
});

describe("kırıntı — Teklif Detay (TKL-F3.5)", () => {
  it("/teklif-hazirlama/{id} → Teklif Hazırlama › {teklif no}; ad çözülür", () => {
    const crumbs = buildTrail("/teklif-hazirlama/offer-14", { offer: "TKL-2026-0014" });
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Teklif Hazırlama", "TKL-2026-0014"]);
    expect(crumbs[0]?.href).toBe("/teklif-hazirlama");
  });

  it("ad çözülemediyse yedek etiket 'Teklif'", () => {
    const crumbs = buildTrail("/teklif-hazirlama/offer-14");
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Teklif Hazırlama", "Teklif"]);
  });

  it("'yeni' statik segment dinamik teklif kimliğine YENİLMEZ", () => {
    expect(buildTrail("/teklif-hazirlama/yeni").map((crumb) => crumb.label)).toEqual(["Teklif Hazırlama", "Yeni Teklif"]);
  });
});
