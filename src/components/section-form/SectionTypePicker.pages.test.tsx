import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionTypePicker } from "./SectionTypePicker";
import { useSession } from "@/components/shell/SessionProvider";
import { useCreateSectionType, useSectionTypes } from "@/lib/api/hooks/useSectionTypes";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5c — POST /section-types = santiye.bolumler VEYA bolum.detay Düzenler.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSectionTypes", () => ({ useSectionTypes: vi.fn(), useCreateSectionType: vi.fn() }));

const ADD_OPTION = "+ Yeni tip ekle";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  render(<SectionTypePicker value="" onChange={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSectionTypes).mockReturnValue({ data: [{ id: "t-1", name: "Temel" }], isLoading: false, isError: false, refetch: vi.fn() } as never);
  vi.mocked(useCreateSectionType).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

describe("SectionTypePicker · '+ Yeni tip ekle' sayfa kapısı (IZN-F5c)", () => {
  it("santiye.bolumler Düzenler → seçenek var", () => {
    session(meFixture({ pages: { "santiye.bolumler": pageGrant("edit") } }));
    expect(screen.getByRole("option", { name: ADD_OPTION })).toBeInTheDocument();
  });

  it("bolum.detay Düzenler (ikiz, VEYA) → seçenek var", () => {
    session(meFixture({ pages: { "bolum.detay": pageGrant("edit") } }));
    expect(screen.getByRole("option", { name: ADD_OPTION })).toBeInTheDocument();
  });

  it("ikisi de Görür, kardeş proje.santiyeler Düzenler → seçenek YOK (liste seçimi kalır)", () => {
    session(
      meFixture({
        pages: {
          "santiye.bolumler": pageGrant("view"),
          "bolum.detay": pageGrant("view"),
          "proje.santiyeler": pageGrant("edit"),
        },
      }),
    );
    expect(screen.queryByRole("option", { name: ADD_OPTION })).toBeNull();
    expect(screen.getByRole("option", { name: "Temel" })).toBeInTheDocument();
  });
});
