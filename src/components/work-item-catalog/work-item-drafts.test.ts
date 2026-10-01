import { describe, expect, it } from "vitest";

import {
  addDraft,
  editDraftFromItem,
  filterNewDrafts,
  isDraftDirty,
  newDraftFor,
  patchDraftForm,
  removeDraft,
  resolveNewDraftDiscipline,
  updateDraft,
} from "./work-item-drafts";
import { BETON, D_DUV, D_KAB } from "./work-item-fixtures";

describe("work-item-drafts", () => {
  it("düzenleme taslağı kalem kimliğiyle anahtarlanır ve temiz başlar", () => {
    const draft = editDraftFromItem(BETON);
    expect(draft).toMatchObject({ key: "i-bet", itemId: "i-bet", disciplineId: "d-kab", isSaving: false });
    expect(isDraftDirty(draft)).toBe(false);
  });

  it("yeni taslak YALNIZ disiplin kimliğini saklar; yükleniciyi disiplin varsayılanından alır", () => {
    const draft = newDraftFor(2, D_DUV);
    expect(draft).toMatchObject({ key: "new-2", itemId: null, disciplineId: "d-duv" });
    expect(draft.form.own).toBe("subcon");
    expect(Object.keys(draft)).not.toContain("discipline");
    expect(newDraftFor(3, null).disciplineId).toBe("");
  });

  it("disiplin çizimde ŞİMDİKİ listeden çözülür (ad değişirse yeni ad), yoksa null", () => {
    const draft = newDraftFor(1, D_KAB);
    expect(resolveNewDraftDiscipline(draft, [{ ...D_KAB, name: "Yeni Ad" }])?.name).toBe("Yeni Ad");
    expect(resolveNewDraftDiscipline(draft, [D_DUV])).toBeNull();
  });

  it("işlemler değişmezdir: yeni dizi döner, eskisi bozulmaz", () => {
    const base = addDraft([], editDraftFromItem(BETON));
    const patched = patchDraftForm(base, "i-bet", { name: "x" });
    expect(base[0]?.form.name).toBe("Beton döküm");
    expect(patched[0]?.form.name).toBe("x");
    expect(isDraftDirty(patched[0]!)).toBe(true);
    expect(updateDraft(patched, "i-bet", { hasTried: true })[0]?.hasTried).toBe(true);
    expect(removeDraft(patched, "i-bet")).toEqual([]);
  });

  it("form değişimi sunucu hatasını siler", () => {
    const withError = updateDraft([editDraftFromItem(BETON)], "i-bet", { serverError: "409" });
    expect(patchDraftForm(withError, "i-bet", { name: "y" })[0]?.serverError).toBeNull();
  });

  it("yeni satırlar en üste eklenir", () => {
    const drafts = addDraft(addDraft([], newDraftFor(1, D_KAB)), newDraftFor(2, D_KAB));
    expect(drafts.map((d) => d.key)).toEqual(["new-2", "new-1"]);
  });

  it("filterNewDrafts: yalnız yeni satırlar; çip ve arama (boş tarif aramaya uymaz)", () => {
    const named = patchDraftForm([newDraftFor(1, D_KAB)], "new-1", { name: "Kolon kalıbı" })[0]!;
    const blank = newDraftFor(2, D_DUV);
    const all = [named, blank, editDraftFromItem(BETON)];
    expect(filterNewDrafts(all, { query: "", disciplineId: null }).map((d) => d.key)).toEqual(["new-1", "new-2"]);
    expect(filterNewDrafts(all, { query: "", disciplineId: "d-duv" }).map((d) => d.key)).toEqual(["new-2"]);
    expect(filterNewDrafts(all, { query: "  KOLON ", disciplineId: null }).map((d) => d.key)).toEqual(["new-1"]);
    expect(filterNewDrafts(all, { query: "zzz", disciplineId: null })).toEqual([]);
  });
});
