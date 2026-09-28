import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportDateNav } from "./ReportDateNav";

describe("ReportDateNav · gün kutusu (GIR-F1: takvimden gün seçme)", () => {
  it("kutu button rolündedir, erişilebilir adında görünen tarih geçer", () => {
    render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Gün seç: 12 Eylül 2026 Cumartesi" }),
    ).toBeInTheDocument();
  });

  it("kutuya tıklanınca native showPicker() çağrılır", () => {
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gün seç/ }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
  });

  it("gizli seçiciye geçerli gün yazılınca onChange o günle çağrılır", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={onChange} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-09-20" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-20");
  });

  it("max sonrası gün seçilirse onChange ÇAĞRILMAZ", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReportDateNav
        mode="day"
        day="2026-09-12"
        dayNo={130}
        weekNo={20}
        max="2026-09-24"
        onChange={onChange}
      />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-09-25" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("min öncesi gün seçilirse onChange ÇAĞRILMAZ", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReportDateNav
        mode="day"
        day="2026-09-12"
        dayNo={130}
        weekNo={20}
        min="2026-09-01"
        onChange={onChange}
      />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-08-31" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("boş değer seçilirse onChange ÇAĞRILMAZ", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={onChange} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("aynı gün seçilirse onChange ÇAĞRILMAZ", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={onChange} />,
    );
    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(picker, { target: { value: "2026-09-12" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("showPicker tanımsızken kutuya tıklamak hata fırlatmaz", () => {
    delete (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker;
    render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={vi.fn()} />,
    );
    expect(() => fireEvent.click(screen.getByRole("button", { name: /Gün seç/ }))).not.toThrow();
  });

  it("YAPISAL: gizli seçici düğmenin İÇİNDE DEĞİL (nested-interactive ihlali yok) ama nav içinde VAR", () => {
    const { container } = render(
      <ReportDateNav mode="day" day="2026-09-12" dayNo={130} weekNo={20} onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /Gün seç/ });
    expect(button.querySelector("input")).toBeNull();
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("hafta modunda kutu button DEĞİLDİR (span kalır)", () => {
    render(
      <ReportDateNav
        mode="week"
        weekNo={21}
        weekStart="2026-09-18"
        weekEnd="2026-09-24"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Hafta seç/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gün seç/ })).not.toBeInTheDocument();
  });
});

describe("ReportDateNav · gün modu", () => {
  it("başlık + Gün/Hafta ekini basar, ok değişiminde onChange ±1 gün çağırır", () => {
    const onChange = vi.fn();
    render(
      <ReportDateNav mode="day" day="2026-09-24" dayNo={142} weekNo={21} onChange={onChange} />,
    );
    expect(screen.getByText("24 Eylül 2026 Perşembe")).toBeInTheDocument();
    expect(screen.getByText("Gün 142 · H21")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sonraki gün"));
    expect(onChange).toHaveBeenCalledWith("2026-09-25");

    fireEvent.click(screen.getByLabelText("Önceki gün"));
    expect(onChange).toHaveBeenCalledWith("2026-09-23");
  });

  it("min sınırındayken önceki gün pasif; max sınırındayken sonraki gün pasif", () => {
    render(
      <ReportDateNav
        mode="day"
        day="2026-09-22"
        dayNo={140}
        weekNo={21}
        min="2026-09-22"
        max="2026-09-24"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Önceki gün")).toBeDisabled();
    expect(screen.getByLabelText("Sonraki gün")).not.toBeDisabled();
  });

  it("dayNo/weekNo ikisi de null → ek satır basılmaz", () => {
    render(<ReportDateNav mode="day" day="2026-09-24" dayNo={null} weekNo={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/Gün|H\d/)).not.toBeInTheDocument();
  });
});

describe("ReportDateNav · hafta modu", () => {
  it("\"Hafta N\" + kısa ay aralığını basar, ok değişiminde onChange ±1 hafta çağırır", () => {
    const onChange = vi.fn();
    render(
      <ReportDateNav
        mode="week"
        weekNo={21}
        weekStart="2026-09-18"
        weekEnd="2026-09-24"
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Hafta 21")).toBeInTheDocument();
    expect(screen.getByText("18–24 Eyl 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sonraki hafta"));
    expect(onChange).toHaveBeenCalledWith(22);

    fireEvent.click(screen.getByLabelText("Önceki hafta"));
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("minWeek/maxWeek sınırında ilgili ok pasif olur", () => {
    render(
      <ReportDateNav
        mode="week"
        weekNo={21}
        weekStart="2026-09-18"
        weekEnd="2026-09-24"
        minWeek={21}
        maxWeek={21}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Önceki hafta")).toBeDisabled();
    expect(screen.getByLabelText("Sonraki hafta")).toBeDisabled();
  });

  it("maxWeek null → sınırsız, sonraki hafta her zaman aktif", () => {
    render(
      <ReportDateNav
        mode="week"
        weekNo={21}
        weekStart="2026-09-18"
        weekEnd="2026-09-24"
        maxWeek={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Sonraki hafta")).not.toBeDisabled();
  });
});
