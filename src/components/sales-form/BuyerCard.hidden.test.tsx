import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { CustomerResponse } from "@/lib/api/hooks/useCustomers";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { BuyerCard } from "./BuyerCard";
import { emptySaleFormValues } from "./form-state";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const customer = (id: string, name: string | null): CustomerResponse =>
  ({ id, name, customer_type: "person", national_id: null, tax_number: null }) as unknown as CustomerResponse;

function renderCard(customers: CustomerResponse[], onSelectCustomer = vi.fn()) {
  render(
    <BuyerCard
      values={emptySaleFormValues()}
      errors={{}}
      customers={customers}
      customersDisabled={false}
      advisors={[]}
      advisorsDisabled={false}
      advisorNote=""
      onChangeField={vi.fn()}
      onSelectCustomer={onSelectCustomer}
      locked={false}
    />,
  );
  return onSelectCustomer;
}

function session(hidden: readonly "satis_alici"[]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ hiddenFields: hidden }), isLoading: false } as ReturnType<typeof useSession>);
}

describe("IZN-F4.3 · müşteri seçici — maskeli ad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ad null → seçenek 'Gizli müşteri'; seçim id ile çalışır", () => {
    session(["satis_alici"]);
    const onSelect = renderCard([customer("c-1", null), customer("c-2", "Mehmet Aydın")]);
    expect(screen.getByRole("option", { name: "Gizli müşteri" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mehmet Aydın" })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("satis-form-musteri-sec"), { target: { value: "c-1" } });
    expect(onSelect).toHaveBeenCalledWith("c-1");
  });

  it("kategori gizli + maskeli müşteri var → kilit ipucu", () => {
    session(["satis_alici"]);
    renderCard([customer("c-1", null)]);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("kategori gizli DEĞİL → seçenek yine 'Gizli müşteri' ama kilit YOK", () => {
    session([]);
    renderCard([customer("c-1", null)]);
    expect(screen.getByRole("option", { name: "Gizli müşteri" })).toBeInTheDocument();
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("tüm adlar dolu → 'Gizli müşteri' ve kilit YOK", () => {
    session(["satis_alici"]);
    renderCard([customer("c-2", "Mehmet Aydın")]);
    expect(screen.queryByRole("option", { name: "Gizli müşteri" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});
