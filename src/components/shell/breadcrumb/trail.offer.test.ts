import { describe, expect, it } from "vitest";

import { buildTrail } from "./trail";

describe("kırıntı — Teklif Hazırlama (TKL-F3.4)", () => {
  it("/teklif-hazirlama/yeni → Teklif Hazırlama › Yeni Teklif; üst bağlantı listeye gider", () => {
    const crumbs = buildTrail("/teklif-hazirlama/yeni");
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Teklif Hazırlama", "Yeni Teklif"]);
    expect(crumbs[0]?.href).toBe("/teklif-hazirlama");
  });
});
