import { describe, it, expect } from "vitest";

import {
  budgetNodes,
  disciplineOptionsFromCompany,
  disciplineOptionsFromView,
  indexLeaves,
  leafPatchFor,
  mergeDisciplineOptions,
  rateCommit,
  itemContractorPatch,
  leafContractorPatch,
  leafDirectPatch,
} from "./budget-tree";
import {
  D_DUV,
  D_KAB,
  G_BET,
  G_IZO,
  I_BETON,
  LEAF_CAT,
  LEAF_IZO,
  LEAF_TML,
  S_CAT,
  S_TML,
  budgetView,
  viewWithTwoDisciplines,
} from "./budget-fixtures";

const NO_FILTER = { query: "", onlyEmpty: false };

function ids(nodes: ReturnType<typeof budgetNodes>): string[] {
  return nodes.flatMap((n) => [n.id, ...ids((n.children ?? []) as ReturnType<typeof budgetNodes>)]);
}

describe("budgetNodes — L1 disiplin · L2 grup · L3 iş tipi · L4 yaprak (K2, B1-10)", () => {
  it("düğüm kimliği backend kimliğidir; disiplinsiz düğüm de ağaçta", () => {
    const nodes = budgetNodes(budgetView(), NO_FILTER);
    expect(nodes.map((n) => n.id)).toEqual([`d:${D_KAB}`, "d:none"]);
    const kab = nodes[0];
    expect(kab.children?.map((c) => c.id)).toContain(`g:${G_BET}`);
    expect(ids(nodes)).toEqual(expect.arrayContaining([`i:${I_BETON}`, LEAF_TML, LEAF_CAT, LEAF_IZO]));
    expect(nodes[1].data.kind).toBe("discipline");
  });

  it("'Yalnız oranı boş olanlar' yalnız boş oranlı yaprağın yolunu bırakır (BÜT:598, 608)", () => {
    const nodes = budgetNodes(budgetView(), { query: "", onlyEmpty: true });
    expect(ids(nodes)).toEqual([`d:${D_KAB}`, `g:${G_BET}`, `i:${I_BETON}`, LEAF_CAT]);
  });

  it("arama iş tipi + bölüm + kodda, Türkçe küçük harfle eşleşir", () => {
    expect(ids(budgetNodes(budgetView(), { query: "ÇATI", onlyEmpty: false }))).toContain(LEAF_CAT);
    expect(ids(budgetNodes(budgetView(), { query: "ÇATI", onlyEmpty: false }))).not.toContain(LEAF_TML);
    expect(ids(budgetNodes(budgetView(), { query: "membran", onlyEmpty: false }))).toEqual([
      "d:none",
      `g:${G_IZO}`,
      "i:33333333-0000-0000-0000-000000000003",
      LEAF_IZO,
    ]);
    expect(ids(budgetNodes(budgetView(), { query: "kab.01.03", onlyEmpty: false }))).toContain(LEAF_TML);
  });

  it("eşleşme yoksa boş", () => {
    expect(budgetNodes(budgetView(), { query: "yok-böyle", onlyEmpty: false })).toEqual([]);
  });
});

describe("indexLeaves / leafPatchFor", () => {
  it("yaprak kimliğinden kalem + disiplin bulunur", () => {
    const entry = indexLeaves(budgetView()).get(LEAF_CAT);
    expect(entry?.item.item_id).toBe(I_BETON);
    expect(entry?.discipline.discipline_id).toBe(D_KAB);
  });

  it("PATCH anahtarı: boq_item_id + section_id (+ verilen alanlar)", () => {
    const entry = indexLeaves(budgetView()).get(LEAF_CAT);
    expect(entry && leafPatchFor(entry.leaf, { unit_mhr: "2", rate_source: "manual" })).toEqual({
      boq_item_id: I_BETON,
      section_id: S_CAT,
      unit_mhr: "2",
      rate_source: "manual",
    });
  });
});

describe("disiplin seçenekleri (M1)", () => {
  it("bütçe yanıtından: yalnız gerçek disiplinler, sırasıyla", () => {
    expect(disciplineOptionsFromView(viewWithTwoDisciplines())).toEqual([
      { id: D_KAB, code: "KAB", name: "Kaba İnşaat", color: "#2563eb", defaultContractorType: "own" },
      { id: D_DUV, code: "DUV", name: "Duvar & Sıva", color: "#93c5fd", defaultContractorType: "subcon" },
    ]);
  });

  it("dış liste (şirket disiplinleri) yanıttakini tamamlar; aynı kimlik tekrarlanmaz", () => {
    const fromView = disciplineOptionsFromView(budgetView());
    const merged = mergeDisciplineOptions(fromView, [
      { id: D_KAB, code: "KAB", name: "Kaba İnşaat", color: "#2563eb", defaultContractorType: "own" },
      { id: "d-pey", code: "PEY", name: "Peyzaj", color: "#16a34a", defaultContractorType: "subcon" },
    ]);
    expect(merged.map((o) => o.id)).toEqual([D_KAB, "d-pey"]);
  });
});

describe("rateCommit — oran hücresi on-blur → PATCH gövdesi", () => {
  const view = budgetView();
  const tml = indexLeaves(view).get(LEAF_TML)!.leaf; // 1.800000 katalog
  const cat = indexLeaves(view).get(LEAF_CAT)!.leaf; // oran yok

  it("yeni değer: rate_source 'manual' (K4 elle)", () => {
    expect(rateCommit(tml, "2,05")).toEqual({
      kind: "patch",
      patch: { boq_item_id: I_BETON, section_id: S_TML, unit_mhr: "2.05", rate_source: "manual" },
    });
  });

  it("aynı değer (biçim farkı dahil) istek ATMAZ", () => {
    expect(rateCommit(tml, "1,80")).toEqual({ kind: "none" });
    expect(rateCommit(tml, "1.8")).toEqual({ kind: "none" });
  });

  it("boşaltma oranı SİLER (unit_mhr null); zaten boşsa istek yok", () => {
    expect(rateCommit(tml, "")).toEqual({
      kind: "patch",
      patch: { boq_item_id: I_BETON, section_id: S_TML, unit_mhr: null },
    });
    expect(rateCommit(cat, "  ")).toEqual({ kind: "none" });
  });

  it("geçersiz girdi reddedilir", () => {
    expect(rateCommit(cat, "abc")).toEqual({ kind: "invalid" });
  });
});

describe("atama gövdeleri (K3 · M2 · F0-2/F0-3)", () => {
  const view = budgetView();
  const cat = indexLeaves(view).get(LEAF_CAT)!; // yaprakta taşerona ezilmiş
  const tml = indexLeaves(view).get(LEAF_TML)!; // miras

  it("iş tipi: disiplin varsayılanını seçmek mirasa döner (contractor_type null)", () => {
    expect(itemContractorPatch(cat.discipline, "own")).toEqual({ contractor_type: null });
    expect(itemContractorPatch(cat.discipline, "subcon")).toEqual({ contractor_type: "subcon" });
  });

  it("yaprak: iş tipi değerine eşit seçim ezmeyi KALDIRIR, farklısı ezer", () => {
    expect(leafContractorPatch(cat.item, cat.leaf, "own")).toEqual({
      boq_item_id: I_BETON,
      section_id: S_CAT,
      contractor_type: null,
    });
    expect(leafContractorPatch(tml.item, tml.leaf, "subcon")).toMatchObject({ contractor_type: "subcon" });
  });

  it("yaprak doğrudan/dolaylı ezmesi aynı kural", () => {
    expect(leafDirectPatch(tml.item, tml.leaf, false)).toMatchObject({ is_direct: false });
    expect(leafDirectPatch(tml.item, tml.leaf, true)).toMatchObject({ is_direct: null });
  });
});

describe("disciplineOptionsFromCompany — şirket listesi (useEvDisciplines, K2)", () => {
  it("sıra `sort_order`a göre; alanlar seçici biçimine çevrilir", () => {
    expect(
      disciplineOptionsFromCompany([
        { id: "d-2", code: "PEY", name: "Peyzaj", color: "#16a34a", default_contractor_type: "subcon", sort_order: 2, used_by_item_count: 0, used_by_site_count: 0, user_count: 0 },
        { id: "d-1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb", default_contractor_type: "own", sort_order: 1, used_by_item_count: 0, used_by_site_count: 0, user_count: 0 },
      ]),
    ).toEqual([
      { id: "d-1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb", defaultContractorType: "own" },
      { id: "d-2", code: "PEY", name: "Peyzaj", color: "#16a34a", defaultContractorType: "subcon" },
    ]);
  });
});
