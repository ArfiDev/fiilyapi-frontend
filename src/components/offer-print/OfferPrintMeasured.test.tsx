import { render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { OfferCustomerPrint } from "./OfferCustomerPrint";
import { OfferInternalPrint } from "./OfferInternalPrint";
import { buildCustomerPrintModel } from "./print-model-customer";
import { buildInternalPrintModel } from "./print-model-internal";

/**
 * TKL-F3.6.1 · madde 1 — ölçüme dayalı sayfalama. jsdom yerleşim bilmez; `getBoundingClientRect`/`clientHeight`
 * burada TAKLİT edilir: satır yüksekliği `data-print-row` anahtarından, sabit parçalar sınıftan okunur.
 * Gerçek tarayıcı doğrulaması F3.8 playwright'ındadır (tüm alanlar azami uzunlukta fikstür).
 */
let rowHeights: Record<string, number> = {};
let contentHeight = 1097;

function fakeHeight(element: Element): number {
  const key = element.getAttribute("data-print-row");
  if (key !== null) return rowHeights[key] ?? 28;
  if (element.hasAttribute("data-print-closing")) return 300;
  if (element.tagName === "THEAD") return 24;
  if (element.classList.contains("offer-print__header")) return 100;
  if (element.classList.contains("offer-print__kunye")) return 60;
  if (element.classList.contains("offer-print__running-head")) return 20;
  return 0;
}

beforeEach(() => {
  rowHeights = {};
  contentHeight = 1097;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = fakeHeight(this);
    return { height, width: 100, top: 0, left: 0, right: 100, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("ev-print-sheet__content") ? contentHeight : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sheets = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(".ev-print-sheet"));
const itemRows = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("tr[data-print-row]")).map((row) => row.getAttribute("data-print-row"));

function customerModel(groups = [makeGroup("g1", "Kaba İnşaat", 6)]) {
  return buildCustomerPrintModel({ offer: makePrintOffer(), revision: makePrintRevision({ groups }), company: makeCompany() });
}

describe("işveren yazdırma — ölçüme dayalı sayfalama (madde 1)", () => {
  it("🔴 uzun (sarmış) satırlar statik kapasiteye değil ÖLÇÜLEN yüksekliğe göre sayfalanır; hiçbir satır kaybolmaz", () => {
    // 6 kalem × 250 px + grup başlığı/ara toplam: statik hesapta tek sayfa, gerçek yükseklikte ~1,5 sayfa.
    for (let index = 0; index < 6; index += 1) rowHeights[`g1-i${index}`] = 250;
    const { container } = render(<OfferCustomerPrint model={customerModel()} />);
    const all = sheets(container);
    expect(all.length).toBeGreaterThan(1);
    const keys = all.flatMap((sheet) => itemRows(sheet));
    for (let index = 0; index < 6; index += 1) expect(keys.filter((key) => key === `g1-i${index}`)).toHaveLength(1);
    all.forEach((sheet, index) => {
      expect(within(sheet).getByText(`Sayfa ${index + 1} / ${all.length}`)).toBeInTheDocument();
    });
  });

  it("🔴 kapanış (toplam + koşul + imza) sığmıyorsa yeni sayfaya geçer ve YALNIZ son sayfada basılır", () => {
    // Tablo ilk sayfayı doldurur: kalan yer < kapanış (300 + boşluklar).
    for (let index = 0; index < 6; index += 1) rowHeights[`g1-i${index}`] = 120;
    const { container } = render(<OfferCustomerPrint model={customerModel()} />);
    const all = sheets(container);
    expect(all.length).toBeGreaterThan(1);
    const last = all[all.length - 1]!;
    expect(container.querySelectorAll("[data-print-closing]")).toHaveLength(1);
    expect(last.querySelector("[data-print-closing]")).not.toBeNull();
    expect(within(last).getByText("Hazırlayan")).toBeInTheDocument();
  });

  it("ölçülen yükseklikler yetiyorsa sayfa sayısı DEĞİŞMEZ (gereksiz sayfa açılmaz)", () => {
    const { container } = render(<OfferCustomerPrint model={customerModel()} />);
    expect(sheets(container)).toHaveLength(1);
  });

  it("yerleşim ölçülemiyorsa (yükseklik 0 — jsdom/SSR) statik sayfalama aynen kalır", () => {
    contentHeight = 0;
    for (let index = 0; index < 6; index += 1) rowHeights[`g1-i${index}`] = 250;
    const { container } = render(<OfferCustomerPrint model={customerModel()} />);
    expect(sheets(container)).toHaveLength(1);
  });
});

describe("iç döküm yazdırma — aynı ölçüm (A4 yatay)", () => {
  it("🔴 uzun satırlar yatay sayfada da ölçülen yüksekliğe göre bölünür", () => {
    contentHeight = 768;
    const groups = [makeGroup("g1", "Kaba İnşaat", 6)];
    for (let index = 0; index < 6; index += 1) rowHeights[`g1-i${index}`] = 200;
    const model = buildInternalPrintModel({ offer: makePrintOffer(), revision: makePrintRevision({ groups }), company: makeCompany() });
    const { container } = render(<OfferInternalPrint model={model} />);
    const all = sheets(container);
    expect(all.length).toBeGreaterThan(1);
    const keys = all.flatMap((sheet) => itemRows(sheet));
    for (let index = 0; index < 6; index += 1) expect(keys.filter((key) => key === `g1-i${index}`)).toHaveLength(1);
  });
});
