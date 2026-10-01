import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ScheduleBudgetCard, type ScheduleBudgetCardProps } from "./ScheduleBudgetCard";
import { emptySectionFormValues } from "./form-state";

function renderCard(overrides: Partial<ScheduleBudgetCardProps> = {}) {
  const props: ScheduleBudgetCardProps = {
    values: emptySectionFormValues(),
    onChange: vi.fn(),
    dependencyOptions: [],
    existingMilestones: [],
    isNew: false,
    derivedBudget: { available: true, value: "2840000.00" },
    ...overrides,
  };
  return render(<ScheduleBudgetCard {...props} />);
}

describe("ScheduleBudgetCard — Bölüm Bedeli salt-okunur türev (BLF-F1.3, F-a)", () => {
  it("kutu KİLİTLİDİR (disabled) ve türev bedeli basar", () => {
    renderCard();
    const field = screen.getByLabelText("Bölüm Bedeli");
    expect(field).toBeDisabled();
    expect(field).toHaveValue("₺ 2.840.000");
  });

  it("zorunluluk yıldızı YOK (aria-required yok, eski '(₺)' etiketi yok)", () => {
    renderCard();
    expect(screen.getByLabelText("Bölüm Bedeli")).not.toHaveAttribute("aria-required");
    expect(screen.queryByLabelText("Bölüm Bedeli (₺)")).not.toBeInTheDocument();
  });

  it("düzenleme kipinde gerekçe: 'İş kalemlerinden hesaplanır'", () => {
    renderCard({ isNew: false });
    expect(screen.getByText("İş kalemlerinden hesaplanır")).toBeInTheDocument();
    expect(screen.queryByText("İş kalemi atanınca hesaplanır")).not.toBeInTheDocument();
  });

  it("🔴 yeni bölümde değer YOK ve gerekçe: 'İş kalemi atanınca hesaplanır'", () => {
    renderCard({ isNew: true, derivedBudget: undefined });
    const field = screen.getByLabelText("Bölüm Bedeli");
    expect(field).toBeDisabled();
    expect(field).toHaveValue("");
    expect(screen.getByText("İş kalemi atanınca hesaplanır")).toBeInTheDocument();
    expect(screen.queryByText("İş kalemlerinden hesaplanır")).not.toBeInTheDocument();
  });

  it("türev henüz yoksa (yer tutucu) sahte 0 basılmaz: '—'", () => {
    renderCard({ derivedBudget: { available: false, value: null } });
    expect(screen.getByLabelText("Bölüm Bedeli")).toHaveValue("—");
  });

  it("tahsisi olmayan bölüm 0 doğru değerdir ('₺ 0'), '—' DEĞİL (K-MKD3)", () => {
    renderCard({ derivedBudget: { available: true, value: "0.00" } });
    expect(screen.getByLabelText("Bölüm Bedeli")).toHaveValue("₺ 0");
  });
});
