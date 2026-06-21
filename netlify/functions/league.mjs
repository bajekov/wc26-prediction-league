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

    // result writes require the password (check once, before the retry loop)
    if (body.result && body.pw !== PW) {
      return new Response("forbidden", { status: 401 });
    }

    // The whole state lives in one blob, so two overlapping POSTs (e.g. a prediction
    // save and a result save) each rewrite the entire document and the last write
    // silently clobbers the other — which is why a cleared box reappears. Re-read,
    // re-apply the delta, and only commit if nothing changed since the read; retry otherwise.
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: current, etag } =
        await store.getWithMetadata("state", { type: "json" });
      const data = current || { p: {}, r: {} };

      // prediction updates — rejected for any match whose result is already in
      if (Array.isArray(body.preds)) {
        for (const u of body.preds) {
          if (!PLAYERS.includes(u.pk)) continue;
          if (!Array.isArray(u.v) || !ok2digit(u.v[0]) || !ok2digit(u.v[1])) continue;
          if (resultDone(data.r[u.id]) && body.pw !== PW) continue;   // locked unless admin password supplied
          (data.p[u.id] ||= {})[u.pk] = [String(u.v[0]), String(u.v[1])];
        }
      }

      // result updates (password already verified above)
      if (body.result) {
        const { id, v } = body.result;
        if (Array.isArray(v) && ok2digit(v[0]) && ok2digit(v[1])) {
          data.r[id] = [String(v[0]), String(v[1])];
        }
      }

      const res = await store.set("state", JSON.stringify(data),
        etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (res.modified) return Response.json({ ok: true });
      // etag moved under us — another write landed first; loop and reapply on fresh state
    }

    return new Response("write conflict, please retry", { status: 409 });
  }

  return new Response("method not allowed", { status: 405 });
};

export const config = { path: "/api/league" };
