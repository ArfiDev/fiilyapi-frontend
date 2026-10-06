import { describe, expect, it } from "vitest";
import type { PageGrant } from "@/lib/api/models";
import {
  changedHiddenCategories,
  changedPageKeys,
  countChanges,
  draftFromResponse,
  toUpdateBody,
  withApprove,
  withGroupLevel,
  withHiddenToggled,
  withLevel,
  type AccessDraft,
} from "./page-access-draft";

const grant = (level: PageGrant["level"], approve = false): PageGrant => ({ level, approve });

function draftOf(pages: Record<string, PageGrant>, hidden: AccessDraft["hidden"] = []): AccessDraft {
  return draftFromResponse({ pages, hidden_fields: [...hidden] });
}

describe("withLevel", () => {
  it("düzeyi değiştirir ve girdiyi DEĞİŞTİRMEZ", () => {
    const base = draftOf({ a: grant("view") });
    const next = withLevel(base, "a", "edit");

    expect(next.pages.a).toEqual(grant("edit"));
    expect(base.pages.a).toEqual(grant("view"));
    expect(next).not.toBe(base);
  });

  it("Görmez'e geçen sayfanın onayını KAPATIR", () => {
    const base = draftOf({ a: grant("edit", true) });

    expect(withLevel(base, "a", "none").pages.a).toEqual(grant("none", false));
  });

  it("Görmez dışı geçişte onay korunur", () => {
    const base = draftOf({ a: grant("edit", true) });

    expect(withLevel(base, "a", "view").pages.a).toEqual(grant("view", true));
  });

  it("aynı düzeye ya da bilinmeyen anahtara geçiş taslağı olduğu gibi döndürür", () => {
    const base = draftOf({ a: grant("view") });

    expect(withLevel(base, "a", "view")).toBe(base);
    expect(withLevel(base, "yok", "edit")).toBe(base);
  });
});

describe("withApprove", () => {
  it("Görmez olmayan sayfada onayı işaretler", () => {
    expect(withApprove(draftOf({ a: grant("view") }), "a", true).pages.a).toEqual(grant("view", true));
  });

  it("Görmez sayfada onay işaretlenemez", () => {
    const base = draftOf({ a: grant("none") });

    expect(withApprove(base, "a", true)).toBe(base);
  });
});

describe("withGroupLevel", () => {
  it("verilen sayfaların TÜMÜNÜ aynı düzeye çeker, diğerlerine dokunmaz; Görmez onayları kapatır", () => {
    const base = draftOf({ a: grant("edit", true), b: grant("view"), c: grant("edit") });
    const next = withGroupLevel(base, ["a", "b"], "none");

    expect(next.pages).toEqual({ a: grant("none"), b: grant("none"), c: grant("edit") });
  });
});

describe("hassas alanlar", () => {
  it("kategoriyi ekler ve çıkarır", () => {
    const base = draftOf({}, ["maas_kisisel"]);
    const added = withHiddenToggled(base, "maliyet_kar");
    const removed = withHiddenToggled(added, "maas_kisisel");

    expect(added.hidden).toEqual(["maas_kisisel", "maliyet_kar"]);
    expect(removed.hidden).toEqual(["maliyet_kar"]);
    expect(base.hidden).toEqual(["maas_kisisel"]);
  });
});

describe("değişiklik sayacı", () => {
  it("değişen sayfa + değişen hassas alan toplamıdır; geri alınan değişiklik sayılmaz", () => {
    const baseline = draftOf({ a: grant("view"), b: grant("edit") }, ["maas_kisisel"]);
    let draft = withLevel(baseline, "a", "edit");
    draft = withLevel(draft, "b", "none");
    draft = withHiddenToggled(draft, "tum_tutarlar");

    expect(changedPageKeys(baseline, draft).sort()).toEqual(["a", "b"]);
    expect(changedHiddenCategories(baseline, draft)).toEqual(["tum_tutarlar"]);
    expect(countChanges(baseline, draft)).toBe(3);
    expect(countChanges(baseline, withLevel(draft, "a", "view"))).toBe(2);
  });

  it("yalnız onay değiştiyse de satır değişmiş sayılır", () => {
    const baseline = draftOf({ a: grant("edit", false) });

    expect(countChanges(baseline, withApprove(baseline, "a", true))).toBe(1);
  });
});

describe("toUpdateBody", () => {
  it("tüm anahtarları (değişmeyenler dahil) ve kanonik sırada hassas alanları taşır", () => {
    const baseline = draftOf({ a: grant("view"), b: grant("edit", true), c: grant("none") });
    const draft = withHiddenToggled(withHiddenToggled(withLevel(baseline, "a", "edit"), "tum_tutarlar"), "maas_kisisel");

    const body = toUpdateBody(draft);

    expect(Object.keys(body.pages).sort()).toEqual(["a", "b", "c"]);
    expect(body.pages.b).toEqual(grant("edit", true));
    expect(body.hidden_fields).toEqual(["maas_kisisel", "tum_tutarlar"]);
  });
});

