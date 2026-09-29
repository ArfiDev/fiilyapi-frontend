import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DisciplineCell } from "./DisciplineCell";
import { backendClient } from "@/lib/api/client";
import type { EvDisciplineRead } from "@/lib/api/models";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));

const mk = (id: string, code: string, name: string): EvDisciplineRead =>
  ({ id, code, name, color: "#2563eb", sort_order: 0, used_by_item_count: 0, user_count: 0 }) as EvDisciplineRead;

const CATALOG: EvDisciplineRead[] = [
  mk("d-cw", "CW", "Civil Works"),
  mk("d-mek", "MEK", "Mekanik"),
  mk("d-elk", "ELK", "Elektrik"),
  mk("d-duv", "DUV", "Duvar & Sıva"),
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serve(ids: string[] | "error") {
  vi.mocked(backendClient.GET).mockImplementation((() =>
    Promise.resolve(
      ids === "error"
        ? { data: undefined, error: {}, response: new Response(null, { status: 503 }) }
        : {
            data: { discipline_ids: ids, disciplines: ids.map((id) => CATALOG.find((d) => d.id === id)) },
            error: undefined,
            response: new Response(),
          },
    )) as never);
}

function renderCell(
  ids: string[] | "error",
  extra: { canEdit?: boolean; onOpen?: () => void } = {},
) {
  serve(ids);
  const onOpen = extra.onOpen ?? vi.fn();
  render(
    <DisciplineCell
      userId="u-1"
      canEdit={extra.canEdit ?? true}
      onOpen={onOpen}
    />,
    { wrapper },
  );
  return { onOpen };
}

describe("DisciplineCell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("atama yok → 'Tümü (kısıtsız)'", async () => {
    renderCell([]);
    expect(await screen.findByText("Tümü (kısıtsız)")).toBeInTheDocument();
  });

  it("1 disiplin → tek rozet: kod + ad", async () => {
    renderCell(["d-cw"]);
    expect(await screen.findByText("CW")).toBeInTheDocument();
    expect(screen.getByText("Civil Works")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("2 disiplin → iki rozet yalnız kodla (ad yok), taşma yok", async () => {
    renderCell(["d-cw", "d-mek"]);
    expect(await screen.findByText("CW")).toBeInTheDocument();
    expect(screen.getByText("MEK")).toBeInTheDocument();
    expect(screen.queryByText("Civil Works")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("3+ disiplin → iki rozet + '+N'; üzerine gelince tam liste açılır, çekilince kapanır", async () => {
    const user = userEvent.setup();
    renderCell(["d-cw", "d-mek", "d-elk", "d-duv"]);
    expect(await screen.findByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("ELK")).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(screen.getByRole("button"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("4 disiplinle sınırlı");
    expect(tip).toHaveTextContent("ELK");
    expect(tip).toHaveTextContent("Duvar & Sıva");

    await user.unhover(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tıklayınca modal açılır (canEdit)", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderCell(["d-cw"]);
    await user.click(await screen.findByRole("button", { name: /Disiplin atamasını düzenle/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("yazma yetkisi yoksa düğme YOK (tıklanamaz) ama içerik görünür", async () => {
    renderCell(["d-cw", "d-mek"], { canEdit: false });
    expect(await screen.findByText("MEK")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });



  it("GET hatası → '—'", async () => {
    renderCell("error");
    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("adlar/renkler atama yanıtından gelir: KATALOG sorgusu YAPILMAZ (403/yükleme bağımlılığı yok)", async () => {
    renderCell(["d-cw", "d-mek"]);
    await screen.findByText("CW");
    const paths = vi.mocked(backendClient.GET).mock.calls.map((call) => call[0]);
    expect(paths).toEqual(["/users/{user_id}/disciplines"]);
  });

  it("rozet noktası disiplinin KENDİ rengini taşır (backend verisi, inline)", async () => {
    renderCell(["d-cw"]);
    await screen.findByText("CW");
    expect((document.querySelector(".dsc-dot") as HTMLElement).style.backgroundColor).toBe("rgb(37, 99, 235)");
  });
});
