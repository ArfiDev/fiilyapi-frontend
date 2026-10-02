import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("bir textbox render eder ve yazmayi kabul eder", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Ad" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ad" }), "ab");
    expect(onChange).toHaveBeenCalled();
  });

  it("error durumunda hata sinifini uygular", () => {
    render(<Input aria-label="Ad" status="error" />);
    expect(screen.getByRole("textbox").className).toContain("input--error");
  });

  it("numeric iken mono sinifini uygular", () => {
    render(<Input aria-label="Tutar" numeric />);
    expect(screen.getByRole("textbox").className).toContain("input--numeric");
  });

  it("sol ikonu render eder", () => {
    render(<Input aria-label="Ara" leftIcon={<span data-testid="ic" />} />);
    expect(screen.getByTestId("ic")).toBeInTheDocument();
  });

  it("disabled iken devre disidir", () => {
    render(<Input aria-label="Ad" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // T2 — satır-içi düzenleme tablosu varyantı (şantiye mockup .row-in, satır 27)
  it("size verilmezse form varyanti sinifi basilir (row YOK)", () => {
    render(<Input aria-label="Ad" />);
    const el = screen.getByRole("textbox");
    expect(el.className).toContain("input");
    expect(el.className).not.toContain("input--row");
  });

  it("size=row ui-input--row sinifini ekler", () => {
    render(<Input aria-label="Bolum adi" size="row" />);
    expect(screen.getByRole("textbox").className).toContain("input--row");
  });

  it("size=row status=error ile birlikte calisir", () => {
    render(<Input aria-label="Bolum adi" size="row" status="error" />);
    const el = screen.getByRole("textbox");
    expect(el.className).toContain("input--row");
    expect(el.className).toContain("input--error");
  });

  it("size prop'u DOM'un size ozniteligine sizmaz", () => {
    render(<Input aria-label="Bolum adi" size="row" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("size");
  });

  // 🔴 KAYIT 373: `className` yalnız iç `<input>`e gider — yerleşim sınıfı
  // vermek isteyen çağıran (ör. flex genişliği) yanlış elemana inerdi.
  it("className iç <input>'e gider, dış <span>'e SIZMAZ", () => {
    render(<Input aria-label="Ad" className="ozel-sinif" />);
    expect(screen.getByRole("textbox").className).toContain("ozel-sinif");
    expect(screen.getByRole("textbox").parentElement?.className).not.toContain("ozel-sinif");
  });

  it("wrapperClassName dış <span>'e (.input-wrap) gider, iç <input>'e SIZMAZ", () => {
    render(<Input aria-label="Ad" wrapperClassName="genislik-oto" />);
    const input = screen.getByRole("textbox");
    expect(input.parentElement?.className).toContain("input-wrap");
    expect(input.parentElement?.className).toContain("genislik-oto");
    expect(input.className).not.toContain("genislik-oto");
  });

  // TKL-F4.8 — metin son eki payı (K-F4-5: "30gün")
  it("suffixChars + rightIcon: --suffix sinifi ve karakter sayisi degiskeni basilir", () => {
    render(<Input aria-label="Gün" rightIcon={<span>gün</span>} suffixChars={3} />);
    const wrap = screen.getByRole("textbox").parentElement as HTMLElement;
    expect(wrap.className).toContain("input-wrap--suffix");
    expect(wrap.style.getPropertyValue("--input-suffix-chars")).toBe("3");
  });

  it("suffixChars verilmezse (ör. % simgesi) --suffix sinifi YOK", () => {
    render(<Input aria-label="Yüzde" rightIcon={<span>%</span>} />);
    expect((screen.getByRole("textbox").parentElement as HTMLElement).className).not.toContain("input-wrap--suffix");
  });
});
