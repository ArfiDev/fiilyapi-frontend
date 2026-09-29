import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiaryDetailLinesCard } from "./DiaryDetailLinesCard";
import type { DetailLineGroups } from "./lines-derive";

// DSC-F1.3 · kısıtlı kullanıcıda TÜM liste boşken bildirim (grup içi boş hâl değişmez).
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const NONE: DetailLineGroups = { current: null, others: [], totalCount: 0, dayAmountTotal: "0.00" };

function renderCard() {
  return render(
    <DiaryDetailLinesCard groups={NONE} columns={null} notice={null} isPaymentHidden={false} paymentsHref="/x" />,
  );
}

describe("DiaryDetailLinesCard — kısıtlı boş durum (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı + tüm liste boş → ortak bildirim", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    renderCard();
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Bu gün miktar satırı girilmemiş")).not.toBeInTheDocument();
  });

  it("atamasız + tüm liste boş → bugünkü metin aynen", () => {
    renderCard();
    expect(screen.getByText("Bu gün miktar satırı girilmemiş")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
