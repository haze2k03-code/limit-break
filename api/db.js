import { getDb, auth, send } from "./_lib.js";

// Generic document store. Each Mongo document is
//   { _id: "fighters/<uid>/lifts/<id>", col: "fighters/<uid>/lifts", id, data, owner, updatedAt }
//
// GET    /api/db?col=<collection path>   -> { docs: [{ id, data }] }
// GET    /api/db?path=<document path>    -> { exists, data }
// PUT    /api/db?path=...  { data }       -> replace document
// PATCH  /api/db?path=...  { data }       -> merge into existing document
// DELETE /api/db?path=...                 -> delete document

const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MAX_BYTES = 256 * 1024;

function validPath(p, isDoc) {
  if (typeof p !== "string" || p.length > 1000) return false;
  const s = p.split("/");
  return s.length <= 16 && s.every((x) => SEG.test(x) && x !== "." && x !== "..") && (s.length % 2 === 0) === isDoc;
}

// Who may write where:
//   fighters/<uid>/...  only that user
//   comments/<id>       anyone signed in may post as themselves; the author or the person
//                       it was written to may delete it; nobody edits comments
function allowed(uid, path, method, existing, data) {
  const s = path.split("/");
  if (s[0] === "fighters") return s[1] === uid;
  if (s[0] === "comments" && s.length === 2) {
    if (method === "PUT") return !existing && data && data.from === uid && typeof data.to === "string" && typeof data.text === "string" && data.text.length <= 500;
    if (method === "DELETE") return !!existing && (existing.from === uid || existing.to === uid);
    return false;
  }
  return false;
}

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v;
  }
  return out;
}

export default async function handler(req, res) {
  const uid = auth(req);
  if (!uid) return send(res, 401, { error: "Sign in first." });

  try {
    const docs = (await getDb()).collection("docs");
    const { col, path } = req.query;

    if (req.method === "GET") {
      if (col) {
        if (!validPath(col, false)) return send(res, 400, { code: "invalid_argument", error: "Bad collection path" });
        const list = await docs.find({ col }).limit(5000).toArray();
        return send(res, 200, { docs: list.map((d) => ({ id: d.id, data: d.data })) });
      }
      if (!validPath(path, true)) return send(res, 400, { code: "invalid_argument", error: "Bad document path" });
      const d = await docs.findOne({ _id: path });
      return send(res, 200, { exists: !!d, data: d ? d.data : null });
    }

    if (!validPath(path, true)) return send(res, 400, { code: "invalid_argument", error: "Bad document path" });
    const existing = await docs.findOne({ _id: path });
    const data = req.body && req.body.data;

    if (!allowed(uid, path, req.method, existing && existing.data, data))
      return send(res, 403, { code: "invalid_argument", error: "You can only change your own data." });

    if (req.method === "DELETE") {
      await docs.deleteOne({ _id: path });
      return send(res, 200, { ok: true });
    }

    if (!data || typeof data !== "object" || Array.isArray(data))
      return send(res, 400, { code: "invalid_argument", error: "Body must be { data: {...} }" });

    let next;
    if (req.method === "PUT") next = data;
    else if (req.method === "PATCH") {
      if (!existing) return send(res, 400, { code: "invalid_argument", error: "Document does not exist" });
      next = merge(existing.data, data);
    } else return send(res, 405, { error: "Method not allowed" });

    if (Buffer.byteLength(JSON.stringify(next)) > MAX_BYTES)
      return send(res, 400, { code: "invalid_argument", error: "Document too large" });

    const s = path.split("/");
    await docs.replaceOne(
      { _id: path },
      { _id: path, col: s.slice(0, -1).join("/"), id: s[s.length - 1], data: next, owner: uid, updatedAt: new Date() },
      { upsert: true }
    );
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { code: "unavailable", error: "Server error. Try again." });
  }
}
