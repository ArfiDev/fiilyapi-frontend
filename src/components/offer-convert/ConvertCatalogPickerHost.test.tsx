import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { D_DUV, D_KAB, LAST_EMPTY, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { ConvertCatalogPickerHost, type ConvertCatalogPickerHostProps } from "./ConvertCatalogPickerHost";
import { DISCIPLINE_BY_CATALOG, makeWonRevision } from "./convert-fixtures";
import { rowsFromRevision } from "./convert-model";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function renderHost(onAdd: ConvertCatalogPickerHostProps["onAdd"]) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items: [SIVA, LAST_EMPTY] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
  const props = { draft: rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG), contextLabel: "TKL-1 Rev.1", onAdd, onClose: vi.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConvertCatalogPickerHost {...props} />
    </QueryClientProvider>,
  );
  return props;
}

async function addLastEmpty(): Promise<void> {
  const row = (await screen.findByText(LAST_EMPTY.poz_no)).closest("tr") as HTMLElement;
  await userEvent.type(within(row).getByLabelText(`${LAST_EMPTY.poz_no} miktar`), "2");
  await userEvent.click(screen.getByRole("button", { name: /Kalemi Ekle|^Kalem Ekle$/ }));
}

beforeEach(() => vi.clearAllMocks());

describe("ConvertCatalogPickerHost · onay sonucu", () => {
  it("onAdd true → seçici KAPANIR", async () => {
    const props = renderHost(vi.fn(() => true));
    await addLastEmpty();
    expect(props.onAdd).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("🔴 onAdd false (hedef grup yok) → seçici KAPANMAZ, 'Seçili grup artık yok' bantta, seçim korunur", async () => {
    const props = renderHost(vi.fn(() => false));
    await addLastEmpty();
    expect(props.onAdd).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Katalogdan Kalem Ekle" })).toBeInTheDocument();
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Seçili grup artık yok");
    expect(screen.getByTestId("wip-count")).toHaveTextContent("1 kalem seçili");
  });
});
