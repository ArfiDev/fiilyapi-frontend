import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RestrictedEmptyNotice } from "./RestrictedEmptyNotice";

describe("RestrictedEmptyNotice", () => {
  it("tek disiplin adıyla mockup metnini basar", () => {
    render(<RestrictedEmptyNotice names={["Civil Works"]} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.getByText("Civil Works").tagName).toBe("B");
    expect(screen.getByTestId("restricted-empty-notice")).toHaveTextContent(
      "Yalnız Civil Works disiplinindeki kalemleri görüyorsunuz.",
    );
  });

  it("birden çok disiplini 've' ile birleştirir", () => {
    render(<RestrictedEmptyNotice names={["Civil Works", "Mekanik"]} />);
    expect(screen.getByTestId("restricted-empty-notice")).toHaveTextContent(
      "Yalnız Civil Works ve Mekanik disiplinlerindeki kalemleri görüyorsunuz.",
    );
  });

  it("ad yokken adsız zarif metni basar", () => {
    render(<RestrictedEmptyNotice names={[]} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.getByText("Yalnız atanmış disiplinlerinizdeki kalemleri görüyorsunuz.")).toBeInTheDocument();
  });

  it("üç ad: 'A, B ve C' (birleştirme tek kaynaktan)", () => {
    render(<RestrictedEmptyNotice names={["A", "B", "C"]} />);
    expect(screen.getByTestId("restricted-empty-notice")).toHaveTextContent("Yalnız A, B ve C disiplinlerindeki");
  });

  it("boşluk-only ad adsız metne düşer", () => {
    render(<RestrictedEmptyNotice names={[]} />);
    expect(screen.getByText(/atanmış disiplinlerinizdeki/)).toBeInTheDocument();
  });
});
