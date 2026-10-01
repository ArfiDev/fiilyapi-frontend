import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BoqTable } from "./BoqTable";
import type { BoqGroup, BoqItem, BoqTotals } from "@/lib/api/hooks/useBoq";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    code: "01.001",
    description: "Kazı (Makine ile)",
    unit: "m³",
    quantity: "1240.000",
    unit_price: "280.00",
    amount: "347200.00",
    sort_order: 0,
    contract_item_id: null,
    allocated_quantity: "0.000",
    unallocated_quantity: "1240.000",
    progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

// sort_order KASITLI olarak 10/20/30 — mockup 1-2-3 kesintisiz sayar (spec §5.2).
const GROUPS: BoqGroup[] = [
  {
    id: "gggggggg-0000-0000-0000-000000000001",
    name: "Toprak ve Temel İşleri",
    sort_order: 10,
    group_total: "471900.00",
    items: [item(), item({ id: "aaaaaaaa-0000-0000-0000-000000000002", code: "01.002" })],
  },
  {
    id: "gggggggg-0000-0000-0000-000000000002",
    name: "Betonarme İşleri",
    sort_order: 20,
    group_total: "9250000.00",
    items: [item({ id: "aaaaaaaa-0000-0000-0000-000000000003", code: "02.001" })],
  },
  {
    id: "gggggggg-0000-0000-0000-000000000003",
    name: "Duvar ve Kaplama İşleri",
    sort_order: 30,
    group_total: "0.00",
    items: [],
  },
];

// GENEL TOPLAM satırının kaynağı (spec §5.5): tutar GERÇEK, yüzde YER TUTUCU.
// `grand_total` kasıtlı olarak kalemlerin toplamı DEĞİL — frontend'in hesap
// yapmadığı, backend değerini bastığı testle sabitlenir.
function totals(overrides: Partial<BoqTotals> = {}): BoqTotals {
  return {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "progress_payments" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "12399900.00",
    grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

const TOTALS = totals();

const COLUMNS = ["Poz No", "İş Kalemi Tarifi", "Birim", "Miktar", "Birim Fiyat", "Tutar", "Gerç. %"];

/** thead'in sütun başlıkları — grup başlıkları da `columnheader` rolündedir. */
function columnHeads(): HTMLElement[] {
  return within(screen.getAllByRole("row")[0]).getAllByRole("columnheader");
}

function groupHeads(): HTMLElement[] {
  return screen.getAllByTestId("boq-group");
}

describe("BoqTable — başlık ve semantik (mockup 92–103, spec §10)", () => {
  it("7 sütun başlığı mockup metinleriyle ve scope=col ile basılır", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const heads = columnHeads();
    expect(heads.map((h) => h.textContent)).toEqual(COLUMNS);
    for (const head of heads) expect(head).toHaveAttribute("scope", "col");
  });

  it("tabloya 8. sütun eklenmez (mockup düzeni korunur)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(columnHeads()).toHaveLength(7);
  });

  it("ekran okuyucu için sr-only caption taşır", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const caption = screen.getByText("İş kalemleri listesi");
    expect(caption.tagName).toBe("CAPTION");
    expect(caption).toHaveClass("sr-only");
  });

  // Grup, altındaki satırların başlığıdır: <td> değil <th scope="colgroup">
  // (spec §10). HTML-ARIA eşlemesinde scope=colgroup rolü `columnheader`dır.
  it("grup başlığı th scope=colgroup olarak basılır", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const groupHead = groupHeads()[0];
    expect(groupHead.tagName).toBe("TH");
    expect(groupHead).toHaveAttribute("scope", "colgroup");
    expect(groupHead).toHaveAttribute("colspan", "7");
  });
});

describe("BoqTable — gruplar ve satırlar (spec §5.1–5.3)", () => {
  it("grup numaraları 1. 2. 3. olarak dizinden türetilir (sort_order 10/20/30 iken bile)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const headers = groupHeads().map((h) => h.textContent);
    expect(headers).toEqual([
      "1. Toprak ve Temel İşleri",
      "2. Betonarme İşleri",
      "3. Duvar ve Kaplama İşleri",
    ]);
  });

  it("büyük harfe çevirme JS ile yapılmaz (CSS text-transform)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(groupHeads()[0]).toHaveTextContent("1. Toprak ve Temel İşleri");
  });

  it("grup ve kalem sırası yüklerden geldiği gibi korunur, yeniden sıralanmaz", () => {
    const shuffled: BoqGroup[] = [GROUPS[1], GROUPS[0], GROUPS[2]];
    render(<BoqTable groups={shuffled} totals={TOTALS} />);
    expect(groupHeads().map((h) => h.textContent)).toEqual([
      "1. Betonarme İşleri",
      "2. Toprak ve Temel İşleri",
      "3. Duvar ve Kaplama İşleri",
    ]);
  });

  it("tutar backend'den basılır, miktar × fiyat olarak yeniden hesaplanmaz", () => {
    const groups: BoqGroup[] = [
      {
        ...GROUPS[0],
        items: [item({ quantity: "2.000", unit_price: "100.00", amount: "999.00" })],
      },
    ];
    render(<BoqTable groups={groups} totals={TOTALS} />);
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.queryByText("200")).not.toBeInTheDocument();
  });

  it("miktar ve birim fiyat ₺ sembolü olmadan biçimlenir (mockup 114–116)", () => {
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} />);
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("01.001"));
    expect(row).toBeDefined();
    expect(row?.textContent).toContain("1.240");
    expect(row?.textContent).toContain("280");
    expect(row?.textContent).toContain("347.200");
    expect(row?.textContent).not.toContain("₺");
  });

  it("kalemi olmayan grup için başlık basılır, uydurma boş satır eklenmez", () => {
    render(<BoqTable groups={[GROUPS[2]]} totals={TOTALS} />);
    expect(groupHeads()[0]).toHaveTextContent("1. Duvar ve Kaplama İşleri");
    // 1 baslik satiri (thead) + 1 grup satiri + 1 GENEL TOPLAM satiri = 3;
    // kalem satiri yok.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("grup alt-toplam satırı basılmaz (mockup'ta yok)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(screen.queryByText("471.900")).not.toBeInTheDocument();
    expect(screen.queryByText("9.250.000")).not.toBeInTheDocument();
  });
});

describe("BoqTable — Gerç. % yer tutucu sütunu (spec §5.4)", () => {
  it("Gerç. % hücreleri — basar ve sr-only bekleme metnini taşır", () => {
    render(<BoqTable groups={[GROUPS[1]]} totals={TOTALS} />);
    const cell = screen.getByTestId("boq-pct");
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveAttribute("title", "Hakediş verisi bu yüzeye henüz bağlanmadı");
    expect(within(cell).getByText("Hakediş verisi bu yüzeye henüz bağlanmadı")).toHaveClass("sr-only");
  });

  it("Gerç. % sütun başlığı kaybolmaz", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(screen.getByRole("columnheader", { name: "Gerç. %" })).toBeInTheDocument();
  });

  it("yüzde hücresi nötr basılır — eşik/renk sınıfı taşımaz (P7'ye bırakıldı)", () => {
    render(<BoqTable groups={[GROUPS[1]]} totals={TOTALS} />);
    expect(screen.getByTestId("boq-pct").className).toBe("boq-table__pct boq-table__pct--pending");
  });

  it("mockup'taki renkli yüzde rozetleri hiç render edilmez", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(screen.queryByText(/^%\d/)).not.toBeInTheDocument();
  });
});

describe("BoqTable — GENEL TOPLAM satırı (mockup 174–177, spec §5.5)", () => {
  /** tfoot'un tek satırı — thead/tbody satırlarından ayırt edilir. */
  function totalRow(): HTMLElement {
    return screen.getByTestId("boq-total-row");
  }

  it("GENEL TOPLAM tutarı grand_total'dan formatAmount ile basılır", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(screen.getByTestId("boq-total-amount")).toHaveTextContent("12.399.900");
  });

  it("toplam frontend'de hesaplanmaz, backend değeri basılır", () => {
    // Kalemlerin tutarı 347.200 × 3 = 1.041.600; ekran yine de backend'in
    // gonderdigi 12.399.900'u basar.
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(screen.getByTestId("boq-total-amount")).not.toHaveTextContent("1.041.600");
  });

  it("toplam tutar ₺ sembolü basmaz (mockup 176)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(totalRow().textContent).not.toContain("₺");
  });

  it("ilk hücre colSpan=5 ve scope=row", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const label = within(totalRow()).getByText("GENEL TOPLAM");
    expect(label.tagName).toBe("TH");
    expect(label).toHaveAttribute("colspan", "5");
    expect(label).toHaveAttribute("scope", "row");
  });

  it("yüzde hücresi — basar ve hakediş bekleme metnini taşır", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    const cell = screen.getByTestId("boq-total-pct");
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveAttribute("title", "Hakediş verisi bu yüzeye henüz bağlanmadı");
    expect(within(cell).getByText("Hakediş verisi bu yüzeye henüz bağlanmadı")).toHaveClass("sr-only");
  });

  // Mockup 177 `%75` basiyor; bu dilimde veri yok, sahte yuzde UYDURULMAZ.
  it("mockup'ın %75 değeri uydurulmaz", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} />);
    expect(totalRow().textContent).not.toMatch(/%\d/);
  });

  it("boş BOQ'da tfoot yine basılır ve 0 gösterir", () => {
    render(<BoqTable groups={[]} totals={totals({ grand_total: "0.00" })} />);
    expect(screen.getByTestId("boq-total-amount")).toHaveTextContent("0");
    expect(within(totalRow()).getByText("GENEL TOPLAM")).toBeInTheDocument();
  });
});

describe("BoqTable — boş durum (spec §9)", () => {
  it("groups boşken boş durum metni ve + İş Kalemi butonu basılır, thead korunur", () => {
    render(<BoqTable groups={[]} totals={TOTALS} />);
    expect(columnHeads().map((h) => h.textContent)).toEqual(COLUMNS);
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ İş Kalemi" })).toBeInTheDocument();
  });

  it("boş durum satırı tablonun tam genişliğini kaplar", () => {
    render(<BoqTable groups={[]} totals={TOTALS} />);
    const cell = screen.getByTestId("boq-empty");
    expect(cell).toHaveAttribute("colspan", "7");
  });

  // Boş durumdaki eylem, başlık şeridindeki "+ İş Kalemi" butonunun ikizidir →
  // aynı izin kapısına bağlanır (spec §2.5): salt-okunur kullanıcıya çalışmayan
  // yazma yüzeyi bırakılmaz.
  it("canWrite false iken boş durumda + İş Kalemi butonu basılmaz, metin kalır", () => {
    render(<BoqTable groups={[]} totals={TOTALS} canWrite={false} />);
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ İş Kalemi" })).not.toBeInTheDocument();
  });

  it("canWrite belirtilmezse buton görünür (bilinmezlik kuralı, spec §2.5.3)", () => {
    render(<BoqTable groups={[]} totals={TOTALS} />);
    expect(screen.getByRole("button", { name: "+ İş Kalemi" })).toBeInTheDocument();
  });

  it("boş durumdaki + İş Kalemi butonu onCreate'i çağırır", () => {
    const onCreate = vi.fn();
    render(<BoqTable groups={[]} totals={TOTALS} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "+ İş Kalemi" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

// Satır tıklaması ile düzenleme (spec §7.2). Tetikleyici Poz No hücresindeki
// gerçek <button>'dır; <tr tabIndex role="button"> KULLANILMAZ.
describe("BoqTable — satır düzenleme tetikleyicisi (spec §7.2)", () => {
  const ARIA_LABEL = "01.001 — Kazı (Makine ile) kalemini düzenle";

  it("canWrite true iken Poz No hücresi düzenleme butonu içerir ve aria-label taşır", () => {
    render(<BoqTable groups={[GROUPS[1]]} totals={TOTALS} onEditItem={vi.fn()} />);
    const trigger = screen.getByRole("button", {
      name: "02.001 — Kazı (Makine ile) kalemini düzenle",
    });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveTextContent("02.001");
  });

  it("tetikleyici kalemi ve grup kimliğini geri verir", () => {
    const onEditItem = vi.fn();
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} onEditItem={onEditItem} />);
    fireEvent.click(screen.getByRole("button", { name: ARIA_LABEL }));
    expect(onEditItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "aaaaaaaa-0000-0000-0000-000000000001" }),
      GROUPS[0].id,
    );
  });

  // Spec §7.2 "poz satırının TAMAMI tıklanabilir". Hover/cursor tüm satıra
  // uygulandığı için tıklama kapısı da satırda olmalı: yalnız Poz No hücresini
  // bağlamak satırın geri kalanında sessizce çalışmayan bir vaat bırakır.
  it("satırın Poz No dışındaki hücrelerine tıklamak da düzenlemeyi açar", () => {
    const onEditItem = vi.fn();
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} onEditItem={onEditItem} />);
    fireEvent.click(screen.getAllByText("Kazı (Makine ile)")[0]);
    expect(onEditItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "aaaaaaaa-0000-0000-0000-000000000001" }),
      GROUPS[0].id,
    );
  });

  it("tetikleyiciye tıklamak kabarma yüzünden çift çağrı üretmez", () => {
    const onEditItem = vi.fn();
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} onEditItem={onEditItem} />);
    fireEvent.click(screen.getByRole("button", { name: ARIA_LABEL }));
    expect(onEditItem).toHaveBeenCalledTimes(1);
  });

  it("canWrite false iken satırın hiçbir hücresi tıklamaya cevap vermez", () => {
    const onEditItem = vi.fn();
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} canWrite={false} onEditItem={onEditItem} />);
    fireEvent.click(screen.getAllByText("Kazı (Makine ile)")[0]);
    fireEvent.click(screen.getAllByText("01.001")[0]);
    expect(onEditItem).not.toHaveBeenCalled();
  });

  it("canWrite false iken satır tetikleyici buton yok, Poz No düz span", () => {
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} canWrite={false} onEditItem={vi.fn()} />);
    expect(screen.queryByRole("button", { name: ARIA_LABEL })).not.toBeInTheDocument();
    expect(screen.getAllByText("01.001")[0].tagName).toBe("SPAN");
  });

  it("satır semantiği bozulmaz: tr role=button veya tabIndex almaz", () => {
    render(<BoqTable groups={[GROUPS[0]]} totals={TOTALS} onEditItem={vi.fn()} />);
    for (const row of screen.getAllByRole("row")) {
      expect(row).not.toHaveAttribute("role");
      expect(row).not.toHaveAttribute("tabindex");
    }
  });

  it("tetikleyici eklenince tabloya 8. sütun gelmez", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} onEditItem={vi.fn()} />);
    expect(columnHeads()).toHaveLength(7);
  });
});

// Spec §10 klavye denetimi (F11). Tabloda ÖZEL bir klavye idaresi (ok tuşlarıyla
// hücre gezinme, roving tabindex) YOKTUR ve olmamalıdır: doğal Tab sırası satır
// sırasını izler. Aşağıdaki testler o sözleşmeyi sabitler.
describe("BoqTable — klavye gezinmesi ve odak sırası (spec §10)", () => {
  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

  it("Tab sırası doğal satır sırasını izler, hücre atlamaz", async () => {
    const user = userEvent.setup();
    render(<BoqTable groups={GROUPS} totals={TOTALS} onEditItem={vi.fn()} />);
    // GROUPS: 1. grupta 01.001/01.002, 2. grupta 02.001, 3. grup boş.
    for (const code of ["01.001", "01.002", "02.001"]) {
      await user.tab();
      expect(document.activeElement).toHaveTextContent(code);
    }
  });

  it("canWrite false iken tabloda hiç odaklanabilir öğe kalmaz (ölü odak yok)", () => {
    const { container } = render(
      <BoqTable groups={GROUPS} totals={TOTALS} canWrite={false} onEditItem={vi.fn()} />,
    );
    expect(container.querySelectorAll(FOCUSABLE)).toHaveLength(0);
  });

  it("yer tutucu hücreler odak sırasına girmez (title taşıyan td tabindex almaz)", () => {
    render(<BoqTable groups={GROUPS} totals={TOTALS} onEditItem={vi.fn()} />);
    for (const cell of screen.getAllByTestId("boq-pct")) {
      expect(cell).not.toHaveAttribute("tabindex");
    }
    expect(screen.getByTestId("boq-total-pct")).not.toHaveAttribute("tabindex");
  });
});
