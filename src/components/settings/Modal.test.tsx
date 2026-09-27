import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

describe("Modal", () => {
  it("baslik + icerik render eder", () => {
    render(<Modal title="Test" onClose={() => {}}><span>govde</span></Modal>);
    expect(screen.getByRole("dialog", { name: "Test" })).toBeInTheDocument();
    expect(screen.getByText("govde")).toBeInTheDocument();
  });

  it("Kapat butonu onClose cagirir", async () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}><span>govde</span></Modal>);
    await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape tusu onClose cagirir", async () => {
    const onClose = vi.fn();
    render(<Modal title="Test" onClose={onClose}><span>govde</span></Modal>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// F-BLG T2a `className` prop'unu EKLEDI (mockup'i iki kolonlu cizilmis alti
// form diyalogu 480px varsayilana sigmiyordu). Prop OPSIYONELdir; asagidaki
// uc kare "eklemenin ZARARSIZ oldugunu" kilitler: gecmeyen 17 cagiranin
// govdesi DEGISMEZ. `cx` bosluk/undefined sizdirirsa (or. `join` yerine
// sablon dizesi) bu testler kirmizi olur.
describe("Modal · opsiyonel className (F-BLG T2a additive kaniti)", () => {
  it("className GECILMEZSE kabuk sinifi tam olarak `modal`dir", () => {
    render(<Modal title="Test" onClose={() => {}}><span>govde</span></Modal>);
    // `toHaveClass` fazladan sinifi gormez; ham `class` degeri karsilastirilir
    // ki "modal " (arta kalan bosluk) veya "modal undefined" de yakalansin.
    expect(screen.getByRole("dialog").getAttribute("class")).toBe("modal");
  });

  it("className GECILIRSE `modal`in YANINA eklenir, yerine GECMEZ", () => {
    render(
      <Modal title="Test" onClose={() => {}} className="pif-modal">
        <span>govde</span>
      </Modal>,
    );
    expect(screen.getByRole("dialog").getAttribute("class")).toBe("modal pif-modal");
  });

  it("className diyalogun IC yapisini degistirmez (baslik/govde/dipnot ayni)", () => {
    const bare = render(
      <Modal title="Test" onClose={() => {}} footer={<button>Kaydet</button>}>
        <span>govde</span>
      </Modal>,
    );
    const bareDialog = screen.getByRole("dialog").innerHTML;
    bare.unmount();

    render(
      <Modal title="Test" onClose={() => {}} className="dcf-modal" footer={<button>Kaydet</button>}>
        <span>govde</span>
      </Modal>,
    );
    expect(screen.getByRole("dialog").innerHTML).toBe(bareDialog);
  });
});

// A11Y BULGUSU: diyalog `aria-modal` tasiyordu ama odak yonetimi yoktu —
// klavye kullanicisi acilista sayfada kaliyor ve Tab ile gorsel olarak
// ortulmus icerige cikabiliyordu. Tuzak paylasilan primitive'de kuruldu.
describe("Modal — odak yonetimi", () => {
  function renderModal(onClose = () => {}) {
    return render(
      <Modal title="Test" onClose={onClose} footer={<button type="button">Kaydet</button>}>
        <button type="button">Ilk</button>
        <button type="button">Ikinci</button>
      </Modal>,
    );
  }

  it("acilista odak diyalogun ilk odaklanabilir ogesine tasinir", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Kapat" })).toHaveFocus();
  });

  it("odaklanabilir ogesi olmayan diyalogda odak kabin uzerine tasinir", () => {
    render(
      <Modal title="Bos" onClose={() => {}}>
        <span>govde</span>
      </Modal>,
    );
    // Kapat butonu her zaman var; onu gizleyerek "hic odaklanabilir yok"
    // durumunu kurmak yerine dogrudan kabin odaklanabilirligini dogrula.
    expect(screen.getByRole("dialog", { name: "Bos" })).toHaveAttribute("tabindex", "-1");
  });

  it("Tab son odaklanabilir ogeden ilkine sarar", async () => {
    const user = userEvent.setup();
    renderModal();
    const kapat = screen.getByRole("button", { name: "Kapat" });
    const kaydet = screen.getByRole("button", { name: "Kaydet" });

    kaydet.focus();
    expect(kaydet).toHaveFocus();
    await user.tab();
    expect(kapat).toHaveFocus();
  });

  it("Shift+Tab ilk ogeden sonuncuya geri sarar", async () => {
    const user = userEvent.setup();
    renderModal();
    const kapat = screen.getByRole("button", { name: "Kapat" });
    const kaydet = screen.getByRole("button", { name: "Kaydet" });

    expect(kapat).toHaveFocus();
    await user.tab({ shift: true });
    expect(kaydet).toHaveFocus();
  });

  it("Tab diyalog icinde sirayla ilerler, disari cikmaz", async () => {
    const user = userEvent.setup();
    renderModal();
    const order = [
      screen.getByRole("button", { name: "Kapat" }),
      screen.getByRole("button", { name: "Ilk" }),
      screen.getByRole("button", { name: "Ikinci" }),
      screen.getByRole("button", { name: "Kaydet" }),
    ];
    expect(order[0]).toHaveFocus();
    for (let index = 1; index < order.length; index += 1) {
      await user.tab();
      expect(order[index]).toHaveFocus();
    }
    await user.tab();
    expect(order[0]).toHaveFocus();
  });

  it("kapanista odak modali acan ogeye geri doner", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ac
          </button>
          {open && (
            <Modal title="Test" onClose={() => setOpen(false)}>
              <span>govde</span>
            </Modal>
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Ac" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Kapat" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

// 🔴 KAYIT 58: diyalog açıkken ARKA PLAN kaydırılabilir kalıyordu —
// `document.body.style.overflow`a dokunan hiçbir satır yoktu. 20+ form
// modalı bu bileşeni paylaşıyor.
describe("Modal · gövde kaydırma kilidi (kayıt 58)", () => {
  it("açılışta `document.body.style.overflow` 'hidden' olur, kapanışta ESKİ DEĞERE döner", () => {
    document.body.style.overflow = "auto";

    const { unmount } = render(
      <Modal title="Test" onClose={() => {}}>
        <span>govde</span>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});

// 🔴 KAYIT 50: arka plana yanlışlıkla tıklamak, dolu bir formda onay
// sormadan diyaloğu kapatıp veri kaybına yol açıyordu. `isDirty` OPSİYONEL
// bir opt-in'dir — geçmeyen 19 çağıranın davranışı DEĞİŞMEZ.
describe("Modal · overlay tıklaması onay kapısı (kayıt 50, isDirty opt-in)", () => {
  it("isDirty verilmezse (varsayılan) overlay tıklaması DOĞRUDAN kapatır — eski davranış AYNI", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <span>gövde</span>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("isDirty=true iken onaylanırsa kapanır", async () => {
    const onClose = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <Modal title="Test" onClose={onClose} isDirty>
        <span>gövde</span>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("presentation"));
    expect(window.confirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("isDirty=true iken REDDEDİLİRSE kapanmaz — veri kaybı önlenir", async () => {
    const onClose = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Modal title="Test" onClose={onClose} isDirty>
        <span>gövde</span>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// SEKME-F1.3 · üst çubuk sekme onayı `unsavedRegistry`den okur — diyaloğun
// `isDirty` prop'u burada da BAĞLI olmalı ki formu açık bir diyalogla sekme
// değiştirmek sessizce veri kaybettirmesin.
describe("Modal · unsavedRegistry bağlantısı", () => {
  it("isDirty=true iken açıkken kayıt 'kirli' olur, isDirty false olunca düşer", () => {
    const { rerender, unmount } = render(
      <Modal title="Test" onClose={() => {}} isDirty={false}>
        <span>gövde</span>
      </Modal>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    rerender(
      <Modal title="Test" onClose={() => {}} isDirty>
        <span>gövde</span>
      </Modal>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // "Kaydet" sonrası çağıran isDirty'yi false'a düşürür — modal AÇIK
    // kalsa bile kayıt temizlenmeli.
    rerender(
      <Modal title="Test" onClose={() => {}} isDirty={false}>
        <span>gövde</span>
      </Modal>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
  });

  it("diyalog kirliyken KAPANIRSA (unmount) kayıt da silinir", () => {
    const { unmount } = render(
      <Modal title="Test" onClose={() => {}} isDirty>
        <span>gövde</span>
      </Modal>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
