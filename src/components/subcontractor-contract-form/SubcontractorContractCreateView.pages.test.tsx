import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useEmployerContract } from "@/lib/api/hooks/useContract";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSubcontractorContract } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { SubcontractorContractCreateView } from "./SubcontractorContractCreateView";

// IZN-F5b · madde 7 — form girişi = POST /projects/{id}/subcontractor-contracts (SUBCONTRACTOR_CONTRACT_CREATE_EDIT:
// teklif.sozlesmeler, teklif.taseron_sozlesme); "+ Yeni Taşeron Ekle" = POST /subcontractors
// (SUBCONTRACTOR_CREATE_EDIT: teklif.taseron_firmalar, teklif.sozlesmeler).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseron/yeni",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));
vi.mock("@/lib/api/hooks/useContract", () => ({ useEmployerContract: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", () => ({ useSubcontractorContract: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractorMutations", () => ({
  useCreateSubcontractor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", () => ({
  useCreateSubcontractorContract: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSubcontractorContract: () => ({ mutate: vi.fn(), isPending: false }),
  useLoadSubcontractorContractItemsFromEmployer: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSubcontractorContractItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSubcontractorContractItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

const NEW_FIRM = "+ Yeni Taşeron Ekle";

function query<T>(data: T | undefined) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function renderView(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  return render(<SubcontractorContractCreateView />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProjects).mockReturnValue(query({ items: [{ id: "p-1", name: "Proje" }], counts: {} }));
  vi.mocked(useSites).mockReturnValue(query({ items: [], counts: {}, totals: {} }));
  vi.mocked(useSubcontractors).mockReturnValue(query({ items: [] }));
  vi.mocked(useEmployerContract).mockReturnValue(query(undefined));
  vi.mocked(useSubcontractorContract).mockReturnValue(query(undefined));
});

describe("SubcontractorContractCreateView · sayfa kapıları (IZN-F5b)", () => {
  it("teklif.sozlesmeler + teklif.taseron_sozlesme Düzenler → form açılır, '+ Yeni Taşeron Ekle' var", () => {
    renderView(
      meFixture({ pages: { "teklif.sozlesmeler": pageGrant("edit"), "teklif.taseron_sozlesme": pageGrant("edit") } }),
    );
    expect(screen.getByRole("combobox", { name: "Taşeron Firma" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: NEW_FIRM })).toBeInTheDocument();
  });

  it("KESİŞİM: yalnız teklif.sozlesmeler Düzenler (taşeron sözleşme Görür) → AccessDenied (sonraki yazmalar 403 olurdu)", () => {
    renderView(
      meFixture({ pages: { "teklif.sozlesmeler": pageGrant("edit"), "teklif.taseron_sozlesme": pageGrant("view") } }),
    );
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Taşeron Firma" })).toBeNull();
  });

  it("yalnız teklif.taseron_sozlesme Düzenler → form açılır ama firma ekleme seçeneği YOK", () => {
    renderView(meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("edit") } }));
    expect(screen.getByRole("combobox", { name: "Taşeron Firma" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: NEW_FIRM })).toBeNull();
  });

  it("yalnız teklif.taseron_firmalar Düzenler → AccessDenied (sözleşme oluşturma ucu kapalı)", () => {
    renderView(meFixture({ pages: { "teklif.taseron_firmalar": pageGrant("edit") } }));
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Taşeron Firma" })).toBeNull();
  });
});
