// TKL-F3.7 · TEKLİF PDF — İŞVEREN/İÇ SIZINTI BEKÇİSİ, KATMAN 2 (DOM). Katman 1: `offer-print-leak-guard.test.ts`.
//
// İşveren yazdırma çıktısı RENDER edilince: (a) görünür metinde ve niteliklerde iç etiketler ve EŞ ANLAMLILARI
// ("Maliyet", "Gider", "Masraf", "Cost", "Profit", "GG", "Kâr"/"Kar", "Kâr marjı", "a-s", "Adam-saat"/"Adam saat")
// GEÇMEZ — tr-TR küçük harfe çevrilerek, büyük/küçük harf ve şapka farkından bağımsız; (b) fikstürde iç alanlara
// konmuş AYIRT EDİCİ sentinel sayılar DOM'da GÖRÜNMEZ — ham/`tr-TR` biçimli metinle YETİNİLMEZ: görünür metin,
// niteliklerin ve innerHTML'in rakamları arasındaki AYIRICILAR (`. , %` boşluk, NBSP, ince boşluk) atılmış hâlde
// sentinel RAKAM DİZİLERİ aranır (TKL-F3.6.1: "777 777,77" / "777.777.77" / "7 7 7…" atlatmaları). Fikstür iç alanları
// BİLEREK doldurur (boş alan = sahte-yeşil). Pozitif kontrol: AYNI girdi iç dökümde sentinelleri BASAR.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { backendClient } from "@/lib/api/client";
import { OFFER_ID } from "@/components/offers/offer-detail-fixtures";
import { LEAK_SENTINELS, makeCompany, makePrintOffer, makePrintRevision } from "@/components/offer-print/offer-print-fixtures";
import { OfferCustomerPrint } from "@/components/offer-print/OfferCustomerPrint";
import { OfferInternalPrint } from "@/components/offer-print/OfferInternalPrint";
import { OfferPrintScreen } from "@/components/offer-print/OfferPrintScreen";
import { buildCustomerPrintModel } from "@/components/offer-print/print-model-customer";
import { buildInternalPrintModel } from "@/components/offer-print/print-model-internal";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

/** Harf sınırı: JS `\b` Türkçe harfleri (â, ı, ş…) kelime saymaz → Unicode özellikli özel sınır. */
const WORD = (source: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "u");
/** tr-TR küçük harfe çevrilmiş metinde aranan iç etiketler + eş anlamlıları. */
const FORBIDDEN_WORDS: readonly RegExp[] = [
  WORD("maliyet"),
  WORD("(?:genel )?gider"),
  WORD("masraf"),
  WORD("gg"),
  WORD("k[aâ]r(?: marj[ıi])?"),
  WORD("a-s"),
  WORD("adam[\\s\\-/_]*saat"),
  WORD("cost"),
  WORD("profit"),
  WORD("overhead"),
  WORD("internal"),
];
/** Rakamlar ARASINDAKİ ayırıcılar: nokta, virgül, yüzde, her tür boşluk (`\s` NBSP · dar NBSP · ince boşluk dahil). */
const DIGIT_SEPARATORS = /(?<=\d)[.,%\s]+(?=\d)/gu;
/** Sentinel rakam dizileri: `raw`ın rakamları (örn. "777777.77" → "77777777") — gerçek değerlerle çakışmayan dizilerdir. */
const SENTINEL_DIGITS = [...new Set(Object.values(LEAK_SENTINELS).map(({ raw }) => raw.replace(/\D/g, "")))];
const MIN_SENTINEL_DIGITS = 4;

/** Görünür metin + TÜM nitelik değerleri + innerHTML — her biri ayrı parça (parçalar birbirine yapışmaz). */
function surfaces(container: HTMLElement): string[] {
  const elements = Array.from(container.querySelectorAll("*"));
  const attributes = elements.flatMap((element) => Array.from(element.attributes).map((attribute) => attribute.value));
  const texts = elements.map((element) => element.textContent ?? "");
  return [container.textContent ?? "", container.innerHTML, ...attributes, ...texts];
}

/** Ayırıcıları rakamlar arasından atar: "777 777,77" · "777.777.77" · "7 7 7 7" → "77777777". */
const collapseDigits = (text: string) => text.replace(DIGIT_SEPARATORS, "");

/** İşveren çıktısındaki sızıntılar (boş = temiz): iç etiket/eş anlamlı + sentinel rakam dizisi. */
export function findLeaks(container: HTMLElement): string[] {
  const leaks: string[] = [];
  for (const surface of surfaces(container)) {
    // tr-TR "I"yı "ı" yapar ("PROFIT" → "profıt"); ASCII küçültme "İ"yi bozar → İKİSİ de aranır.
    const lowered = [surface.toLocaleLowerCase("tr-TR"), surface.toLowerCase()];
    for (const word of FORBIDDEN_WORDS) {
      if (lowered.some((text) => word.test(text))) leaks.push(`etiket ${word.source}`);
    }
    const digits = collapseDigits(surface);
    for (const sentinel of SENTINEL_DIGITS) {
      if (sentinel.length >= MIN_SENTINEL_DIGITS && digits.includes(sentinel)) leaks.push(`sentinel ${sentinel}`);
    }
  }
  return [...new Set(leaks)];
}

function expectNoLeak(container: HTMLElement) {
  expect(findLeaks(container)).toEqual([]);
  const html = container.innerHTML;
  for (const { raw, shown } of Object.values(LEAK_SENTINELS)) {
    expect(html).not.toContain(raw);
    expect(html).not.toContain(shown);
  }
}

function customerModel() {
  return buildCustomerPrintModel({ offer: makePrintOffer(), revision: makePrintRevision(), company: makeCompany() });
}

describe("DOM sızıntı bekçisi — işveren çıktısı", () => {
  it("OfferCustomerPrint: iç etiket ve iç sentinel YOK", () => {
    const { container } = render(<OfferCustomerPrint model={customerModel()} />);
    expect(container.querySelectorAll(".ev-print-sheet").length).toBeGreaterThan(0);
    expectNoLeak(container);
  });

  it("çok sayfalı işveren çıktısında da YOK", () => {
    const base = makePrintRevision();
    const groups = Array.from({ length: 8 }, (_, index) => ({ ...base.groups[0]!, id: `g${index}`, name: `Grup ${index}` }));
    const model = buildCustomerPrintModel({ offer: makePrintOffer(), revision: makePrintRevision({ groups }), company: makeCompany() });
    const { container } = render(<OfferCustomerPrint model={model} />);
    expect(container.querySelectorAll(".ev-print-sheet").length).toBeGreaterThan(1);
    expectNoLeak(container);
  });

  it("POZİTİF KONTROL: aynı girdiyle iç döküm sentinelleri BASAR (bekçi kör değil)", () => {
    const model = buildInternalPrintModel({ offer: makePrintOffer(), revision: makePrintRevision(), company: makeCompany() });
    const { container } = render(<OfferInternalPrint model={model} />);
    const html = container.innerHTML;
    for (const key of ["itemCost", "itemCostUnitPrice", "totalCost", "totalOverhead", "totalProfit", "totalManHours"] as const) {
      expect(html).toContain(LEAK_SENTINELS[key].shown);
    }
    expect(container.textContent).toMatch(/Maliyet/);
  });
});

describe("bekçinin kendisi (DOM) — her atlatma POZİTİF KONTROLdür", () => {
  const leaksOf = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return findLeaks(host);
  };

  it("temiz işveren çıktısı: sızıntı YOK (yanlış-pozitif yok)", () => {
    expect(leaksOf("<table><tbody><tr><td>Kaba İnşaat</td><td>128,80</td><td>12.880,00</td><td>Genel toplam ₺ 88.778.568,00</td></tr></tbody></table>")).toEqual([]);
    expect(leaksOf("<p>Hazırlayan: Selin Aksoy · Karadeniz Sokak 4 · Kadıköy V.D.</p>")).toEqual([]);
  });

  // ── C1 · ayırıcı atlatmaları: sentinel "777777.77" başka biçimde yazılırsa ham/tr-TR metin aramaları KAÇIRIRDI ──
  it("C1: sentinel rakam dizisi ayırıcı/boşluk/NBSP/ince boşluk/yüzde ile bölünse de YAKALANIR", () => {
    for (const variant of [
      "777 777,77",
      "777.777.77",
      "777\u00a0777,77",
      "777\u202f777,77",
      "7 7 7 7 7 7 7 7",
      "777%777,77",
      "777,777,77",
    ]) {
      expect(leaksOf(`<td>${variant}</td>`)).toContain("sentinel 77777777");
    }
  });

  it("C1: nitelikte (title/aria-label/data-*) ve etiketler arasına bölünmüş rakamlar da YAKALANIR", () => {
    expect(leaksOf('<span title="777 777,77">x</span>')).toContain("sentinel 77777777");
    expect(leaksOf('<span data-x="4 4 4 4 4 4">x</span>')).toContain("sentinel 444444");
    expect(leaksOf("<span>777<b>.</b>777,77</span>")).toContain("sentinel 77777777");
  });

  // ── C2 · eş anlamlı / şapkasız / büyük harf iç etiketler ──────────────────────────────────────────
  it("C2: 'kar', 'KÂR MARJI', 'adam saat', 'masraf', 'cost', 'profit', 'gider' — büyük/küçük harf ve şapkadan bağımsız YAKALANIR", () => {
    for (const word of ["kar", "KAR", "Kâr", "KÂR MARJI", "Kar Marjı", "adam saat", "ADAM-SAAT", "Adam/Saat", "masraf", "MASRAF", "cost", "Cost", "PROFIT", "profit", "gider", "GİDER", "Genel Gider", "overhead"]) {
      expect(leaksOf(`<span>${word}</span>`), word).not.toEqual([]);
    }
  });

  it("C2: nitelik değerinde de yakalanır; harf sınırı yanlış-pozitif üretmez ('karşı', 'Karaköy', 'costume' temiz)", () => {
    expect(leaksOf('<span aria-label="Maliyet">x</span>')).not.toEqual([]);
    expect(leaksOf('<span title="KAR MARJI">x</span>')).not.toEqual([]);
    expect(leaksOf("<span>karşı taraf · Karaköy · costume</span>")).toEqual([]);
  });
});

describe("DOM sızıntı bekçisi — tam ekran (araç çubuğu dahil), tur=isveren", () => {
  beforeEach(() => {
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
      const data =
        path === "/offers/{offer_id}" ? makePrintOffer() : path === "/company" ? makeCompany() : makePrintRevision();
      return { data, error: undefined, response: new Response(null, { status: 200 }) };
    }) as never);
  });

  function renderScreen(kindParam: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <OfferPrintScreen offerId={OFFER_ID} revParam="2" kindParam={kindParam} />
      </QueryClientProvider>,
    );
  }

  it.each([["isveren"], [null], ["bilinmeyen"]])("tur=%s → sızıntı YOK", async (kind) => {
    const { container } = renderScreen(kind);
    await screen.findByText(/İşveren teklifi/);
    expectNoLeak(container);
  });

  it("tur=ic → iç döküm (sentinel görünür) — ayrım gerçekten tur'a bağlı", async () => {
    const { container } = renderScreen("ic");
    await screen.findAllByText(/İç döküm/);
    expect(container.innerHTML).toContain(LEAK_SENTINELS.totalCost.shown);
  });
});
