import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackendError } from "@/lib/api/unwrap";

import { offerActionGate } from "./offer-actions";
import { OfferActionBar } from "./OfferActionBar";

const downloadOfferExport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/offer-export-client", () => ({ downloadOfferExport }));

beforeEach(() => {
  downloadOfferExport.mockReset();
  downloadOfferExport.mockResolvedValue("TKL-0014-Rev2-isveren.xlsx");
});

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
  it("'PDF' düğmesi etkin bir menü açar; 'Excel' de etkin bir menüdür (Yakında kalktı)", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /^PDF/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Excel/ })).toBeEnabled();
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

describe("OfferActionBar · Excel menüsü (TKL-F4.3 · ÜS-F4-18)", () => {
  it("açılınca TAM İKİ madde: işveren teklifi (.xlsx) ve iç döküm; ikon SVG, ad yalnız 'Excel'", async () => {
    renderBar();
    const trigger = screen.getByRole("button", { name: "Excel" });
    expect(trigger.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    await userEvent.click(trigger);
    const items = within(screen.getByRole("dialog", { name: "Excel çıktısı" })).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "İşveren teklifi (.xlsx)",
      "İç döküm (maliyet + kâr)",
    ]);
  });

  it("işveren maddesi görüntülenen revizyonu view=employer ile indirir; başarıda dosya adlı bildirim", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Excel/ }));
    await userEvent.click(screen.getByRole("button", { name: "İşveren teklifi (.xlsx)" }));
    expect(downloadOfferExport).toHaveBeenCalledWith("offer-14", 2, "employer");
    expect(await screen.findByText("Excel indiriliyor · TKL-0014-Rev2-isveren.xlsx")).toBeInTheDocument();
  });

  it("iç döküm maddesi view=internal ile indirir", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Excel/ }));
    await userEvent.click(screen.getByRole("button", { name: "İç döküm (maliyet + kâr)" }));
    expect(downloadOfferExport).toHaveBeenCalledWith("offer-14", 2, "internal");
  });

  it("eski revizyonda ve kazanılmışta da açık (salt-okur kullanıcıya da)", () => {
    renderBar({ status: "won", isLatest: false });
    expect(screen.getByRole("button", { name: /^Excel/ })).toBeEnabled();
  });

  it("uçuşta düğme kilitli ve 'İndiriliyor…' yazar", async () => {
    let finish: (name: string) => void = () => {};
    downloadOfferExport.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Excel/ }));
    await userEvent.click(screen.getByRole("button", { name: "İşveren teklifi (.xlsx)" }));
    expect(screen.getByRole("button", { name: /İndiriliyor/ })).toBeDisabled();
    finish("a.xlsx");
    expect(await screen.findByRole("button", { name: /^Excel/ })).toBeEnabled();
  });

  it("hata: BackendError metni görünür", async () => {
    downloadOfferExport.mockRejectedValue(new BackendError(403, { detail: "Excel için yetkiniz yok" }));
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Excel/ }));
    await userEvent.click(screen.getByRole("button", { name: "İşveren teklifi (.xlsx)" }));
    expect(await screen.findByText("Excel için yetkiniz yok")).toBeInTheDocument();
  });
});
