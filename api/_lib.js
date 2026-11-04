import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";

// Reuse one connection across serverless invocations.
let cached = globalThis._lbMongo;

export function getDb() {
  if (!cached) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
    cached = globalThis._lbMongo = new MongoClient(process.env.MONGODB_URI).connect().then(async (client) => {
      const db = client.db(process.env.MONGODB_DB || "limitbreak");
      await db.collection("docs").createIndex({ col: 1 });
      await db.collection("users").createIndex({ username: 1 }, { unique: true });
      return db;
    });
  }
  return cached;
}

export function signToken(uid) {
  return jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Returns the user id from the Bearer token, or null.
export function auth(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return null;
  try { return jwt.verify(t, process.env.JWT_SECRET).uid; } catch { return null; }
}

export function send(res, status, body) {
  res.status(status).json(body);
}
