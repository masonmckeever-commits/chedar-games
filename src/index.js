const __name = (target, value) => target;

import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

const app = new Hono();
const ADMIN_SESSION_COOKIE = "__Host-admin_session";
const ADMIN_SESSION_TTL = 8 * 60 * 60;
const LOGIN_ATTEMPT_WINDOW = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 5;
const encoder = new TextEncoder();
let adminAuthTablesReady;

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function loginAddressHash(address, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(address));
  return toHex(new Uint8Array(digest));
}

async function ensureAdminAuthTables(db) {
  if (!adminAuthTablesReady) {
    adminAuthTablesReady = db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS admin_sessions (
          token_hash TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS admin_login_attempts (
          address_hash TEXT PRIMARY KEY,
          window_started_at INTEGER NOT NULL,
          failure_count INTEGER NOT NULL
        )`
      )
    ]).catch((error) => {
      adminAuthTablesReady = undefined;
      throw error;
    });
  }
  await adminAuthTablesReady;
}

function clearAdminSessionCookie(c) {
  setCookie(c, ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 0
  });
}

app.use("/api/admin/*", async (c, next) => {
  c.header("Cache-Control", "no-store");

  const origin = c.req.header("Origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin) && new URL(origin).origin === new URL(c.req.url).origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (c.req.path === "/api/admin/login" || c.req.path === "/api/admin/logout") {
    return next();
  }

  await ensureAdminAuthTables(c.env.GAMES);
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const tokenHash = await sha256(token);
  const session = await c.env.GAMES.prepare(
    "SELECT expires_at FROM admin_sessions WHERE token_hash = ?"
  ).bind(tokenHash).first();

  if (!session || session.expires_at <= Date.now()) {
    if (session) {
      await c.env.GAMES.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    }
    clearAdminSessionCookie(c);
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

async function ensureSiteSettings(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS site_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    )`
  ).run();
}

app.post("/api/admin/games/update/:gameId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  
  const gameId = c.req.param("gameId");
  const gameName = body.name || null;
  const gameDesc = body.desc || null;
  const gamelink = body.link || null;
  const gameImg = body.img || null;
  const gameKeywords = body.keywords || null;

  if (!gameName || !gameDesc || !gamelink || !gameImg) {
    return c.json(
      { error: `Missing required fields: ${!gameName ? "name" : !gameDesc ? "desc" : !gamelink ? "link" : "img"}` }, 
      { status: 400 }
    );
  }

  await c.env.GAMES.prepare(
    `UPDATE games
     SET name = ?, description = ?, url = ?, img = ?, keywords = ?
     WHERE id = ?`
  ).bind(gameName, gameDesc, gamelink, gameImg, gameKeywords, gameId).run();

  return c.json({ message: "Game updated successfully" }, 200);
});

app.patch("/api/admin/games/update/:gameId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const gameId = c.req.param("gameId");
  const gameName = body.name || null;
  const gameDesc = body.desc || null;
  const gamelink = body.link || null;
  const gameImg = body.img || null;
  const gameKeywords = body.keywords || null;
  await c.env.GAMES.prepare(
    `UPDATE games
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          url = COALESCE(?, url),
          img = COALESCE(?, img),
          keywords = COALESCE(?, keywords)
      WHERE id = ?`
  ).bind(gameName, gameDesc, gamelink, gameImg, gameKeywords, gameId).run();
  return c.json({ message: "Game updated successfully" }, 200);
});

app.post("/api/admin/games/json", async (c) => {
  await ensureSiteSettings(c.env.GAMES);
  const data = await c.env.GAMES.prepare("SELECT * FROM games").all();
  const banner = await c.env.GAMES.prepare(
    "SELECT setting_value FROM site_settings WHERE setting_key = ?"
  ).bind("banner_game_id").first();
  const json = JSON.stringify((data.results || []).map(game => ({
    ...game,
    banner: game.id === banner?.setting_value
  })));
  return c.json({ success: true, data: json }, 200);
});

app.post("/api/admin/banner", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const gameId = String(body.gameId || "").trim();
  if (!gameId) {
    return c.json({ error: "Missing game id" }, 400);
  }

  const game = await c.env.GAMES.prepare("SELECT 1 FROM games WHERE id = ?").bind(gameId).first();
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }

  await ensureSiteSettings(c.env.GAMES);
  await c.env.GAMES.prepare(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
  ).bind("banner_game_id", gameId).run();

  return c.json({ message: "Banner game updated successfully" }, 200);
});

app.post("/api/admin/games", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const gameId = String(body.id || "").trim();
  const gameName = body.name || null;
  const gameDesc = body.desc || null;
  const gamelink = body.link || null;
  const gameImg = body.img || null;
  const gameKeywords = body.keywords || null;
  if (!gameId || !gameName || !gameDesc || !gamelink || !gameImg) {
    return c.json({ error: `Missing required fields: ${!gameId ? "id" : !gameName ? "name" : !gameDesc ? "desc" : !gamelink ? "link" : "img"}` }, 400);
  }
  const existing = await c.env.GAMES.prepare("SELECT 1 FROM games WHERE id = ?").bind(gameId).first();
  if (existing) {
    return c.json({ error: "A game with that id already exists" }, 409);
  }
  await c.env.GAMES.prepare(
    `INSERT INTO games (id, name, description, url, img, keywords)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(gameId, gameName, gameDesc, gamelink, gameImg, gameKeywords).run();
  return c.json({ message: "Game created successfully" }, 201);
});

app.delete("/api/admin/games/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  await ensureSiteSettings(c.env.GAMES);
  const result = await c.env.GAMES.prepare("DELETE FROM games WHERE id = ?").bind(gameId).run();
  if (!result.meta.changes) {
    return c.json({ error: "Game not found" }, 404);
  }
  await c.env.GAMES.prepare(
    "DELETE FROM site_settings WHERE setting_key = ? AND setting_value = ?"
  ).bind("banner_game_id", gameId).run();
  await c.env.GAMES.prepare("DELETE FROM clicks WHERE gameId = ?").bind(gameId).run().catch(() => {});
  return c.json({ message: "Game deleted successfully" }, 200);
});

app.post("/api/admin/login", async (c) => {
  await ensureAdminAuthTables(c.env.GAMES);
  const adminPassword = c.env.ADMIN_PASSWORD;
  if (!adminPassword) return c.json({ error: "Admin authentication is not configured" }, 503);

  const now = Date.now();
  const address = c.req.header("CF-Connecting-IP") || "unknown";
  const addressHash = await loginAddressHash(address, adminPassword);
  await c.env.GAMES.prepare(
    "DELETE FROM admin_login_attempts WHERE window_started_at <= ?"
  ).bind(now - LOGIN_ATTEMPT_WINDOW).run();
  const attempt = await c.env.GAMES.prepare(
    "SELECT window_started_at, failure_count FROM admin_login_attempts WHERE address_hash = ?"
  ).bind(addressHash).first();

  if (
    attempt &&
    now - attempt.window_started_at < LOGIN_ATTEMPT_WINDOW &&
    attempt.failure_count >= LOGIN_ATTEMPT_LIMIT
  ) {
    c.header("Retry-After", String(Math.ceil((LOGIN_ATTEMPT_WINDOW - (now - attempt.window_started_at)) / 1000)));
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  const passwordBytes = encoder.encode(await c.req.text());
  const expectedBytes = encoder.encode(adminPassword);
  const passwordMatches = passwordBytes.byteLength === expectedBytes.byteLength &&
    await crypto.subtle.timingSafeEqual(passwordBytes, expectedBytes);

  if (!passwordMatches) {
    await c.env.GAMES.prepare(
      `INSERT INTO admin_login_attempts (address_hash, window_started_at, failure_count)
       VALUES (?, ?, 1)
       ON CONFLICT(address_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN excluded.window_started_at - admin_login_attempts.window_started_at >= ?
           THEN excluded.window_started_at
           ELSE admin_login_attempts.window_started_at
         END,
         failure_count = CASE
           WHEN excluded.window_started_at - admin_login_attempts.window_started_at >= ?
           THEN 1
           ELSE admin_login_attempts.failure_count + 1
         END`
    ).bind(addressHash, now, LOGIN_ATTEMPT_WINDOW, LOGIN_ATTEMPT_WINDOW).run();
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + ADMIN_SESSION_TTL * 1000;
  await c.env.GAMES.batch([
    c.env.GAMES.prepare("DELETE FROM admin_login_attempts WHERE address_hash = ?").bind(addressHash),
    c.env.GAMES.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    c.env.GAMES.prepare(
      "INSERT INTO admin_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)"
    ).bind(await sha256(token), expiresAt, now)
  ]);
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL
  });
  return c.json({ ok: true });
});

app.post("/api/admin/logout", async (c) => {
  await ensureAdminAuthTables(c.env.GAMES);
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (token) {
    await c.env.GAMES.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  }
  clearAdminSessionCookie(c);
  return c.json({ ok: true });
});

app.post("/api/block-blast/live/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomValues = crypto.getRandomValues(new Uint8Array(4));
  const code = [...randomValues].map((value) => alphabet[value % alphabet.length]).join("");
  const room = c.env.LIVE_MATCHES.getByName(code);
  const response = await room.fetch(new Request(`https://block-blast-live/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, initials: body.initials })
  }));
  if (!response.ok) return response;
  return c.json({ ...await response.json(), playerId: null });
});

app.get("/api/block-blast/live/rooms/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return c.text("Invalid room code", 400);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.text("WebSocket upgrade required", 426);
  const room = c.env.LIVE_MATCHES.getByName(code);
  return room.fetch(c.req.raw);
});

app.on(["GET", "HEAD"], "/roms/:game", async (c) => {
  const gameId = c.req.param("game");
  const fullRom = await c.env.ROMS.get(gameId);
  if (!fullRom) {
    return c.text("Rom not found", 404);
  }
  const headers = new Headers();
  fullRom.writeHttpMetadata(headers);
  headers.set("ETag", fullRom.httpEtag);
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Length", String(fullRom.size));
  headers.set("Accept-Ranges", "none");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Disposition", `inline; filename="${gameId}"`);
  if (c.req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers
    });
  }
  return c.body(fullRom.body, 200, headers);
});

app.get('/games/json', async (c) => {
  try {
    await ensureSiteSettings(c.env.GAMES);
    const sort = c.req.query('sort');

    const tableInfo = await c.env.GAMES.prepare("PRAGMA table_info(games);").all();
    let hasCreatedAt = tableInfo.results.some(col => col.name === 'created_at');

    if (!hasCreatedAt) {
      try {
        await c.env.GAMES.prepare(
          "ALTER TABLE games ADD COLUMN created_at TEXT DEFAULT '1970-01-01 00:00:00';"
        ).run();
        
        await c.env.GAMES.prepare(
          "UPDATE games SET created_at = datetime('now') WHERE created_at = '1970-01-01 00:00:00';"
        ).run();
        
        hasCreatedAt = true;
      } catch (migrationError) {
        console.error("Failed to auto-create column:", migrationError.message);
      }
    }

    let sql = `
      SELECT g.id, g.name, g.description, g.url, g.img, g.keywords,
             COALESCE(c.clicks, 0) AS clicks
      FROM games g
      LEFT JOIN clicks c ON c.gameId = g.id
    `;

    if (hasCreatedAt) {
      if (sort === 'clicks') {
        sql += `
          ORDER BY 
            CASE 
              WHEN g.created_at >= datetime('now', '-7 days') THEN 1 
              ELSE 2 
            END ASC,
            clicks DESC, 
            g.name ASC;
        `;
      } else {
        sql += `
          ORDER BY 
            CASE 
              WHEN g.created_at >= datetime('now', '-7 days') THEN 0 
              ELSE 1 
            END ASC,
            g.created_at DESC,
            g.rowid ASC;
        `;
      }
    } else {
      if (sort === 'clicks') {
        sql += ` ORDER BY clicks DESC, g.name ASC ;`;
      } else {
        sql += ` ORDER BY g.rowid ;`;
      }
    }

    const { results } = await c.env.GAMES.prepare(sql).all();
    const banner = await c.env.GAMES.prepare(
      "SELECT setting_value FROM site_settings WHERE setting_key = ?"
    ).bind("banner_game_id").first();
    return c.json((results || []).map(game => ({
      ...game,
      banner: game.id === banner?.setting_value
    })));
  } catch (e) {
    return c.text('Backend Error: ' + e.message, 500);
  }
});

app.post("/api/games/click", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) return c.json({ error: "Missing game id" }, 400);
    const now = Date.now();
    const result = await c.env.GAMES.prepare(
      "UPDATE clicks SET clicks = clicks + 1, lastClick = ? WHERE gameId = ?"
    ).bind(now, id).run();
    if (!result.meta.changes) {
      await c.env.GAMES.prepare(
        "INSERT INTO clicks (gameId, clicks, lastClick) VALUES (?, 1, ?)"
      ).bind(id, now).run();
    }
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: "Could not record click" }, 500);
  }
});

const POTW = {
  id: "2026-11-15@905P",
  question: "Do you like the new redesign?",
  options: [
    "Looks better",
    "Not really"
  ]
};

async function purgeOldPotw(env) {
  const stale = await env.GAMES.prepare("SELECT 1 FROM potw_voters WHERE problem != ? LIMIT 1").bind(POTW.id).first();
  if (!stale) return;
  await env.GAMES.batch([
    env.GAMES.prepare("DELETE FROM potw_voters WHERE problem != ?").bind(POTW.id),
    env.GAMES.prepare("DELETE FROM potw_votes WHERE problem != ?").bind(POTW.id)
  ]);
}
__name(purgeOldPotw, "purgeOldPotw");

app.get("/api/potw", async (c) => {
  try {
    await purgeOldPotw(c.env);
    const { results } = await c.env.GAMES.prepare("SELECT option, votes FROM potw_votes WHERE problem = ?").bind(POTW.id).all();
    const votes = {};
    for (const r of results) votes[r.option] = r.votes;
    const options = Object.entries(POTW.options).map(([key, label]) => ({ key, label, votes: votes[key] || 0 }));
    const total = options.reduce((s, o) => s + o.votes, 0);
    return c.json({ id: POTW.id, question: POTW.question, options, total });
  } catch (e) {
    return c.json({ error: "Problem of the week unavailable" }, 503);
  }
});

app.post("/api/potw/votes", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const option = String(body.option || "");
    const problem = String(body.problem || "");
    const fingerprint = String(body.fingerprint || "").trim();
    if (problem !== POTW.id) return c.json({ error: "Problem changed" }, 409);
    if (!POTW.options[option]) return c.json({ error: "Invalid option" }, 400);
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(fingerprint)) return c.json({ error: "Invalid fingerprint" }, 400);
    await purgeOldPotw(c.env);
    const existing = await c.env.GAMES.prepare("SELECT 1 FROM potw_voters WHERE problem = ? AND fingerprint = ?").bind(POTW.id, fingerprint).first();
    if (existing) return c.json({ error: "Already voted" }, 409);
    await c.env.GAMES.batch([
      c.env.GAMES.prepare("INSERT INTO potw_voters (problem, fingerprint, option, voted_at) VALUES (?, ?, ?, ?)").bind(POTW.id, fingerprint, option, Date.now()),
      c.env.GAMES.prepare("INSERT INTO potw_votes (problem, option, votes) VALUES (?, ?, 1) ON CONFLICT(problem, option) DO UPDATE SET votes = votes + 1").bind(POTW.id, option)
    ]);
    const { results } = await c.env.GAMES.prepare("SELECT option, votes FROM potw_votes WHERE problem = ?").bind(POTW.id).all();
    const votes = {};
    for (const r of results) votes[r.option] = r.votes;
    const options = Object.entries(POTW.options).map(([key, label]) => ({ key, label, votes: votes[key] || 0 }));
    const total = options.reduce((s, o) => s + o.votes, 0);
    return c.json({ ok: true, options, total });
  } catch (e) {
    return c.json({ error: "Could not record vote" }, 500);
  }
});

app.get("/proxy", async (c) => {
  const url = c.req.query("url");
  if (!url || !url.startsWith("https://cdn.chedar.dev/")) {
    return c.text("Forbidden", 403);
  }
  try {
    const upstream = await fetch(url);
    const buffer = await upstream.arrayBuffer();
    return c.body(buffer, 200, {
      "Content-Type": "application/x-shockwave-flash",
      "Access-Control-Allow-Origin": "*"
    });
  } catch (e) {
    return c.text("Proxy error: " + e, 500);
  }
});

app.get("/games/xml", async (c) => {
  try {
    const { results } = await c.env.GAMES.prepare("SELECT * FROM games").all();
    const games = results || [];
    const escapeXml = /* @__PURE__ */ __name((str) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"), "escapeXml");
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<games>\n';
    for (const game of games) {
      xml += "  <game>\n";
      xml += `    <id>${escapeXml(game.id)}</id>\n`;
      xml += `    <name><![CDATA[${game.name || ""}]]></name>\n`;
      xml += `    <description><![CDATA[${game.description || ""}]]></description>\n`;
      xml += `    <url>${escapeXml(game.url)}</url>\n`;
      xml += `    <img>${escapeXml(game.img)}</img>\n`;
      xml += `    <keywords>${escapeXml(game.keywords || "")}</keywords>\n`;
      xml += "  </game>\n";
    }
    xml += "</games>";
    return c.text(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8"
    });
  } catch (e) {
    return c.text("Backend Error: " + e.message, 500);
  }
});

app.get("/api/block-blast/leaderboard", async (c) => {
  try {
    const requestedLimit = Number(c.req.query("limit") || 10);
    const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 10, 1), 50);
    const { results } = await c.env.GAMES.prepare(
      `SELECT initials, score, difficulty, created_at
       FROM block_blast_leaderboard
       ORDER BY score DESC, created_at ASC
       LIMIT ?`
    ).bind(limit).all();
    return c.json(results || []);
  } catch (e) {
    return c.json({ error: "Leaderboard unavailable" }, 503);
  }
});

app.post("/api/block-blast/leaderboard", async (c) => {
  try {
    const body = await c.req.json();
    const initials = String(body.initials || "").trim().toUpperCase();
    const score = Number(body.score);
    const difficulty = String(body.difficulty || "normal");
    if (!/^[A-Z]{1,3}$/.test(initials) || !Number.isInteger(score) || score < 0 || score > 2147483647) {
      return c.json({ error: "Initials must be 1-3 letters and score must be a valid non-negative integer" }, 400);
    }
    if (!["easiest", "easy", "normal", "hard", "very-hard", "expert"].includes(difficulty)) {
      return c.json({ error: "Invalid difficulty" }, 400);
    }
    await c.env.GAMES.prepare(
      `INSERT INTO block_blast_leaderboard (initials, score, difficulty)
       VALUES (?, ?, ?)`
    ).bind(initials, score, difficulty).run();
    return c.json({ initials, score, difficulty }, 201);
  } catch (e) {
    return c.json({ error: "Could not save leaderboard score" }, 500);
  }
});

app.get("*", async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);

  console.log("Request For: " + c.req.path);
  console.log("Status: " + response.status);
  console.log("Content-Type: " + response.headers.get("content-type"));

  if (response.status < 400) {
    return response;
  }

  const url = new URL(c.req.url);
  url.pathname = "/404.html";

  const errorPage = await c.env.ASSETS.fetch(new Request(url.toString()));

  return new Response(errorPage.body, {
    status: 404,
    headers: {
      ...errorPage.headers,
      "epicness": "none :("
    }
  });
});

export default app;