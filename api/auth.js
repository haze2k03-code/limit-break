import bcrypt from "bcryptjs";
import { getDb, signToken, send } from "./_lib.js";

// POST /api/auth  { mode: "login" | "register", username, password }
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const { mode, username = "", password = "" } = req.body || {};
  const name = String(username).trim().toLowerCase();

  if (!/^[a-z0-9_]{3,24}$/.test(name))
    return send(res, 400, { error: "Username must be 3–24 letters, numbers or underscores." });
  if (String(password).length < 6)
    return send(res, 400, { error: "Password must be at least 6 characters." });

  try {
    const users = (await getDb()).collection("users");

    if (mode === "register") {
      if (await users.findOne({ username: name }))
        return send(res, 409, { error: "That username is taken." });
      const hash = await bcrypt.hash(password, 10);
      const { insertedId } = await users.insertOne({ username: name, hash, createdAt: new Date() });
      const uid = insertedId.toString();
      return send(res, 200, { token: signToken(uid), uid });
    }

    const u = await users.findOne({ username: name });
    if (!u || !(await bcrypt.compare(password, u.hash)))
      return send(res, 401, { error: "Wrong username or password." });
    const uid = u._id.toString();
    return send(res, 200, { token: signToken(uid), uid });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Server error. Try again." });
  }
}
