// TKL-F3.7 · TEKLİF PDF — İŞVEREN/İÇ SIZINTI BEKÇİSİ, KATMAN 2 (DOM). Katman 1: `offer-print-leak-guard.test.ts`.
//
// İşveren yazdırma çıktısı RENDER edilince: (a) görünür metinde ve niteliklerde iç etiketler ("Maliyet",
// "Gider", "GG", "Kâr", "a-s", "Adam-saat") GEÇMEZ; (b) fikstürde iç alanlara konmuş AYIRT EDİCİ
// sentinel sayılar (ham ve `tr-TR` biçimli) DOM'da GÖRÜNMEZ. Fikstür iç alanları BİLEREK doldurur
// (boş alan = sahte-yeşil). Pozitif kontrol: AYNI girdi iç dökümde sentinelleri BASAR — yani test
// "hiçbir şey basılmadığı" için geçmiyor.
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
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: "view", canView: true, canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const FORBIDDEN_WORDS = [/maliyet/i, /gider/i, /\bGG\b/, /kâr/i, /\ba-s\b/i, /adam-saat/i];

/** Görünür metin + TÜM nitelik değerleri (title, aria-label, alt, data-*, class …). */
function surface(container: HTMLElement): string {
  const attributes = Array.from(container.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.attributes).map((attribute) => attribute.value),
  );
  return [container.textContent ?? "", ...attributes].join("\n");
}

function expectNoLeak(container: HTMLElement) {
  const text = surface(container);
  for (const word of FORBIDDEN_WORDS) expect(text).not.toMatch(word);
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
