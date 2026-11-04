// Limit Break client data layer.
// Gives the page a small Firestore-style API (doc / collection / onSnapshot)
// backed by the /api routes, plus a login / sign-up screen.
(function () {
  const API = "/api";
  let token = null, uid = null;
  try { token = localStorage.getItem("lb_token"); uid = localStorage.getItem("lb_uid"); } catch (e) {}

  function logout() {
    try { localStorage.removeItem("lb_token"); localStorage.removeItem("lb_uid"); } catch (e) {}
    location.reload();
  }
  window.lbLogout = logout;

  async function req(method, url, body) {
    const r = await fetch(API + url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { logout(); throw { code: "revoked", message: "Signed out" }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: j.code || "unavailable", message: j.error || "Request failed" };
    return j;
  }

  // ---------- snapshots ----------
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (id, data) => ({ id, exists: data !== undefined && data !== null, data: () => data ?? undefined, metadata: meta });
  const parentOf = (path) => path.split("/").slice(0, -1).join("/");
  const lastOf = (path) => path.split("/").pop();
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

  // ---------- live listeners (refetch on write + polling) ----------
  const listeners = new Set();
  async function run(l) {
    try { l.next(await l.fetch()); } catch (e) { if (e.code === "revoked") l.error && l.error(e); }
  }
  function touch(path) {
    const col = parentOf(path);
    listeners.forEach((l) => { if (l.key === col || l.key === path) run(l); });
  }
  setInterval(() => { if (document.visibilityState === "visible") listeners.forEach(run); }, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") listeners.forEach(run); });
  function listen(key, fetcher, next, error) {
    const l = { key, fetch: fetcher, next, error };
    listeners.add(l); run(l);
    return () => listeners.delete(l);
  }

  // ---------- queries ----------
  function applyQuery(docs, q) {
    let out = docs.slice();
    q.where.forEach(([f, op, v]) => {
      out = out.filter((d) => {
        const x = d.data()[f];
        switch (op) {
          case "==": return x === v; case "!=": return x !== v;
          case "<": return x < v; case "<=": return x <= v; case ">": return x > v; case ">=": return x >= v;
          case "in": return v.includes(x); case "not-in": return !v.includes(x);
          case "array-contains": return Array.isArray(x) && x.includes(v);
          default: return true;
        }
      });
    });
    if (q.order) {
      const [f, dir] = q.order, s = dir === "desc" ? -1 : 1;
      out.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -s : s; });
    } else out.sort((a, b) => (a.id < b.id ? -1 : 1));
    if (q.lim) out = out.slice(0, q.lim);
    return out;
  }
  function makeQuery(path, q = { where: [], order: null, lim: 0 }) {
    const fetcher = async () => {
      const j = await req("GET", "/db?col=" + encodeURIComponent(path));
      const docs = applyQuery(j.docs.map((d) => docSnap(d.id, d.data)), q);
      return { docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => docs.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i })) };
    };
    return {
      path,
      where: (f, op, v) => makeQuery(path, { ...q, where: [...q.where, [f, op, v]] }),
      orderBy: (f, dir = "asc") => makeQuery(path, { ...q, order: [f, dir] }),
      limit: (n) => makeQuery(path, { ...q, lim: n }),
      get: fetcher,
      onSnapshot: (next, error) => listen(path, fetcher, next, error),
    };
  }
  function collection(path) {
    return Object.assign(makeQuery(path), {
      doc: (id) => doc(path + "/" + (id || newId())),
      add: async (data) => { const d = doc(path + "/" + newId()); await d.set(data); return d; },
    });
  }
  function doc(path) {
    const fetcher = async () => { const j = await req("GET", "/db?path=" + encodeURIComponent(path)); return docSnap(lastOf(path), j.exists ? j.data : undefined); };
    const write = async (method, data) => { await req(method, "/db?path=" + encodeURIComponent(path), data ? { data } : undefined); touch(path); };
    return {
      id: lastOf(path), path,
      get: fetcher,
      set: (data) => write("PUT", data),
      update: (data) => write("PATCH", data),
      delete: () => write("DELETE"),
      onSnapshot: (next, error) => listen(path, fetcher, next, error),
      collection: (sub) => collection(path + "/" + sub),
    };
  }
  const db = { doc, collection };
  const user = {
    id: async () => uid, isOwner: async () => false, canEdit: async () => false, can: async () => true,
    me: async () => ({ id: uid, name: "", email: null, isOwner: false, canEdit: false }),
  };

  // ---------- login / sign-up ----------
  function gate() {
    return new Promise((resolve) => {
      if (token && uid) return resolve();
      const box = document.createElement("section");
      box.className = "card onboard";
      box.innerHTML = `
        <span class="tag">Limit Break</span>
        <h2 id="au-title">Log in</h2>
        <p class="note">Track your gym, runs, diet and sleep. Power up by staying consistent.</p>
        <form id="au-form" class="panel" style="gap:12px">
          <div class="field"><label for="au-user">Username</label><input id="au-user" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+"></div>
          <div class="field"><label for="au-pass">Password</label><input id="au-pass" type="password" autocomplete="current-password" required minlength="6"></div>
          <p class="note" id="au-err" style="color:var(--bad)" hidden></p>
          <button class="btn" id="au-go" type="submit">Log in</button>
        </form>
        <button class="btn ghost" id="au-switch" type="button">New here? Create an account</button>`;
      const app = document.getElementById("app");
      app.insertBefore(box, app.children[1]);
      document.getElementById("status").hidden = true;
      let mode = "login";
      box.querySelector("#au-switch").onclick = () => {
        mode = mode === "login" ? "register" : "login";
        box.querySelector("#au-title").textContent = mode === "login" ? "Log in" : "Create an account";
        box.querySelector("#au-go").textContent = mode === "login" ? "Log in" : "Sign up";
        box.querySelector("#au-switch").textContent = mode === "login" ? "New here? Create an account" : "Already have an account? Log in";
        box.querySelector("#au-pass").autocomplete = mode === "login" ? "current-password" : "new-password";
      };
      box.querySelector("#au-form").onsubmit = async (e) => {
        e.preventDefault();
        const err = box.querySelector("#au-err"), btn = box.querySelector("#au-go");
        err.hidden = true; btn.disabled = true;
        try {
          const j = await req("POST", "/auth", { mode, username: box.querySelector("#au-user").value.trim(), password: box.querySelector("#au-pass").value });
          token = j.token; uid = j.uid;
          try { localStorage.setItem("lb_token", token); localStorage.setItem("lb_uid", uid); } catch (e) {}
          box.remove(); document.getElementById("status").hidden = false; resolve();
        } catch (e2) { err.textContent = e2.message; err.hidden = false; }
        finally { btn.disabled = false; }
      };
    });
  }

  let ready;
  window.claude = {
    use: async (name) => {
      ready = ready || new Promise((r) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => gate().then(r)) : gate().then(r)));
      await ready;
      return name === "db" ? db : name === "user" ? user : null;
    },
  };
})();
