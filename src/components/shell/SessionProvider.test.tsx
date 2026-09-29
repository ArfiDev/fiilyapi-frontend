import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SessionProvider, useSession } from "./SessionProvider";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function Probe() {
  const { me, isLoading } = useSession();
  if (isLoading) return <span>yukleniyor</span>;
  return <span>{me?.full_name ?? "yok"}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
});

describe("SessionProvider", () => {
  it("me verisini context'e saglar", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ full_name: "Ahmet Yılmaz", role_key: "patron", title: "Patron" }), { status: 200 }),
    );
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByText("Ahmet Yılmaz")).toBeInTheDocument();
  });

  it("401'de /login'e yonlendirir", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("me'yi yalnizca bir kez fetch eder", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ full_name: "Ali", role_key: "x", title: "y" }), { status: 200 }),
    );
    render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("Ali");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("403'te de /login'e yonlendirir", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  // 🔴 KAYIT NO 463 — bekci: 429/502/503 GECICI hatalardir, /login'e ATILMAZ.
  // Eskiden `!res.ok` HER durumu 401 gibi ele alirdi; bu test o satiri geri
  // getirirse KIRMIZI doner (bkz. rapor MUTASYON KANITI).
  it.each([429, 502, 503])(
    "%d'de /login'e YONLENDIRMEZ, yukleniyor durumundan cikar",
    async (status) => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status }));
      render(<SessionProvider><Probe /></SessionProvider>);
      await waitFor(() => expect(screen.queryByText("yukleniyor")).not.toBeInTheDocument());
      expect(pushMock).not.toHaveBeenCalled();
    },
  );

  it("ag hatasinda (fetch reddi) /login'e YONLENDIRMEZ", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.queryByText("yukleniyor")).not.toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
  });

  // M5_1 kayıt #411 — 401/403 dalı `router.push`e güveniyordu ama
  // `isLoading`i hiç kapatmıyordu; test ortamında `useRouter().push` sayfayı
  // GERÇEKTEN değiştirmediği için `isLoading` sonsuza dek `true` kalırdı.
  it.each([401, 403])(
    "%d'de de 'yukleniyor' durumundan cikar (isLoading kapanir)",
    async (status) => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status }));
      render(<SessionProvider><Probe /></SessionProvider>);
      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
      expect(screen.queryByText("yukleniyor")).not.toBeInTheDocument();
    },
  );
});

describe("SessionProvider · refresh", () => {
  function RefreshProbe() {
    const { me, refresh } = useSession();
    return (
      <>
        <span>{`disc:${(me as { disciplines?: string[] } | null)?.disciplines?.length ?? "-"}`}</span>
        <button type="button" onClick={() => void refresh?.()}>tazele</button>
      </>
    );
  }

  it("refresh me'yi yeniden çeker ve context'i günceller (yükleniyor'a DÖNMEDEN)", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: ["d1", "d2"] }), { status: 200 }));
    render(<SessionProvider><RefreshProbe /></SessionProvider>);
    expect(await screen.findByText("disc:0")).toBeInTheDocument();
    screen.getByRole("button", { name: "tazele" }).click();
    expect(await screen.findByText("disc:2")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("refresh geçici hatada (503) eski me'yi KORUR ve /login'e atmaz", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: ["d1"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    render(<SessionProvider><RefreshProbe /></SessionProvider>);
    expect(await screen.findByText("disc:1")).toBeInTheDocument();
    screen.getByRole("button", { name: "tazele" }).click();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("disc:1")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("SIRA BEKÇİSİ: geç dönen ESKİ refresh yanıtı daha yeni yanıtı ezmez (son istek kazanır)", async () => {
    let releaseOld: (res: Response) => void = () => {};
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: [] }), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseOld = resolve)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: ["y1", "y2", "y3"] }), { status: 200 }));
    render(<SessionProvider><RefreshProbe /></SessionProvider>);
    expect(await screen.findByText("disc:0")).toBeInTheDocument();

    screen.getByRole("button", { name: "tazele" }).click(); // eski (yavaş)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    screen.getByRole("button", { name: "tazele" }).click(); // yeni (hızlı)
    expect(await screen.findByText("disc:3")).toBeInTheDocument();

    releaseOld(new Response(JSON.stringify({ full_name: "A", disciplines: ["eski"] }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("disc:3")).toBeInTheDocument();
  });

  it("başarılı refresh önceki geçici hata bayrağını (error) temizler", async () => {
    function ErrorProbe() {
      const { error, me, refresh } = useSession();
      return (
        <>
          <span>{`error:${String(error)}`}</span>
          <span>{`me:${me ? "var" : "yok"}`}</span>
          <button type="button" onClick={() => void refresh?.()}>tazele</button>
        </>
      );
    }
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "A", disciplines: [] }), { status: 200 }));
    render(<SessionProvider><ErrorProbe /></SessionProvider>);
    expect(await screen.findByText("error:true")).toBeInTheDocument();
    screen.getByRole("button", { name: "tazele" }).click();
    expect(await screen.findByText("error:false")).toBeInTheDocument();
    expect(screen.getByText("me:var")).toBeInTheDocument();
  });
});
