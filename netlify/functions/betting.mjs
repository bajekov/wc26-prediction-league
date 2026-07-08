import { getStore } from "@netlify/blobs";

const PW = "maldini3";                     // settlement password (server-side only)
const PLAYERS = ["A", "D", "M"];
const okSide = (s) => s === "1" || s === "X" || s === "2";
const okStake = (k) => Number.isInteger(k) && k >= 1 && k <= 1000000;

export default async (req) => {
  const store = getStore({ name: "holme-hale-betting", consistency: "strong" });

  if (req.method === "GET") {
    const data = (await store.get("state", { type: "json" })) || { b: {}, s: {} };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

    // password check only (used by the unlock button)
    if (body.auth) {
      return new Response(null, { status: body.pw === PW ? 204 : 401 });
    }

    // settlement writes require the password (check once, before the retry loop)
    if (body.settle && body.pw !== PW) {
      return new Response("forbidden", { status: 401 });
    }

    // Single-blob state: re-read, re-apply the delta, commit only if the etag
    // hasn't moved; retry on conflict (same pattern as the prediction league).
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: current, etag } =
        await store.getWithMetadata("state", { type: "json" });
      const data = current || { b: {}, s: {} };

      // bet upserts — rejected for any market already settled (unless admin)
      if (Array.isArray(body.bets)) {
        for (const u of body.bets) {
          if (!PLAYERS.includes(u.pk)) continue;
          const settled = okSide(data.s[u.id]);
          if (settled && body.pw !== PW) continue;      // market closed
          if (u.v === null) {                            // cleared bet
            if (data.b[u.id]) delete data.b[u.id][u.pk];
            continue;
          }
          if (!u.v || !okSide(u.v.s) || !okStake(u.v.k)) continue;
          (data.b[u.id] ||= {})[u.pk] = { s: u.v.s, k: u.v.k };
        }
      }

      // settlement (password already verified above); side null clears it
      if (body.settle) {
        const { id, side } = body.settle;
        if (side === null) delete data.s[id];
        else if (okSide(side)) data.s[id] = side;
      }

      const res = await store.set("state", JSON.stringify(data),
        etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (res.modified) return Response.json({ ok: true });
    }

    return new Response("write conflict, please retry", { status: 409 });
  }

  return new Response("method not allowed", { status: 405 });
};

export const config = { path: "/api/betting" };
