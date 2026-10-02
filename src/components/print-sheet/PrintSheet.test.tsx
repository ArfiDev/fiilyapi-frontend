import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrintSheet } from "./PrintSheet";

describe("PrintSheet — yönlendirme (TKL-F3.7)", () => {
  it("varsayılan yön YATAY (EV davranışı değişmez): dikey işaret sınıfı yok", () => {
    const { container } = render(
      <PrintSheet page={1} pageCount={1}>
        <div>x</div>
      </PrintSheet>,
    );
    const sheet = container.querySelector(".ev-print-sheet");
    expect(sheet).toHaveAttribute("data-orientation", "landscape");
    expect(sheet).not.toHaveClass("ev-print-sheet--portrait");
    expect(container.querySelector("style[data-print-page-size]")).toBeNull();
  });

  it("orientation=portrait: dikey sınıf + A4 dikey @page kuralı", () => {
    const { container } = render(
      <PrintSheet page={1} pageCount={1} orientation="portrait">
        <div>x</div>
      </PrintSheet>,
    );
    const sheet = container.querySelector(".ev-print-sheet");
    expect(sheet).toHaveAttribute("data-orientation", "portrait");
    expect(sheet).toHaveClass("ev-print-sheet--portrait");
    expect(container.querySelector("style[data-print-page-size]")?.textContent).toContain("A4 portrait");
  });
});
