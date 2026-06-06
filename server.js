const express = require("express");
const mysql = require("mysql2/promise");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");

// Load .env if present
if (fs.existsSync(path.join(__dirname, ".env"))) {
  fs.readFileSync(path.join(__dirname, ".env"), "utf-8")
    .split("\n").forEach(line => {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim();
    });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "weaponskin",
  supportBigNumbers: true,
  bigNumberStrings: true,
  waitForConnections: true,
  connectionLimit: 5,
});

async function ensureTables() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_weapon_cosmetics (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        ItemId INT NOT NULL,
        PaintId SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        Wear FLOAT NOT NULL DEFAULT 0.01,
        Seed FLOAT NOT NULL DEFAULT 0,
        StatTrak INT NULL,
        NameTag VARCHAR(255) NULL,
        WeaponSticker0 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
        WeaponSticker1 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
        WeaponSticker2 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
        WeaponSticker3 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
        WeaponSticker4 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
        WeaponKeychain VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0',
        UNIQUE KEY unique_steam_item (SteamId, ItemId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_team_knives (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        Team INT NOT NULL,
        ItemId INT NOT NULL,
        UNIQUE KEY unique_steam_team (SteamId, Team)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_team_gloves (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        Team INT NOT NULL,
        ItemId INT NOT NULL,
        UNIQUE KEY unique_steam_team (SteamId, Team)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_team_agents (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        Team INT NOT NULL,
        ItemId INT NOT NULL,
        UNIQUE KEY unique_steam_team (SteamId, Team)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_team_musickits (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        Team INT NOT NULL,
        ItemId INT NOT NULL,
        UNIQUE KEY unique_steam_team (SteamId, Team)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ws_custom_models (
        Id INT AUTO_INCREMENT PRIMARY KEY,
        SteamId BIGINT UNSIGNED NOT NULL,
        ItemId INT NOT NULL,
        ModelPath VARCHAR(512) NOT NULL,
        UNIQUE KEY unique_steam_item (SteamId, ItemId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✓ Tables ready");
  } finally {
    conn.release();
  }
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(__dirname, "catalog.json");
let catalog = null;

const BYMYKEL  = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";
const NEREZIEL = "https://raw.githubusercontent.com/Nereziel/cs2-WeaponPaints/main/website/data";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function loadCatalog() {
  if (fs.existsSync(CACHE_FILE)) {
    catalog = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    console.log("✓ Catalog loaded from cache");
    return;
  }
  console.log("Fetching skin catalog (first run, may take a moment)...");

  const [rawAll, rawAgents, rawMusic, rawStickers, rawKeychains] = await Promise.all([
    fetchJson(`${BYMYKEL}/skins.json`),
    fetchJson(`${NEREZIEL}/agents_en.json`),
    fetchJson(`${NEREZIEL}/music_en.json`),
    fetchJson(`${BYMYKEL}/stickers.json`),
    fetchJson(`${BYMYKEL}/keychains.json`),
  ]);

  const skins = [], gloves = [];
  for (const item of rawAll) {
    if (!item.weapon?.weapon_id || !item.paint_index) continue;
    if (item.category?.id === "sfui_invpanel_filter_gloves") {
      gloves.push({ weapon_defindex: item.weapon.weapon_id, paint: parseInt(item.paint_index), image: item.image ?? "", paint_name: item.name ?? "" });
    } else {
      skins.push({ weapon_defindex: item.weapon.weapon_id, weapon_name: item.weapon.name ?? "", paint: parseInt(item.paint_index), image: item.image ?? "", paint_name: item.name ?? "" });
    }
  }

  const stickers = rawStickers.filter(s => s.def_index != null).map(s => ({ id: String(s.def_index), name: s.name ?? "", image: s.image ?? "" }));
  const keychains = rawKeychains.filter(k => k.def_index != null).map(k => ({ id: String(k.def_index), name: k.name ?? "", image: k.image ?? "" }));

  catalog = { skins, gloves, agents: rawAgents, music: rawMusic, stickers, keychains };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog));
  console.log(`✓ Catalog fetched: ${skins.length} skins, ${gloves.length} gloves, ${rawAgents.length} agents`);
}

// ─── API ──────────────────────────────────────────────────────────────────────

app.get("/api/catalog", (req, res) => {
  if (!catalog) return res.status(503).json({ error: "Catalog not ready" });
  res.json(catalog);
});

app.get("/api/loadout/:steamId", async (req, res) => {
  const { steamId } = req.params;
  try {
    const [skins] = await pool.execute("SELECT * FROM ws_weapon_cosmetics WHERE SteamId = ?", [steamId]);
    const [knives] = await pool.execute("SELECT * FROM ws_team_knives WHERE SteamId = ?", [steamId]);
    const [gloves] = await pool.execute("SELECT * FROM ws_team_gloves WHERE SteamId = ?", [steamId]);
    const [agents] = await pool.execute("SELECT * FROM ws_team_agents WHERE SteamId = ?", [steamId]);
    const [music] = await pool.execute("SELECT * FROM ws_team_musickits WHERE SteamId = ?", [steamId]);
    res.json({ skins, knives, gloves, agents, music });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/skin", async (req, res) => {
  const { steamId, defindex, paintId, wear, seed, nametag, stattrak } = req.body;
  try {
    // Remove any custom model for this weapon (they conflict)
    await pool.execute("DELETE FROM ws_custom_models WHERE SteamId = ? AND ItemId = ?", [steamId, defindex]);
    await pool.execute(
      `INSERT INTO ws_weapon_cosmetics (SteamId, ItemId, PaintId, Wear, Seed, StatTrak, NameTag)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE PaintId=VALUES(PaintId), Wear=VALUES(Wear), Seed=VALUES(Seed), StatTrak=VALUES(StatTrak), NameTag=VALUES(NameTag)`,
      [steamId, defindex, paintId, wear, seed, stattrak ? 0 : null, nametag || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/skin/:steamId/:defindex", async (req, res) => {
  const { steamId, defindex } = req.params;
  try {
    await pool.execute("DELETE FROM ws_weapon_cosmetics WHERE SteamId = ? AND ItemId = ?", [steamId, defindex]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/knife", async (req, res) => {
  const { steamId, defindex } = req.body;
  try {
    for (const team of [2, 3]) {
      await pool.execute(
        `INSERT INTO ws_team_knives (SteamId, Team, ItemId) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE ItemId=VALUES(ItemId)`,
        [steamId, team, defindex]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/knife/:steamId", async (req, res) => {
  try {
    await pool.execute("DELETE FROM ws_team_knives WHERE SteamId = ?", [req.params.steamId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/gloves", async (req, res) => {
  const { steamId, defindex } = req.body;
  try {
    for (const team of [2, 3]) {
      await pool.execute(
        `INSERT INTO ws_team_gloves (SteamId, Team, ItemId) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE ItemId=VALUES(ItemId)`,
        [steamId, team, defindex]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/gloves/:steamId", async (req, res) => {
  try {
    await pool.execute("DELETE FROM ws_team_gloves WHERE SteamId = ?", [req.params.steamId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/agent", async (req, res) => {
  const { steamId, defindex, team } = req.body;
  try {
    await pool.execute(
      `INSERT INTO ws_team_agents (SteamId, Team, ItemId) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ItemId=VALUES(ItemId)`,
      [steamId, team, defindex]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/music", async (req, res) => {
  const { steamId, musicId } = req.body;
  try {
    for (const team of [2, 3]) {
      await pool.execute(
        `INSERT INTO ws_team_musickits (SteamId, Team, ItemId) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE ItemId=VALUES(ItemId)`,
        [steamId, team, musicId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Custom Skins ─────────────────────────────────────────────────────────────

const CUSTOM_SKINS_FILE = path.join(__dirname, "custom_skins.json");

app.get("/api/custom-skins", (req, res) => {
  const skins = JSON.parse(fs.readFileSync(CUSTOM_SKINS_FILE, "utf-8"));
  res.json(skins);
});

app.get("/api/custom-models/:steamId", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM ws_custom_models WHERE SteamId = ?", [req.params.steamId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/custom-model", async (req, res) => {
  const { steamId, defindex, modelPath } = req.body;
  try {
    await pool.execute(
      `INSERT INTO ws_custom_models (SteamId, ItemId, ModelPath) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ModelPath=VALUES(ModelPath)`,
      [steamId, defindex, modelPath]
    );
    // Remove any existing paint skin for this weapon (they conflict)
    await pool.execute("DELETE FROM ws_weapon_cosmetics WHERE SteamId = ? AND ItemId = ?", [steamId, defindex]);
    // Insert a blank cosmetics entry so the plugin fires for this weapon
    await pool.execute(
      `INSERT INTO ws_weapon_cosmetics (SteamId, ItemId, PaintId, Wear, Seed) VALUES (?, ?, 0, 0.01, 0)`,
      [steamId, defindex]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/custom-model/:steamId/:defindex", async (req, res) => {
  const { steamId, defindex } = req.params;
  try {
    await pool.execute("DELETE FROM ws_custom_models WHERE SteamId = ? AND ItemId = ?", [steamId, defindex]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = 3000;

Promise.all([ensureTables(), loadCatalog()])
  .then(() => {
    app.listen(PORT, () => console.log(`\n✓ Skin changer running → http://localhost:${PORT}\n`));
  })
  .catch(err => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
