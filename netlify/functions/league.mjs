import { getStore } from "@netlify/blobs";

const PW = "maldini3";                     // results-entry password (server-side only)
const PLAYERS = ["A", "D", "M"];

const ok2digit = (v) => /^\d{0,2}$/.test(String(v ?? ""));
const resultDone = (r) => r && r[0] !== "" && r[1] !== "" && r[0] != null && r[1] != null;

export default async (req) => {
  const store = getStore("holme-hale-league");

  if (req.method === "GET") {
    const data = (await store.get("state", { type: "json" })) || { p: {}, r: {} };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

    // password check only (used by the unlock button)
    if (body.auth) {
      return new Response(null, { status: body.pw === PW ? 204 : 401 });
    }

    const data = (await store.get("state", { type: "json" })) || { p: {}, r: {} };

    // prediction updates — rejected for any match whose result is already in
    if (Array.isArray(body.preds)) {
      for (const u of body.preds) {
        if (!PLAYERS.includes(u.pk)) continue;
        if (!Array.isArray(u.v) || !ok2digit(u.v[0]) || !ok2digit(u.v[1])) continue;
        if (resultDone(data.r[u.id]) && body.pw !== PW) continue;   // locked unless admin password supplied
        (data.p[u.id] ||= {})[u.pk] = [String(u.v[0]), String(u.v[1])];
      }
    }

    // result updates — password required
    if (body.result) {
      if (body.pw !== PW) return new Response("forbidden", { status: 401 });
      const { id, v } = body.result;
      if (Array.isArray(v) && ok2digit(v[0]) && ok2digit(v[1])) {
        data.r[id] = [String(v[0]), String(v[1])];
      }
    }

    await store.set("state", JSON.stringify(data));
    return Response.json({ ok: true });
  }

  return new Response("method not allowed", { status: 405 });
};

export const config = { path: "/api/league" };
