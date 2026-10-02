import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { OFFER_ID } from "@/components/offers/offer-detail-fixtures";

import { makeCompany, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { OfferPrintScreen, parsePrintKind } from "./OfferPrintScreen";

const perm = vi.hoisted(() => ({ levels: { contracts: "view" } as Record<string, string | undefined> }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => {
    const level = perm.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}
function fail(status: number) {
  return { data: undefined, error: { detail: "x" }, response: new Response(null, { status }) } as never;
}

let company: ReturnType<typeof makeCompany> | "error";

function mockBackend() {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string, init?: { params?: { path?: { rev_no?: number } } }) => {
    if (path === "/offers/{offer_id}") return ok(makePrintOffer());
    if (path === "/offers/{offer_id}/revisions/{rev_no}") {
      return init?.params?.path?.rev_no === 2 ? ok(makePrintRevision()) : fail(404);
    }
    if (path === "/company") return company === "error" ? fail(500) : ok(company);
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderScreen(props: { revParam?: string | null; kindParam?: string | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OfferPrintScreen offerId={OFFER_ID} revParam={props.revParam ?? null} kindParam={props.kindParam ?? null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "view" };
  scope.value = { isRestricted: false, names: [] };
  company = makeCompany();
  mockBackend();
});

describe("parsePrintKind — ?tur= (TKL-F3.7)", () => {
  it.each([
    ["isveren", "isveren"],
    ["ic", "ic"],
    [null, "isveren"],
    ["", "isveren"],
    ["IC", "isveren"],
    ["maliyet", "isveren"],
  ])("%s → %s (bilinmeyen/eksik = en az bilgi veren işveren)", (raw, expected) => {
    expect(parsePrintKind(raw)).toBe(expected);
  });
});

describe("OfferPrintScreen", () => {
  it("tur yok → işveren (dikey) basılır; revizyon yok → güncel (Rev.2)", async () => {
    const { container } = renderScreen();
    expect(await screen.findByText("TKL-2026-0014 · Rev.2 · İşveren teklifi")).toBeInTheDocument();
    expect(container.querySelector(".ev-print-sheet")).toHaveAttribute("data-orientation", "portrait");
  });

  it("tur=ic → iç döküm (yatay)", async () => {
    const { container } = renderScreen({ kindParam: "ic" });
    expect(await screen.findByText("TKL-2026-0014 · Rev.2 · İç döküm")).toBeInTheDocument();
    expect(container.querySelector(".ev-print-sheet")).toHaveAttribute("data-orientation", "landscape");
  });

  it("?rev= var olmayan revizyon → 'Rev.9 bulunamadı'", async () => {
    renderScreen({ revParam: "9" });
    expect(await screen.findByText("Rev.9 bulunamadı")).toBeInTheDocument();
  });

  it("contracts:none → erişim reddi, hiç istek atılmaz", () => {
    perm.levels = { contracts: "none" };
    renderScreen();
    expect(screen.getByText(/yetkiniz yok|erişim/i)).toBeInTheDocument();
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("araç çubuğu: 'İşveren / İç' geçişi URL'i değiştirir (rev korunur)", async () => {
    renderScreen();
    await screen.findByText("TKL-2026-0014 · Rev.2 · İşveren teklifi");
    await userEvent.click(screen.getByRole("button", { name: "İç döküm" }));
    expect(nav.replace).toHaveBeenCalledWith(`/teklif-hazirlama/${OFFER_ID}/yazdir?rev=2&tur=ic`);
  });

  it("'Yazdır / PDF' window.print çağırır; 'Teklife dön' detaya (aynı rev) gider", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderScreen();
    await screen.findByText("TKL-2026-0014 · Rev.2 · İşveren teklifi");
    await userEvent.click(screen.getByRole("button", { name: "Yazdır / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Teklife dön" })).toHaveAttribute("href", `/teklif-hazirlama/${OFFER_ID}?rev=2`);
    print.mockRestore();
  });

  it("şirket unvanı yoksa EKRANDA uyarı (belge içinde değil)", async () => {
    company = makeCompany({ name: null });
    renderScreen();
    const warning = await screen.findByText("Şirket unvanı girilmemiş — Ayarlar › Şirket");
    expect(warning.closest("[data-testid='offer-print-document']")).toBeNull();
  });

  it("şirket okunamazsa teklif yine de basılır (başlıksız) + ekran uyarısı", async () => {
    company = "error";
    renderScreen();
    expect(await screen.findByText("TKL-2026-0014 · Rev.2 · İşveren teklifi")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Şirket unvanı girilmemiş — Ayarlar › Şirket")).toBeInTheDocument());
  });
});
