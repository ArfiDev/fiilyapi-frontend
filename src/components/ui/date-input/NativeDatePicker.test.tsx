import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NativeDatePicker, type NativeDatePickerHandle } from "./NativeDatePicker";

/**
 * GIR-F1 · Gizli native `type="date"` seçici — `DateInput.tsx`teki desenin
 * (gizli girdi + `showPicker()`) yeniden kullanılabilir çekirdeği.
 * `onPick` yalnız GEÇERLİ ve sınır İÇİNDE, DEĞİŞEN bir gün için çağrılır —
 * bekçilik burada durur, çağıran (`ReportDateNav`) ekstra denetim YAPMAZ.
 */
describe("NativeDatePicker — gizli seçici + showPicker", () => {
  it("open() çağrılınca native showPicker() tetiklenir", () => {
    const showPicker = vi.fn();
    // jsdom'da showPicker tanımsız — testin kendisi tanımlar.
    HTMLInputElement.prototype.showPicker = showPicker;
    const ref = createRef<NativeDatePickerHandle>();
    render(<NativeDatePicker ref={ref} value="2026-09-24" onPick={vi.fn()} />);

    ref.current?.open();

    expect(showPicker).toHaveBeenCalledTimes(1);
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
  });

  it("showPicker tanımsızken open() hata fırlatmaz", () => {
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
    const ref = createRef<NativeDatePickerHandle>();
    render(<NativeDatePicker ref={ref} value="2026-09-24" onPick={vi.fn()} />);

    expect(() => ref.current?.open()).not.toThrow();
  });

  it("showPicker hata fırlatırsa open() dışa sessizce geçer (kullanıcı etkinliği yok vb.)", () => {
    HTMLInputElement.prototype.showPicker = vi.fn(() => {
      throw new Error("kullanıcı etkinliği gerekli");
    });
    const ref = createRef<NativeDatePickerHandle>();
    render(<NativeDatePicker ref={ref} value="2026-09-24" onPick={vi.fn()} />);

    expect(() => ref.current?.open()).not.toThrow();
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
  });

  it("geçerli gün seçilince onPick o günle çağrılır", () => {
    const onPick = vi.fn();
    const { container } = render(
      <NativeDatePicker value="2026-09-24" min="2026-09-01" max="2026-09-30" onPick={onPick} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-09-12" } });
    expect(onPick).toHaveBeenCalledWith("2026-09-12");
  });

  it("max sonrası gün → onPick ÇAĞRILMAZ (jsdom native `max` özniteliğini denetlemez, bu yüzden guard koddadır)", () => {
    const onPick = vi.fn();
    const { container } = render(
      <NativeDatePicker value="2026-09-24" max="2026-09-30" onPick={onPick} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-10-01" } });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("min öncesi gün → onPick ÇAĞRILMAZ", () => {
    const onPick = vi.fn();
    const { container } = render(
      <NativeDatePicker value="2026-09-24" min="2026-09-01" onPick={onPick} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-08-31" } });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("boş değer → onPick ÇAĞRILMAZ", () => {
    const onPick = vi.fn();
    const { container } = render(<NativeDatePicker value="2026-09-24" onPick={onPick} />);
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "" } });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("aynı gün seçimi → onPick ÇAĞRILMAZ", () => {
    const onPick = vi.fn();
    const { container } = render(<NativeDatePicker value="2026-09-24" onPick={onPick} />);
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-09-24" } });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("YAPISAL: gizli seçici sekme durağı DEĞİLDİR ve erişilebilirlik ağacından gizlidir", () => {
    const { container } = render(<NativeDatePicker value="2026-09-24" onPick={vi.fn()} />);
    const picker = container.querySelector('input[type="date"]');
    expect(picker).toHaveAttribute("tabindex", "-1");
    expect(picker).toHaveAttribute("aria-hidden", "true");
  });

  it("disabled iken gizli seçici de devre dışıdır", () => {
    const { container } = render(
      <NativeDatePicker value="2026-09-24" disabled onPick={vi.fn()} />,
    );
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
  });
});
