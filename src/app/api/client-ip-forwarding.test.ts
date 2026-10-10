/**
 * 🔴 BFF → backend İSTEMCİ IP'Sİ SÖZLEŞMESİ.
 *
 * Backend login/refresh hız sınırını ve denetim kaydındaki IP'yi `X-Forwarded-For`
 * başlığından okur (`fiilyapi-backend/app/core/ratelimit.py::client_ip`). BFF bu başlığı
 * iletmezse backend her isteği BFF'nin IP'sinden gelmiş görür: "IP başına 10 giriş/dk"
 * tüm şirket için TEK kovaya döner ve denetim kaydındaki her IP aynı olur.
 * Backende giden HER rota (giriş, çıkış, me, catch-all, AI sohbet) burada çakılır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "./auth/login/route";
import { POST as logout } from "./auth/logout/route";
import { GET as me } from "./auth/me/route";
import { GET as backendGet, POST as backendPost } from "./backend/[...path]/route";
import { POST as aiChat } from "./ai/chat/route";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

const ORIGIN = "http://localhost:3000";
const CLIENT_IP = "203.0.113.7";
const COOKIES = { [ACCESS_COOKIE]: "acc", [REFRESH_COOKIE]: "ref" };

function jwt(exp: number): string {
  return `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
}

function req(path: string, method: string, body?: unknown, extra: Record<string, string> = {}): NextRequest {
  const r = new NextRequest(ORIGIN + path, {
    method,
    headers: {
      origin: ORIGIN,
      host: "localhost:3000",
      "content-type": "application/json",
      "x-real-ip": CLIENT_IP,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const [k, v] of Object.entries(COOKIES)) r.cookies.set(k, v);
  return r;
}

function ctx(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function forwardedIps(fetchMock: ReturnType<typeof vi.fn>): (string | undefined)[] {
  return fetchMock.mock.calls.map((call) => {
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    return headers["x-forwarded-for"];
  });
}

describe("BFF → backend istemci IP'si", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BACKEND_URL;
  });

  it("login backend'e istemci IP'sini iletir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(200, { access_token: jwt(9999999999), refresh_token: jwt(9999999999) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await login(req("/api/auth/login", "POST", { email: "a@b.co", password: "x" }));
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP]);
  });

  it("istemcinin uydurdugu x-forwarded-for yerine x-real-ip iletilir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(200, { access_token: jwt(9999999999), refresh_token: jwt(9999999999) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await login(
      req("/api/auth/login", "POST", { email: "a@b.co", password: "x" }, { "x-forwarded-for": "1.1.1.1" }),
    );
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP]);
  });

  it("logout iletir", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await logout(req("/api/auth/logout", "POST"));
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP]);
  });

  it("me — refresh dahil her cagrida iletir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: "new", refresh_token: "ref" }))
      .mockResolvedValueOnce(json(200, { id: "u" }));
    vi.stubGlobal("fetch", fetchMock);
    await me(req("/api/auth/me", "GET"));
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP, CLIENT_IP, CLIENT_IP]);
  });

  it("catch-all GET ve POST iletir", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, {})));
    vi.stubGlobal("fetch", fetchMock);
    await backendGet(req("/api/backend/users", "GET"), ctx(["users"]));
    await backendPost(req("/api/backend/users", "POST", { a: 1 }), ctx(["users"]));
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP, CLIENT_IP]);
  });

  it("AI sohbet — refresh dahil iletir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: "new", refresh_token: "ref" }))
      .mockResolvedValueOnce(json(403, { detail: "yok" }));
    vi.stubGlobal("fetch", fetchMock);
    await aiChat(req("/api/ai/chat", "POST", { mesaj: "selam" }));
    expect(forwardedIps(fetchMock)).toEqual([CLIENT_IP, CLIENT_IP, CLIENT_IP]);
  });

  it("IP basligi yoksa x-forwarded-for HIC gonderilmez (backend kendi baglantisina duser)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const r = new NextRequest(ORIGIN + "/api/backend/users", { method: "GET" });
    for (const [k, v] of Object.entries(COOKIES)) r.cookies.set(k, v);
    await backendGet(r, ctx(["users"]));
    expect(forwardedIps(fetchMock)).toEqual([undefined]);
  });
});
