import { describe, expect, it, vi } from "vitest";

import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { BackendError } from "@/lib/api/unwrap";

import { makeTemplateDetail } from "./template-fixtures";
import { runTemplateCreate, type CreateInput, type FlowDeps } from "./template-create-flow";

const created = (overrides: Partial<OfferTemplateDetail> = {}) =>
  makeTemplateDetail({ id: "new-1", name: "Yeni", is_default: false, updated_at: "U-POST", groups: [], ...overrides });

function makeDeps(overrides: Partial<FlowDeps> = {}) {
  const calls: string[] = [];
  const track = <K extends keyof FlowDeps>(name: K, result: (...args: never[]) => Promise<OfferTemplateDetail>) =>
    vi.fn(async (...args: never[]) => {
      calls.push(name);
      return result(...args);
    });
  const deps = {
    createBlank: track("createBlank", async () => created()),
    fromOffer: track("fromOffer", async () => created({ overhead_pct: "10.00", profit_pct: "14.00" })),
    copy: track("copy", async () => created({ description: "Kaynak açıklaması", overhead_pct: "12.00", profit_pct: "15.00" })),
    patch: track("patch", async () => created({ updated_at: "U-PATCH" })),
    putContent: track("putContent", async () => created({ updated_at: "U-PUT" })),
    setDefault: track("setDefault", async () => created({ is_default: true })),
    ...overrides,
  } as unknown as FlowDeps;
  return { deps, calls };
}

const base: Omit<CreateInput, "source"> = { name: "Yeni", description: "", overhead: "12", profit: "15", makeDefault: false };

describe("Boş kaynak", () => {
  it("POST (ad, açıklama, oranlar) → gruplar seçildiyse PUT (POST yanıtının updated_at'iyle) → varsayılan", async () => {
    const { deps, calls } = makeDeps();
    const result = await runTemplateCreate(deps, {
      ...base,
      description: "Kapsam",
      makeDefault: true,
      source: { kind: "blank", groupNames: ["Betonarme", "Kalıp"] },
    });
    expect(calls).toEqual(["createBlank", "putContent", "setDefault"]);
    expect(vi.mocked(deps.createBlank).mock.calls[0]?.[0]).toEqual({
      name: "Yeni",
      description: "Kapsam",
      overhead_pct: "12",
      profit_pct: "15",
    });
    expect(vi.mocked(deps.putContent).mock.calls[0]).toEqual([
      "new-1",
      { groups: [{ name: "Betonarme", items: [] }, { name: "Kalıp", items: [] }], expected_updated_at: "U-POST" },
    ]);
    expect(result.failure).toBeNull();
    expect(result.template?.id).toBe("new-1");
  });

  it("grup yok + varsayılan değil → yalnız POST", async () => {
    const { deps, calls } = makeDeps();
    await runTemplateCreate(deps, { ...base, source: { kind: "blank", groupNames: [] } });
    expect(calls).toEqual(["createBlank"]);
  });

  it("boş açıklama/oran gövdeye girmez", async () => {
    const { deps } = makeDeps();
    await runTemplateCreate(deps, { ...base, overhead: null, profit: null, source: { kind: "blank", groupNames: [] } });
    expect(vi.mocked(deps.createBlank).mock.calls[0]?.[0]).toEqual({ name: "Yeni" });
  });
});

describe("Bir tekliften", () => {
  const source = { kind: "offer", offerId: "of-1", revNo: 2, offerNo: "TKL-2026-0014" } as const;

  it("from-offer (son revizyon) → oran FARKI varsa PATCH (yanıtın updated_at'iyle) → varsayılan", async () => {
    const { deps, calls } = makeDeps();
    await runTemplateCreate(deps, { ...base, makeDefault: true, source });
    expect(calls).toEqual(["fromOffer", "patch", "setDefault"]);
    expect(vi.mocked(deps.fromOffer).mock.calls[0]?.[0]).toEqual({ offer_id: "of-1", rev_no: 2, name: "Yeni" });
    expect(vi.mocked(deps.patch).mock.calls[0]).toEqual([
      "new-1",
      { overhead_pct: "12", profit_pct: "15", expected_updated_at: "U-POST" },
    ]);
  });

  it("oranlar kaynaktakiyle aynıysa PATCH YOK (ondalık eşitlik: '10' = '10.00')", async () => {
    const { deps, calls } = makeDeps();
    await runTemplateCreate(deps, { ...base, overhead: "10", profit: "14", source });
    expect(calls).toEqual(["fromOffer"]);
  });

  it("yalnız farklı olan oran PATCH'e girer; açıklama from-offer gövdesindedir", async () => {
    const { deps } = makeDeps();
    await runTemplateCreate(deps, { ...base, description: "Not", overhead: "10", profit: "20", source });
    expect(vi.mocked(deps.fromOffer).mock.calls[0]?.[0]).toMatchObject({ description: "Not" });
    expect(vi.mocked(deps.patch).mock.calls[0]?.[1]).toEqual({ profit_pct: "20", expected_updated_at: "U-POST" });
  });

  it("oran temizlenmişse (boş) fark = null PATCH'i", async () => {
    const { deps } = makeDeps();
    await runTemplateCreate(deps, { ...base, overhead: null, profit: "14", source });
    expect(vi.mocked(deps.patch).mock.calls[0]?.[1]).toEqual({ overhead_pct: null, expected_updated_at: "U-POST" });
  });
});

describe("Şablondan kopyala", () => {
  const source = { kind: "template", templateId: "src-1" } as const;

  it("copy{name} → açıklama/oran farkı PATCH → varsayılan", async () => {
    const { deps, calls } = makeDeps();
    await runTemplateCreate(deps, { ...base, description: "Yeni açıklama", overhead: "13", profit: "15", makeDefault: true, source });
    expect(calls).toEqual(["copy", "patch", "setDefault"]);
    expect(vi.mocked(deps.copy).mock.calls[0]).toEqual(["src-1", { name: "Yeni" }]);
    expect(vi.mocked(deps.patch).mock.calls[0]?.[1]).toEqual({
      description: "Yeni açıklama",
      overhead_pct: "13",
      expected_updated_at: "U-POST",
    });
  });

  it("açıklama boş bırakılırsa kaynağınki korunur; fark yoksa PATCH yok", async () => {
    const { deps, calls } = makeDeps();
    await runTemplateCreate(deps, { ...base, description: "", source });
    expect(calls).toEqual(["copy"]);
  });
});

describe("hata: ilk hata durdurur", () => {
  const boom = (detail: string) => new BackendError(422, { detail });

  it("ilk adım (POST) düşerse şablon YOK: template null, hata metni", async () => {
    const { deps, calls } = makeDeps({ createBlank: vi.fn(async () => Promise.reject(boom("Ad geçersiz"))) as never });
    const result = await runTemplateCreate(deps, { ...base, makeDefault: true, source: { kind: "blank", groupNames: ["A"] } });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ template: null, failure: { message: "Ad geçersiz", created: false } });
  });

  it("PUT düşerse varsayılan adımı ATLANIR; şablon vardır; bant 'Şablon oluşturuldu ama gruplar uygulanamadı: …'", async () => {
    const { deps, calls } = makeDeps({ putContent: vi.fn(async () => Promise.reject(boom("Katalog iş tipi bulunamadı"))) as never });
    const result = await runTemplateCreate(deps, { ...base, makeDefault: true, source: { kind: "blank", groupNames: ["A"] } });
    expect(calls).toEqual(["createBlank"]);
    expect(result.template?.id).toBe("new-1");
    expect(result.failure).toEqual({
      created: true,
      message: "Şablon oluşturuldu ama gruplar uygulanamadı: Katalog iş tipi bulunamadı",
    });
  });

  it("PATCH düşerse (tekliften) 'oranlar'; varsayılan adımı çalışmaz", async () => {
    const { deps, calls } = makeDeps({ patch: vi.fn(async () => Promise.reject(boom("Oran geçersiz"))) as never });
    const result = await runTemplateCreate(deps, {
      ...base,
      makeDefault: true,
      source: { kind: "offer", offerId: "of-1", revNo: 0, offerNo: "TKL-1" },
    });
    expect(calls).toEqual(["fromOffer"]);
    expect(result.failure?.message).toBe("Şablon oluşturuldu ama oranlar uygulanamadı: Oran geçersiz");
  });

  it("varsayılan adımı düşerse 'varsayılan şablon ayarı'", async () => {
    const { deps } = makeDeps({ setDefault: vi.fn(async () => Promise.reject(boom("Yetkisiz"))) as never });
    const result = await runTemplateCreate(deps, { ...base, makeDefault: true, source: { kind: "blank", groupNames: [] } });
    expect(result.failure?.message).toBe("Şablon oluşturuldu ama varsayılan şablon ayarı uygulanamadı: Yetkisiz");
    expect(result.template?.id).toBe("new-1");
  });
});
