// @vitest-environment node
//
// DSC-F1.2 · test ikizinin (`e2e/mock-backend.ts`) kullanıcı × disiplin durumu:
// `GET/PUT /users/{id}/disciplines`, `user_count` ve `/auth/me.disciplines`
// AYNI durumdan türer (backend sözleşmesi: TAM DEĞİŞTİRME, id'ye göre sıralı,
// bilinmeyen disiplin 404, bilinmeyen kullanıcı 404).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startMockBackend } from "../../../e2e/mock-backend";

let base = "";
let close: () => Promise<void>;

beforeAll(async () => {
  const started = startMockBackend(0);
  close = started.close;
  await new Promise<void>((resolve) => started.server.once("listening", () => resolve()));
  const address = started.server.address();
  if (address === null || typeof address === "string") throw new Error("ikiz port alamadı");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await close();
});

async function call<T>(method: string, route: string, body?: unknown): Promise<{ status: number; json: T }> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: (text === "" ? {} : JSON.parse(text)) as T };
}

interface Discipline {
  id: string;
  user_count: number;
}

const listDisciplines = async () => (await call<Discipline[]>("GET", "/earned-value/disciplines")).json;
const assigned = async (userId: string) =>
  (await call<{ discipline_ids: string[] }>("GET", `/users/${userId}/disciplines`)).json.discipline_ids;

describe("test ikizi · kullanıcı × disiplin ataması", () => {
  it("atamasız kullanıcı kısıtsızdır (boş liste) ve başlangıçta user_count 0", async () => {
    expect(await assigned("u-2")).toEqual([]);
    expect((await listDisciplines()).every((d) => d.user_count === 0)).toBe(true);
  });

  it("PUT TAM DEĞİŞTİRİR, tekilleştirir, id'ye göre sıralar; user_count durumdan türer", async () => {
    const [a, b] = (await listDisciplines()).map((d) => d.id);
    const first = await call<{ discipline_ids: string[] }>("PUT", "/users/u-2/disciplines", {
      discipline_ids: [b, a, b],
    });
    expect(first.status).toBe(200);
    expect(first.json.discipline_ids).toEqual([a, b].sort());
    expect(await assigned("u-2")).toEqual([a, b].sort());

    await call("PUT", "/users/u-3/disciplines", { discipline_ids: [a] });
    const counts = new Map((await listDisciplines()).map((d) => [d.id, d.user_count]));
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);

    await call("PUT", "/users/u-2/disciplines", { discipline_ids: [b] });
    expect(await assigned("u-2")).toEqual([b]);
    expect((await listDisciplines()).find((d) => d.id === a)?.user_count).toBe(1);
  });

  it("boş liste atamayı siler (= kısıtsız)", async () => {
    await call("PUT", "/users/u-3/disciplines", { discipline_ids: [] });
    expect(await assigned("u-3")).toEqual([]);
  });

  it("bilinmeyen disiplin → 404 ve HİÇBİR şey değişmez", async () => {
    const before = await assigned("u-2");
    const response = await call<{ detail: string }>("PUT", "/users/u-2/disciplines", {
      discipline_ids: ["00000000-0000-0000-0000-00000000dead"],
    });
    expect(response.status).toBe(404);
    expect(response.json.detail).toMatch(/Disiplin bulunamadı/);
    expect(await assigned("u-2")).toEqual(before);
  });

  it("bilinmeyen kullanıcı → 404; gövde eksikse 422", async () => {
    expect((await call("GET", "/users/yok/disciplines")).status).toBe(404);
    expect((await call("PUT", "/users/yok/disciplines", { discipline_ids: [] })).status).toBe(404);
    expect((await call("PUT", "/users/u-2/disciplines", {})).status).toBe(422);
  });


  it("GET/PUT yanıtı `disciplines: DisciplineRef[]` taşır (id'ye göre sıralı, katalogdaki kod/ad/renk)", async () => {
    const all = await call<{ id: string; code: string; name: string; color: string }[]>("GET", "/earned-value/disciplines");
    const [a, b] = all.json.slice(0, 2);
    const put = await call<{ discipline_ids: string[]; disciplines: unknown[] }>("PUT", "/users/u-4/disciplines", {
      discipline_ids: [b.id, a.id],
    });
    const expected = [a, b]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map((d) => ({ id: d.id, code: d.code, name: d.name, color: d.color }));
    expect(put.json.disciplines).toEqual(expected);
    const get = await call<{ disciplines: unknown[] }>("GET", "/users/u-4/disciplines");
    expect(get.json.disciplines).toEqual(expected);
    await call("PUT", "/users/u-4/disciplines", { discipline_ids: [] });
  });

  it("/auth/me.disciplines nesne dizisidir ({id, code, name, color})", async () => {
    const [a] = (await listDisciplines()).map((d) => d.id);
    await call("PUT", "/users/u-1/disciplines", { discipline_ids: [a] });
    const me = await call<{ disciplines: { id: string; code: string; name: string; color: string }[] }>("GET", "/auth/me");
    expect(me.json.disciplines).toHaveLength(1);
    expect(me.json.disciplines[0]).toMatchObject({ id: a, code: expect.any(String), name: expect.any(String), color: expect.any(String) });
    await call("PUT", "/users/u-1/disciplines", { discipline_ids: [] });
  });
});
