import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BETON, DEMIR, LAST_EMPTY, LAST_SZL, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { ConvertItemsStep } from "./ConvertItemsStep";
import { DISCIPLINE_BY_CATALOG, makeWonRevision } from "./convert-fixtures";
import { summarize } from "./convert-derive";
import { rowsFromRevision } from "./convert-model";
import { resetPermissions } from "./convert-permission.testkit";
import {
  CREATE, NEXT_2, bfBox, convertBodies, fieldText, groupOf, installBackend, priceDemir, qtyBox, renderConvert, rowOf, toStep2, wonBackend,
} from "./convert-screen.testkit";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", async () => import("./convert-permission.testkit").then((m) => m.modulePermissionMock));
vi.mock("@/lib/auth/useDisciplineScope", async () => import("./convert-permission.testkit").then((m) => m.disciplineScopeMock));

const ADD_BUTTON = "+ Katalogdan kalem ekle";
const PICKER = "Katalogdan Kalem Ekle";
const NEW_GROUP_VALUE = "__new__";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
  resetPermissions();
  installBackend(wonBackend({ items: [BETON, DEMIR, SIVA, LAST_SZL, LAST_EMPTY] }));
  return () => vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;
const picker = () => within(screen.getByRole("dialog", { name: PICKER }));
const pickerRow = (pozNo: string) => picker().getByText(pozNo).closest("tr") as HTMLElement;
const pickerCheck = (pozNo: string) => within(pickerRow(pozNo)).getByRole("checkbox", { name: `${pozNo} seç` });
const pickerQty = (pozNo: string) => within(pickerRow(pozNo)).getByLabelText(`${pozNo} miktar`);
const pickerSubmit = () => picker().getByRole("button", { name: /Kalemi Ekle|^Kalem Ekle$/ });
const summaryTotal = () => fieldText(screen.getByTestId("convert-summary"), "Sözleşme tutarı");

async function openPicker(user: User): Promise<void> {
  await user.click(screen.getByRole("button", { name: ADD_BUTTON }));
  await screen.findByRole("dialog", { name: PICKER });
  await picker().findByText(LAST_EMPTY.poz_no);
}

/** LAST_SZL'yi (son fiyat 3.410,00) verilen grupta, miktar 10 ile ekler. */
async function addSzl(user: User, groupId = "g:g-kaba", quantity = "10"): Promise<void> {
  await openPicker(user);
  await user.selectOptions(picker().getByRole("combobox", { name: "Grup" }), groupId);
  await user.type(pickerQty(LAST_SZL.poz_no), quantity);
  await user.click(pickerSubmit());
}

describe("Adım 2 · '+ Katalogdan kalem ekle' (ÜS-F5-14)", () => {
  it("🔴 düğme ETKİN; tıklayınca ortak seçici dönüştürme hedefiyle açılır (başlık, bağlam, Σ etiketi)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.getByRole("button", { name: ADD_BUTTON })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openPicker(user);
    expect(picker().getByText("TKL-2026-0014 Rev.2 · İş Kalemi Kataloğu'ndan sözleşmeye kalem ekle")).toBeInTheDocument();
    expect(picker().getByText(/Eklenecek Tutar/)).toBeInTheDocument();
  });

  it("🔴 ekle → yeni satır SEÇİLEN grupta; miktar + B.F. (son fiyat) kutularda; 'Yeni' etiketi + sistem notu; çip '1 yeni'; seçici KAPANIR", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await addSzl(user);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const row = rowOf("n:0");
    expect(qtyBox("n:0")).toHaveValue("10");
    expect(bfBox("n:0")).toHaveValue("3.410,00");
    expect(within(row).getByText("Yeni")).toBeInTheDocument();
    expect(within(row).getByText("Katalogdan eklendi · teklifte yoktu")).toBeInTheDocument();
    expect(within(row).getByText("teklifte yok")).toBeInTheDocument();
    expect(screen.getByText("4 dahil · 0 çıkarıldı · 0 değişti · 1 yeni")).toBeInTheDocument();
    const body = groupOf("g:g-kaba").closest("tbody") as HTMLElement;
    const keys = within(body).getAllByTestId(/^convert-(row|group)-/).map((element) => element.dataset.testid);
    expect(keys).toEqual([
      "convert-group-g:g-kaba", "convert-row-o:it-1", "convert-row-o:it-2", "convert-row-n:0",
      "convert-group-g:g-ince", "convert-row-o:it-3", "convert-group-g:g-bos",
    ]);
  });

  it("🔴 B.F. önerisi: son fiyat yoksa referans (100,00)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await openPicker(user);
    await user.type(pickerQty(LAST_EMPTY.poz_no), "2");
    await user.click(pickerSubmit());
    expect(bfBox("n:0")).toHaveValue("100,00");
  });

  it("🔴 Σ yeni satırı içerir: 6.288,00 → +10 × 3.410,00 → 40.588,00 (teklif tutarı DEĞİŞMEZ)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user, "100");
    expect(summaryTotal()).toContain("₺6.488,00");
    await addSzl(user);
    expect(summaryTotal()).toContain("₺40.588,00");
    expect(fieldText(screen.getByTestId("convert-summary"), "Teklif tutarı · Rev.2")).toContain("₺6.288,00");
    expect(fieldText(screen.getByTestId("convert-summary"), "Yeni kalem · 1")).toContain("+₺34.100,00");
  });
});

describe("miktar BOŞ + zorunlu", () => {
  it("🔴 seçicide miktarsız kalem eklenemez ('Miktar girin' + düğme kapalı); yazılınca açılır", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await openPicker(user);
    await user.click(pickerCheck(LAST_SZL.poz_no));
    expect(pickerQty(LAST_SZL.poz_no)).toHaveValue("");
    expect(picker().getByTestId("wip-band")).toHaveTextContent("Miktar girin");
    expect(pickerSubmit()).toBeDisabled();
    await user.type(pickerQty(LAST_SZL.poz_no), "1");
    expect(pickerSubmit()).toBeEnabled();
  });

  it("🔴 eklenen satırın miktarı silinirse Adım 2 kapısı KAPANIR: 'Onaya geç' adımı açmaz, 'Miktar girin' görünür", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user);
    await addSzl(user);
    await user.clear(qtyBox("n:0"));
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    expect(within(rowOf("n:0")).getByText("Miktar girin")).toBeInTheDocument();
    await user.type(qtyBox("n:0"), "3");
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(await screen.findByTestId("convert-step-3")).toBeInTheDocument();
  });
});

describe("'Listede var' ve silme", () => {
  it("🔴 listedeki (dahil VE çıkarılmış) kalem seçilemez; eklenen kalem de ikinci kez seçilemez", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await user.click(within(rowOf("o:it-3")).getByRole("checkbox", { name: "Sözleşmeye dahil et" })); // SIVA çıkarıldı
    await addSzl(user);
    await openPicker(user);
    await user.click(picker().getByRole("checkbox", { name: "Listede olanları gizle" }));
    expect(pickerCheck(SIVA.poz_no)).toBeDisabled();
    expect(within(pickerRow(SIVA.poz_no)).getByText("Listede var · İNCE İŞLER")).toBeInTheDocument();
    expect(pickerCheck(BETON.poz_no)).toBeDisabled();
    expect(pickerCheck(LAST_SZL.poz_no)).toBeDisabled();
    expect(within(pickerRow(LAST_SZL.poz_no)).getByText("Listede var · KABA İNŞAAT")).toBeInTheDocument();
  });

  it("🔴 yeni satır çıkarılınca (toggle = SİL) tablodan GİDER, çip/özet geri döner ve kalem yeniden seçilebilir", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await addSzl(user);
    await user.click(within(rowOf("n:0")).getByRole("checkbox", { name: "Sözleşmeye dahil et" }));
    expect(screen.queryByTestId("convert-row-n:0")).not.toBeInTheDocument();
    expect(screen.getByText("3 dahil · 0 çıkarıldı · 0 değişti · 0 yeni")).toBeInTheDocument();
    expect(summaryTotal()).toContain("₺6.288,00");
    await openPicker(user);
    expect(pickerCheck(LAST_SZL.poz_no)).toBeEnabled();
  });
});

describe("yeni grup (YEREL)", () => {
  it("🔴 '+ Yeni Grup' (ad 'Yeni grup'): grup başlığı + kalem tabloda; aynı ad reddedilir; çıkarılınca boş grup kalkar", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await openPicker(user);
    await user.selectOptions(picker().getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    expect(picker().getByLabelText("Grup Adı")).toHaveValue("Yeni grup");
    await user.type(pickerQty(LAST_SZL.poz_no), "2");
    await user.clear(picker().getByLabelText("Grup Adı"));
    await user.type(picker().getByLabelText("Grup Adı"), "KABA İNŞAAT");
    expect(picker().getByTestId("wip-band")).toHaveTextContent("Bu adla grup var");
    expect(pickerSubmit()).toBeDisabled();
    await user.clear(picker().getByLabelText("Grup Adı"));
    await user.type(picker().getByLabelText("Grup Adı"), "Yeni grup");
    await user.click(pickerSubmit());
    const header = screen.getByText("Yeni grup").closest("tr") as HTMLElement;
    expect(within(header).getByText("1 kalem")).toBeInTheDocument();
    await user.click(within(rowOf("n:1")).getByRole("checkbox", { name: "Sözleşmeye dahil et" }));
    expect(screen.queryByText("Yeni grup")).not.toBeInTheDocument();
  });
});

describe("gönderim gövdesi", () => {
  it("🔴 katalogdan eklenen satır gövdeye offer_item_id OLMADAN girer; tekliften gelenler offer_item_id taşır; yeni grup adıyla gider", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user);
    await addSzl(user);
    await openPicker(user);
    await user.selectOptions(picker().getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    await user.type(pickerQty(LAST_EMPTY.poz_no), "4");
    await user.click(pickerSubmit());
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    await screen.findByTestId("convert-step-3");
    await user.click(screen.getByRole("button", { name: CREATE }));
    const body = convertBodies()[0] as { groups: { name: string; items: Record<string, unknown>[] }[] };
    expect(body.groups.map((group) => group.name)).toEqual(["KABA İNŞAAT", "İNCE İŞLER", "Yeni grup"]);
    const added = body.groups[0]?.items.at(-1);
    expect(added).toEqual({
      catalog_item_id: LAST_SZL.id, code: LAST_SZL.poz_no, description: LAST_SZL.name, unit: LAST_SZL.uom, quantity: "10", unit_price: "3410.00",
    });
    expect(added).not.toHaveProperty("offer_item_id");
    expect(body.groups[2]?.items).toEqual([
      { catalog_item_id: LAST_EMPTY.id, code: LAST_EMPTY.poz_no, description: LAST_EMPTY.name, unit: LAST_EMPTY.uom, quantity: "4", unit_price: "100.00" },
    ]);
    expect(body.groups[0]?.items[0]).toHaveProperty("offer_item_id", "it-1");
  });
});

describe("seçici kapanışı", () => {
  it("Vazgeç seçiciyi kapatır, taslağı DEĞİŞTİRMEZ", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await openPicker(user);
    await user.type(pickerQty(LAST_SZL.poz_no), "5");
    await user.click(picker().getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("convert-row-n:0")).not.toBeInTheDocument();
    expect(screen.getByText("3 dahil · 0 çıkarıldı · 0 değişti · 0 yeni")).toBeInTheDocument();
  });
});

describe("kirli kapatma (mevcut onay kalıbı)", () => {
  it("🔴 seçim varken arka plan tıklaması onay sorar: reddedilirse seçici açık kalır, onaylanırsa kapanır ve taslak değişmez", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await openPicker(user);
    await user.type(pickerQty(LAST_SZL.poz_no), "5");
    await user.click(document.querySelector(".modal-overlay") as HTMLElement);
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: PICKER })).toBeInTheDocument();
    confirmSpy.mockReturnValue(true);
    await user.click(document.querySelector(".modal-overlay") as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("convert-row-n:0")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});

describe("düğme kilidi (uçuşta / başarı sonrası pasif)", () => {
  const draft = rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG);
  const renderStep = (isLocked: boolean, onOpenCatalog = vi.fn()) => {
    const actions = { onToggle: vi.fn(), onQty: vi.fn(), onBf: vi.fn(), onCode: vi.fn(), onRename: vi.fn(), onDiscipline: vi.fn() };
    render(
      <ConvertItemsStep
        draft={draft}
        summary={summarize(draft, "20.00")}
        revNo={2}
        vatPct="20.00"
        errors={{ general: {}, groups: {}, rows: {} }}
        isSiteOpen
        disciplines={[]}
        isLocked={isLocked}
        onOpenCatalog={onOpenCatalog}
        actions={actions}
      />,
    );
    return onOpenCatalog;
  };

  it("🔴 kilitliyken düğme PASİF ve tıklama seçiciyi açmaz; kilitsizken açık", async () => {
    const onOpen = renderStep(true);
    const button = screen.getByRole("button", { name: ADD_BUTTON });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("kilitsizken tıklama onOpenCatalog çağırır", async () => {
    const onOpen = renderStep(false);
    await userEvent.click(screen.getByRole("button", { name: ADD_BUTTON }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
