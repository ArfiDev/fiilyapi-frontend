import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionForm } from "./SectionForm";
import { useSession } from "@/components/shell/SessionProvider";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSection } from "@/lib/api/hooks/useSection";
import { useCreateSection, useUpdateSection } from "@/lib/api/hooks/useSectionMutations";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { useCreateSectionType, useSectionTypes } from "@/lib/api/hooks/useSectionTypes";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5c — bölüm oluştur = santiye.bolumler Düzenler (POST /sites/{id}/sections);
// bölüm düzenle = bolum.detay Düzenler (PATCH /sections/{id}). İkisi artık VEYA DEĞİL.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteSections")>()),
  useSiteSections: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSectionMutations", () => ({ useCreateSection: vi.fn(), useUpdateSection: vi.fn() }));
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSectionTypes", () => ({ useSectionTypes: vi.fn(), useCreateSectionType: vi.fn() }));
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: () => ({ data: { groups: [], totals: {} }, isLoading: false, isError: false }),
}));
vi.mock("@/lib/api/hooks/useBoqAllocations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoqAllocations")>()),
  useReplaceBoqItemAllocations: () => ({ mutateAsync: vi.fn() }),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "22222222-2222-2222-2222-222222222222";
const SECTION_ID = "33333333-3333-3333-3333-333333333333";
const DENIED = "Bu alana yetkiniz yok";
const FORM_TITLE = { name: "Yeni Bölüm (Faz) Ekle", level: 1 } as const;

const SECTION_DETAIL = {
  id: SECTION_ID,
  site_id: SITE_ID,
  code: "BLM-06",
  name: "Kaba İnşaat",
  status: "active",
  manager_user_id: null,
  manager_name: null,
  deputy_manager_user_id: null,
  deputy_manager_name: null,
  start_date: "2026-10-01",
  end_date: "2027-03-31",
  sort_order: 6,
  section_type: { id: "t1", name: "Kaba İnşaat" },
  description: null,
  planned_worker_count: null,
  is_draft: false,
  depends_on_section_id: null,
  milestones: [],
} as never;

function result<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSite).mockReturnValue(
    result({ id: SITE_ID, name: "A-Blok", section_count: 1, project: { id: PROJECT_ID, name: "P", city: null, employer_name: null } }),
  );
  vi.mocked(useSiteSections).mockReturnValue(result({ counts: { planned: 0, active: 0, completed: 0 }, items: [] }));
  vi.mocked(useProject).mockReturnValue(result({ id: PROJECT_ID, name: "P", code: "P-1" }));
  vi.mocked(useSection).mockReturnValue(result(undefined));
  vi.mocked(useCreateSection).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useUpdateSection).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useUserOptions).mockReturnValue({ options: [], isForbidden: false, isLoading: false, isError: false } as never);
  vi.mocked(useSectionTypes).mockReturnValue(result([]));
  vi.mocked(useCreateSectionType).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

function renderCreate() {
  return render(<SectionForm mode="create" projectKey={PROJECT_ID} siteKey={SITE_ID} />);
}

function renderEdit() {
  vi.mocked(useSection).mockReturnValue(result(SECTION_DETAIL));
  return render(<SectionForm mode="edit" projectKey={PROJECT_ID} siteKey={SITE_ID} sectionKey={SECTION_ID} />);
}

describe("SectionForm · create kipi kapısı = santiye.bolumler Düzenler (IZN-F5c)", () => {
  it("santiye.bolumler Düzenler → form var", () => {
    session(meFixture({ pages: { "santiye.bolumler": pageGrant("edit") } }));
    renderCreate();
    expect(screen.getByRole("heading", FORM_TITLE)).toBeInTheDocument();
  });

  it("santiye.bolumler Görür + bolum.detay Düzenler (eski kardeş) → AccessDenied", () => {
    session(meFixture({ pages: { "santiye.bolumler": pageGrant("view"), "bolum.detay": pageGrant("edit") } }));
    renderCreate();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByRole("heading", FORM_TITLE)).toBeNull();
  });
});

describe("SectionForm · edit kipi kapısı = bolum.detay Düzenler (IZN-F5c)", () => {
  it("bolum.detay Düzenler → form var", () => {
    session(meFixture({ pages: { "bolum.detay": pageGrant("edit") } }));
    renderEdit();
    expect(screen.queryByText(DENIED)).toBeNull();
    expect(screen.getByLabelText("Bölüm Adı")).toBeInTheDocument();
  });

  it("bolum.detay Görür + santiye.bolumler Düzenler (eski kardeş) → AccessDenied", () => {
    session(meFixture({ pages: { "bolum.detay": pageGrant("view"), "santiye.bolumler": pageGrant("edit") } }));
    renderEdit();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByLabelText("Bölüm Adı")).toBeNull();
  });
});
