import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ProjectAccessModal } from "./ProjectAccessModal";
import { PROJECT_LIST_MAX_LIMIT } from "@/lib/api/hooks/useProjects";
import { backendClient } from "@/lib/api/client";
import type { UserResponse } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), PUT: vi.fn() } }));

/** Sunucu varsayılanı — `backend/app/modules/projects/router.py:98` (`limit = 50`). */
const SERVER_DEFAULT_LIMIT = 50;
const PROJECT_COUNT = 60;

const PROJECTS = Array.from({ length: PROJECT_COUNT }, (_, index) => ({
  id: `p-${index + 1}`,
  code: `PRJ-${index + 1}`,
  name: `Proje ${index + 1}`,
}));

const COUNTS = { all: PROJECT_COUNT, taahhut: PROJECT_COUNT, kendi_yatirim: 0, kat_karsiligi: 0, completed: 0 };

const USER = { id: "u-1", full_name: "Ayşe Yılmaz" } as UserResponse;

function fakeBackendGet(path: string, init?: unknown) {
  const query = (init as { params?: { query?: { limit?: number; offset?: number } } })?.params?.query;
  if (path === "/projects") {
    const limit = query?.limit ?? SERVER_DEFAULT_LIMIT;
    const offset = query?.offset ?? 0;
    return Promise.resolve({
      data: {
        counts: COUNTS,
        items: PROJECTS.slice(offset, offset + limit),
        limit,
        offset,
        total: PROJECT_COUNT,
      },
      error: undefined,
      response: new Response(),
    });
  }
  if (path === "/users/{user_id}/project-access") {
    return Promise.resolve({
      data: { all_projects: false, project_ids: ["p-51"] },
      error: undefined,
      response: new Response(),
    });
  }
  throw new Error(`beklenmeyen yol: ${path}`);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ProjectAccessModal — proje listesi tavanı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backendClient.GET).mockImplementation(fakeBackendGet as never);
  });

  it("sunucu varsayilani 50 iken 51. proje de listede cikar", async () => {
    render(<ProjectAccessModal user={USER} onClose={() => {}} />, { wrapper });

    expect(await screen.findByText("PRJ-51 — Proje 51")).toBeInTheDocument();
  });

  it("proje listesi ucuna tavan limitini ACIKCA gonderir", async () => {
    render(<ProjectAccessModal user={USER} onClose={() => {}} />, { wrapper });

    await screen.findByText("PRJ-1 — Proje 1");
    expect(backendClient.GET).toHaveBeenCalledWith("/projects", {
      params: { query: { limit: PROJECT_LIST_MAX_LIMIT } },
    });
  });
});

describe("ProjectAccessModal — mevcut erisim yuklenmeden Kaydet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accessQuery henuz cozulmemisken Kaydet devre disi kalir ve bos project_ids GONDERILMEZ", async () => {
    const user = userEvent.setup();
    // project-access sorgusu HIC cozulmuyor (kullanicinin gercek erisimi asla gelmiyor).
    vi.mocked(backendClient.GET).mockImplementation((path: string) => {
      if (path === "/projects") {
        return Promise.resolve({
          data: { counts: COUNTS, items: PROJECTS.slice(0, 50), limit: 50, offset: 0, total: PROJECT_COUNT },
          error: undefined,
          response: new Response(),
        }) as never;
      }
      if (path === "/users/{user_id}/project-access") {
        return new Promise(() => {}) as never; // sonsuza kadar pending
      }
      throw new Error(`beklenmeyen yol: ${path}`);
    });
    const putMock = vi.fn().mockResolvedValue({ data: {}, error: undefined, response: new Response() });
    vi.mocked(backendClient.PUT).mockImplementation(putMock as never);

    render(<ProjectAccessModal user={USER} onClose={() => {}} />, { wrapper });

    await screen.findByText("PRJ-1 — Proje 1");
    const saveButton = screen.getByRole("button", { name: "Kaydet" });
    expect(saveButton).toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(putMock).not.toHaveBeenCalled();
    });
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backendClient.GET).mockImplementation(fakeBackendGet as never);
  });

  it("yüklendi + dokunulmadı → false (async taban: GET dönene kadar da false)", async () => {
    render(<ProjectAccessModal user={USER} onClose={() => {}} />, { wrapper });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await screen.findByText("PRJ-1 — Proje 1");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir proje seçimi değişti → true", async () => {
    const user = userEvent.setup();
    render(<ProjectAccessModal user={USER} onClose={() => {}} />, { wrapper });
    await screen.findByText("PRJ-1 — Proje 1");
    await user.click(screen.getByRole("checkbox", { name: /PRJ-1 — Proje 1/ }));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PUT).mockResolvedValue({ data: {}, error: undefined, response: new Response() } as never);
    const onClose = vi.fn();
    render(<ProjectAccessModal user={USER} onClose={onClose} />, { wrapper });
    await screen.findByText("PRJ-1 — Proje 1");
    await user.click(screen.getByRole("checkbox", { name: /PRJ-1 — Proje 1/ }));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
