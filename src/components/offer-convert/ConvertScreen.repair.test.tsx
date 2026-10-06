/**
 * TKL-F5.3b · opus çürütme bulgularının DAVRANIŞ bekçileri (Y1 · O1 · O2 · O3 · D1 · D2 · D3).
 * Her test onarımdan ÖNCE kırmızı koşuldu (plan §10 · AĞIR-düzeltme).
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeGroup, makeItem, makeUnpricedItem } from "@/components/offers/offer-item-fixtures";
import { BETON } from "@/components/work-item-catalog/work-item-fixtures";
import { backendClient } from "@/lib/api/client";

import { makeWonRevision } from "./convert-fixtures";
import { resetPermissions } from "./convert-permission.testkit";
import {
  CONVERT_RESPONSE, CREATE, NEXT_1, NEXT_2, bfBox, convertBodies, fail, fieldText, fieldValue, fillStep1, installBackend, ok, priceDemir,
  renderConvert, rowOf, toStep2, toStep3, typeInto, wonBackend,
} from "./convert-screen.testkit";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", async () => import("./convert-permission.testkit").then((m) => m.disciplineScopeMock));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
  resetPermissions();
  installBackend(wonBackend());
  return () => vi.useRealTimers();
});

const createButton = () => screen.getByRole("button", { name: CREATE });
const itBody = (index: number, code: string) =>
  (convertBodies()[index] as { groups: { items: { code: string; unit_price: string }[] }[] }).groups.flatMap((group) => group.items).find((item) => item.code === code);
const BETON_CODE = BETON.poz_no;

/** GET'lerin ÜSTÜNE: `isDown()` doğruyken katalog/revizyon okuması 500 döner (başarısız yeniden okuma). */
function failReadsWhile(isDown: () => boolean): void {
  const base = vi.mocked(backendClient.GET).getMockImplementation() as (path: string, ...rest: unknown[]) => Promise<unknown>;
  vi.mocked(backendClient.GET).mockImplementation(((path: string, ...rest: unknown[]) =>
    isDown() && (path === "/catalog/items" || path === "/offers/{offer_id}/revisions/{rev_no}") ? Promise.resolve(fail(500, { detail: "sunucu hatası" })) : base(path, ...rest)) as never);
}

describe("Y1 · 409 veri bütünlüğü: bayat gövde YOK (düzenleme bandı kaldırır; yeniden oluşturma GÜNCEL durumdan)", () => {
  it("düzenlemeden sonra bant ve 'Tekrar dene' kalkar; yeniden gönderim YENİ B.F.'yi taşır", async () => {
    let calls = 0;
    installBackend(wonBackend({ post: () => (++calls === 1 ? fail(409, { detail: "Veri bütünlüğü hatası" }) : ok(CONVERT_RESPONSE)) }));
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-error")).toHaveTextContent("Veri bütünlüğü hatası");
    await user.click(screen.getByRole("button", { name: "← Geri" }));
    await typeInto(user, bfBox("o:it-1"), "200");
    expect(screen.queryByTestId("convert-error")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    expect(itBody(0, BETON_CODE)?.unit_price).toBe("128.80");
    expect(itBody(1, BETON_CODE)?.unit_price).toBe("200");
  });

  it("'Tekrar dene' (düzenleme yok) güncel durumdan yeniden kurar: iki gövde eşit, başarı bandı gönderilen sözleşme no'yu basar", async () => {
    let calls = 0;
    installBackend(wonBackend({ post: () => (++calls === 1 ? fail(409, { detail: "Veri bütünlüğü hatası" }) : ok(CONVERT_RESPONSE)) }));
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user, { contractNo: "szl-iş-07" });
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-error");
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    const done = await screen.findByTestId("convert-done");
    expect(convertBodies()[1]).toEqual(convertBodies()[0]);
    expect(within(done).getByText("SZL-İŞ-07")).toBeInTheDocument();
  });
});

describe("D3 · 409 kod çakışması bandı kod düzeltilince kalkar", () => {
  it("koda yazınca hata bandı da gider", async () => {
    installBackend(wonBackend({ post: () => fail(409, { detail: "Bu proje kodu zaten kullanılıyor" }) }));
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Proje kodu"), "prj-1");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    expect(await screen.findByTestId("convert-error")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Proje kodu"), "2");
    expect(screen.queryByTestId("convert-error")).not.toBeInTheDocument();
  });
});

describe("Y1 · değişmeyen alandan çıkmak (blur) hata bandını silmez", () => {
  it("409 kod çakışması: sözleşme no'ya odaklanıp değiştirmeden çıkınca bant kalır", async () => {
    installBackend(wonBackend({ post: () => fail(409, { detail: "Bu proje kodu zaten kullanılıyor" }) }));
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Proje kodu"), "prj-1");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    expect(await screen.findByTestId("convert-error")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Sözleşme no"));
    await user.tab();
    expect(screen.getByTestId("convert-error")).toBeInTheDocument();
  });
});

describe("O1 · veri varken başarısız yeniden okuma tahtayı SÖKMEZ", () => {
  it("başarıdan sonra katalog/revizyon yeniden okuması 500: başarı bandı ve form kalır", async () => {
    let isDown = false;
    installBackend(wonBackend({ post: () => ((isDown = true), ok(CONVERT_RESPONSE)) }));
    failReadsWhile(() => isDown);
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    await screen.findByTestId("convert-done");
    await waitFor(() => expect(vi.mocked(backendClient.GET).mock.calls.filter((call) => call[0] === "/catalog/items").length).toBeGreaterThan(1));
    expect(screen.queryByText("Teklif kalemleri yüklenemedi")).not.toBeInTheDocument();
    expect(screen.getByTestId("convert-done")).toBeInTheDocument();
    expect(screen.getByTestId("convert-step-3")).toBeInTheDocument();
  });

  it("Adım 2'deyken yeniden okuma 500: kutulardaki değerler ve adım korunur", async () => {
    let isDown = false;
    failReadsWhile(() => isDown);
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user, "321");
    isDown = true;
    const before = vi.mocked(backendClient.GET).mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(vi.mocked(backendClient.GET).mock.calls.length).toBeGreaterThan(before));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Teklif kalemleri yüklenemedi")).not.toBeInTheDocument();
    expect((bfBox("o:it-2") as HTMLInputElement).value).toBe("321");
  });
});

describe("O2 · eksik/geçersiz satırda Σ, Fark, KDV dahil KESİN sayı basmaz", () => {
  it("fiyatsız demir varken üçü '—'; fiyat girilince kesin sayılar döner", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    const summary = screen.getByTestId("convert-summary");
    expect(fieldText(summary, "Sözleşme tutarı")).toContain("—");
    expect(fieldText(summary, "Sözleşme tutarı")).not.toContain("₺");
    expect(within(summary).getByText("Fark").parentElement?.textContent).toContain("—");
    expect(within(summary).getByText("Fark").parentElement?.textContent).not.toMatch(/[₺%]/);
    expect(fieldText(summary, "KDV %20 dahil")).toContain("—");
    expect(fieldText(summary, "KDV %20 dahil")).not.toContain("₺");
    expect(within(summary).getByText("Fiyatı ya da miktarı eksik kalem var")).toBeInTheDocument();
    await priceDemir(user, "100");
    expect(fieldText(summary, "Sözleşme tutarı")).toContain("₺6.488,00");
    expect(within(summary).queryByText("Fiyatı ya da miktarı eksik kalem var")).not.toBeInTheDocument();
  });
});

describe("O3 · Türkçe büyük harf: yazarken DÖNÜŞMEZ, alandan çıkınca tr-TR", () => {
  it("'szl-iş-01' yazarken aynen; blur → 'SZL-İŞ-01'; proje kodu 'prj-ılık' → 'PRJ-ILIK'", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Sözleşme no"), "szl-iş-01");
    expect(fieldValue("Sözleşme no")).toBe("szl-iş-01");
    await user.type(screen.getByLabelText("Proje kodu"), "prj-ılık");
    expect(fieldValue("Proje kodu")).toBe("prj-ılık");
    await user.tab();
    expect(fieldValue("Sözleşme no")).toBe("SZL-İŞ-01");
    expect(fieldValue("Proje kodu")).toBe("PRJ-ILIK");
  });

  it("imleç ortada düzenlenirken sona atlamaz (yazarken değer dönüştürülmez)", async () => {
    const user = userEvent.setup();
    renderConvert();
    const box = (await screen.findByLabelText("Sözleşme no")) as HTMLInputElement;
    await user.type(box, "szl-01");
    await user.type(box, "x", { initialSelectionStart: 3, initialSelectionEnd: 3 });
    expect(box.value).toBe("szlx-01");
    expect(box.selectionStart).toBe(4);
  });

  it("gönderilen gövde tr-TR büyük harf: 'szl-iş-01' → 'SZL-İŞ-01'", async () => {
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user, { contractNo: "szl-iş-01" });
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await user.click(await screen.findByRole("button", { name: CREATE }));
    await screen.findByTestId("convert-done");
    expect(convertBodies()[0]).toMatchObject({ contract: { contract_no: "SZL-İŞ-01" } });
  });
});

describe("D1 · tanım / birim / teklif kalemi satır hataları GÖRÜNÜR (sessiz kilit yok)", () => {
  it("tanımı boş teklif satırı: 'ileri' kapıda kalır ve hata satırda görünür", async () => {
    const bad = makeWonRevision({
      groups: [makeGroup("g-kaba", "KABA İNŞAAT", 0, [makeItem({ id: "it-1", description: "" }), makeUnpricedItem({ id: "it-2", sort_order: 1 })])],
    });
    installBackend(wonBackend({ revision: bad }));
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    expect(within(rowOf("o:it-1")).getByText("İş Kalemi Tanımı zorunludur.")).toBeInTheDocument();
  });

  it("birimi boş teklif satırı: hata satırda görünür", async () => {
    const bad = makeWonRevision({
      groups: [makeGroup("g-kaba", "KABA İNŞAAT", 0, [makeItem({ id: "it-1", unit: "" }), makeUnpricedItem({ id: "it-2", sort_order: 1 })])],
    });
    installBackend(wonBackend({ revision: bad }));
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    expect(within(rowOf("o:it-1")).getByText("Birim zorunludur.")).toBeInTheDocument();
  });

  it("sunucu 422 offer_item_id: metin AYNEN satırda görünür (Adım 2'ye dönülür)", async () => {
    const text = "Kalem teklifin son revizyonunda bulunamadı";
    installBackend(
      wonBackend({ post: () => fail(422, { detail: text, errors: [{ loc: ["groups", 0, "items", 0, "offer_item_id"], message: text }] }) }),
    );
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    await user.click(createButton());
    expect(await screen.findByTestId("convert-step-2")).toBeInTheDocument();
    expect(within(rowOf("o:it-1")).getByText(text)).toBeInTheDocument();
  });
});

describe("D2 · onay adımı şantiye adını OLDUĞU GİBİ gösterir (çift 'Şantiyesi' eki yok)", () => {
  it("şantiye adı 'A-Blok Şantiyesi' yazıldıysa tek ek", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Şantiye adı"), "A-Blok Şantiyesi");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    const step = await screen.findByTestId("convert-step-3");
    expect(within(step).getByText("A-Blok Şantiyesi")).toBeInTheDocument();
    expect(within(step).queryByText("A-Blok Şantiyesi Şantiyesi")).not.toBeInTheDocument();
  });
});
