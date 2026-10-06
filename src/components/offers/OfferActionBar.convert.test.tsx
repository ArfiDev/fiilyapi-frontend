import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { offerActionGate, offerConvertGate, type OfferConvertVerdict } from "./offer-actions";
import { OfferActionBar } from "./OfferActionBar";

vi.mock("@/lib/api/offer-export-client", () => ({ downloadOfferExport: vi.fn() }));

function renderBar(convert: OfferConvertVerdict | undefined) {
  const gate = offerActionGate({ status: "won", isLatest: true, isDirty: false, canWrite: true });
  return render(
    <OfferActionBar
      offerId="offer-14"
      revNo={2}
      gate={gate}
      convert={convert}
      isBusy={false}
      isSaving={false}
      onSave={vi.fn()}
      onNewRevision={vi.fn()}
      onSend={vi.fn()}
      onWin={vi.fn()}
      onLose={vi.fn()}
      onWithdraw={vi.fn()}
    />,
  );
}

const ALLOWED = { status: "won", conversionState: "won_not_converted", canConvert: true, isLatest: true } as const;

describe("OfferActionBar · Projeye Dönüştür (TKL-F5.5, ÜS-F5-2)", () => {
  it("etkin → düğme görünümlü BAĞLANTI, Dönüştür ekranına gider", () => {
    renderBar(offerConvertGate(ALLOWED));
    expect(screen.getByRole("link", { name: "Projeye Dönüştür →" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/offer-14/donustur",
    );
  });

  it("Onaylar yok → PASİF düğme + GÖRÜNÜR gerekçe (yalnız title değil); bağlantı YOK", () => {
    renderBar(offerConvertGate({ ...ALLOWED, canConvert: false }));
    expect(screen.queryByRole("link", { name: "Projeye Dönüştür →" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projeye Dönüştür →" })).toBeDisabled();
    expect(
      screen.getByText("Projeye dönüştürme için Teklif Hazırlama sayfasında Onaylar yetkisi gerekir"),
    ).toBeVisible();
  });

  it("gizli ya da verilmemiş → ne bağlantı ne düğme", () => {
    for (const convert of [offerConvertGate({ ...ALLOWED, conversionState: "converted" }), undefined]) {
      const { unmount } = renderBar(convert);
      expect(screen.queryByText(/Projeye Dönüştür/)).not.toBeInTheDocument();
      unmount();
    }
  });
});
