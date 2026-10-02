import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import YeniTeklifPage from "./page";

const screenProps = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/components/offers/OfferCreateScreen", () => ({
  OfferCreateScreen: (props: unknown) => {
    screenProps.calls.push(props);
    return <div data-testid="offer-create-stub" />;
  },
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  cleanup();
  screenProps.calls.length = 0;
  render(await YeniTeklifPage({ searchParams: Promise.resolve(searchParams) }));
  expect(screen.getByTestId("offer-create-stub")).toBeInTheDocument();
  return screenProps.calls[0];
}

describe("/teklif-hazirlama/yeni sayfası (?sablon=)", () => {
  it("?sablon= değeri ekrana initialTemplateId olarak geçer", async () => {
    expect(await renderPage({ sablon: "tpl-1" })).toEqual({ initialTemplateId: "tpl-1" });
  });
  it("parametre yoksa, boşsa ya da çoklu ise başlangıç boştur", async () => {
    expect(await renderPage({})).toEqual({ initialTemplateId: undefined });
    expect(await renderPage({ sablon: "" })).toEqual({ initialTemplateId: undefined });
    expect(await renderPage({ sablon: ["a", "b"] })).toEqual({ initialTemplateId: undefined });
  });
});
