import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { offerActionGate } from "./offer-actions";
import { OfferActionBar } from "./OfferActionBar";

function renderBar(overrides: { status?: "draft" | "sent" | "won"; isLatest?: boolean } = {}) {
  const gate = offerActionGate({
    status: overrides.status ?? "draft",
    isLatest: overrides.isLatest ?? true,
    isDirty: false,
    canWrite: true,
  });
  return render(
    <OfferActionBar
      offerId="offer-14"
      revNo={2}
      gate={gate}
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

describe("OfferActionBar · PDF menüsü (ÜS-F3-27)", () => {
  it("'PDF' düğmesi etkin bir menü açar; Excel 'Yakında' kalır", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /^PDF/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled();
  });

  it("açılır işareti metin glifi DEĞİL, SVG ikon (alt-küme sembol bekçisi); erişilebilir ad yalnız 'PDF'", () => {
    renderBar();
    const trigger = screen.getByRole("button", { name: "PDF" });
    expect(trigger.textContent).toBe("PDF");
    expect(trigger.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("iki madde doğru yazdırma rotasına gider (işveren / iç, görüntülenen revizyon)", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^PDF/ }));
    expect(screen.getByRole("link", { name: "İşveren teklifi" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/offer-14/yazdir?rev=2&tur=isveren",
    );
    expect(screen.getByRole("link", { name: "İç döküm (maliyet + kâr)" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/offer-14/yazdir?rev=2&tur=ic",
    );
  });

  it("bağlantılar yeni sekmede açılır (kaydedilmemiş form kaybolmaz)", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^PDF/ }));
    for (const name of ["İşveren teklifi", "İç döküm (maliyet + kâr)"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("eski revizyonda ve kazanılmışta da açık (yazdırma salt okuma)", async () => {
    renderBar({ status: "won", isLatest: false });
    expect(screen.getByRole("button", { name: /^PDF/ })).toBeEnabled();
  });
});
