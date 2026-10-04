import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceCodeSub } from "./SourceCodeSub";

describe("SourceCodeSub", () => {
  it("kod null ise hiçbir şey basmaz", () => {
    const { container } = render(<SourceCodeSub code={null} data-testid="sc" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("screen kipi: kodu basar, title tam kod, tek satır sınıfı", () => {
    render(<SourceCodeSub code="15.100.1001" data-testid="sc" />);
    const el = screen.getByTestId("sc");
    expect(el).toHaveTextContent("15.100.1001");
    expect(el).toHaveAttribute("title", "15.100.1001");
    expect(el).toHaveClass("source-code-sub");
    expect(el).not.toHaveClass("source-code-sub--print");
  });

  it("print kipi: title yok, print sınıfı var", () => {
    render(<SourceCodeSub code="35.140.3195-D" variant="print" data-testid="sc" />);
    const el = screen.getByTestId("sc");
    expect(el).toHaveTextContent("35.140.3195-D");
    expect(el).not.toHaveAttribute("title");
    expect(el).toHaveClass("source-code-sub--print");
  });
});
