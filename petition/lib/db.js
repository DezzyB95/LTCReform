// SQLite storage with numbered migrations.
// The database file lives at DATA_DIR/petition.db (default ./data). Mount a
// persistent volume there in production or the data disappears on redeploy.
// To change the schema, append a new entry to MIGRATIONS; never edit an old one.
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "petition.db");
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const MIGRATIONS = [
  // 1: original tables
  `
  CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL, street TEXT NOT NULL, city TEXT NOT NULL, zip TEXT NOT NULL,
    county TEXT NOT NULL, role TEXT NOT NULL, email TEXT, phone TEXT,
    public_listing INTEGER NOT NULL DEFAULT 0, join_coalition INTEGER NOT NULL DEFAULT 0,
    attest INTEGER NOT NULL DEFAULT 1, dedupe_key TEXT NOT NULL UNIQUE,
    ip_hash TEXT, user_agent TEXT, notified INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0, notes TEXT
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL, email TEXT, phone TEXT, county TEXT NOT NULL, role TEXT NOT NULL,
    employer_type TEXT, help TEXT, testify INTEGER NOT NULL DEFAULT 0,
    county_contact INTEGER NOT NULL DEFAULT 0, message TEXT, contact_pref TEXT,
    consent INTEGER NOT NULL DEFAULT 1, dedupe_key TEXT NOT NULL UNIQUE,
    ip_hash TEXT, notified INTEGER NOT NULL DEFAULT 0, notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sig_county ON signatures(county);
  CREATE INDEX IF NOT EXISTS idx_sig_created ON signatures(created_at);
  CREATE INDEX IF NOT EXISTS idx_mem_county ON members(county);
  `,
  // 2: confirmation, removal tokens, legislative districts, legislators, paper counts, settings
  `
  ALTER TABLE signatures ADD COLUMN confirm_token TEXT;
  ALTER TABLE signatures ADD COLUMN confirmed_at TEXT;
  ALTER TABLE signatures ADD COLUMN remove_token TEXT;
  ALTER TABLE signatures ADD COLUMN house_district INTEGER;
  ALTER TABLE signatures ADD COLUMN senate_district INTEGER;
  ALTER TABLE signatures ADD COLUMN geocode_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE signatures ADD COLUMN geocoded_at TEXT;
  ALTER TABLE signatures ADD COLUMN geocode_attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE signatures ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
  ALTER TABLE members ADD COLUMN remove_token TEXT;
  CREATE INDEX IF NOT EXISTS idx_sig_house ON signatures(house_district);
  CREATE INDEX IF NOT EXISTS idx_sig_senate ON signatures(senate_district);
  CREATE INDEX IF NOT EXISTS idx_sig_geo ON signatures(geocode_status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sig_confirm ON signatures(confirm_token);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sig_remove ON signatures(remove_token);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_mem_remove ON members(remove_token);
  CREATE TABLE IF NOT EXISTS legislators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chamber TEXT NOT NULL CHECK (chamber IN ('House','Senate')),
    district INTEGER NOT NULL,
    name TEXT NOT NULL, party TEXT, email TEXT, phone TEXT, office TEXT,
    committees TEXT, stance TEXT, notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (chamber, district)
  );
  CREATE TABLE IF NOT EXISTS paper_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    county TEXT NOT NULL, sheets INTEGER NOT NULL DEFAULT 0, signatures INTEGER NOT NULL DEFAULT 0,
    collected_on TEXT, circulator TEXT, note TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT
  );
  CREATE TABLE IF NOT EXISTS contact_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    legislator_id INTEGER REFERENCES legislators(id) ON DELETE CASCADE,
    who TEXT, method TEXT, summary TEXT, follow_up_on TEXT
  );
  `,
];

function migrate() {
  const current = db.pragma("user_version", { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
    console.log(`[db] migrated to schema version ${v + 1}`);
  }
}
migrate();

// ---- settings ----
const getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSettingStmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
const DEFAULTS = {
  goal: process.env.SIGNATURE_GOAL || "1000",
  banner: "",
  coalition_name: "The Care Floor Coalition",
  public_contact: "",
  organization_day: "2026-11-17",
  adjournment: "2027-04-29",
};
function getSetting(key) { const r = getSettingStmt.get(key); return r ? r.value : (DEFAULTS[key] ?? ""); }
function setSetting(key, value) { setSettingStmt.run(key, String(value ?? "")); }
function allSettings() { const o = {}; Object.keys(DEFAULTS).forEach((k) => { o[k] = getSetting(k); }); return o; }

// ---- counts ----
const counts = {
  online: () => db.prepare("SELECT COUNT(*) AS n FROM signatures").get().n,
  confirmed: () => db.prepare("SELECT COUNT(*) AS n FROM signatures WHERE confirmed_at IS NOT NULL").get().n,
  paper: () => db.prepare("SELECT COALESCE(SUM(signatures),0) AS n FROM paper_counts").get().n,
  members: () => db.prepare("SELECT COUNT(*) AS n FROM members").get().n,
  byCounty: () => {
    const web = db.prepare("SELECT county, COUNT(*) AS n FROM signatures GROUP BY county").all();
    const paper = db.prepare("SELECT county, SUM(signatures) AS n FROM paper_counts GROUP BY county").all();
    const m = {};
    web.forEach((r) => { m[r.county] = (m[r.county] || 0) + r.n; });
    paper.forEach((r) => { m[r.county] = (m[r.county] || 0) + r.n; });
    return Object.keys(m).map((county) => ({ county, n: m[county] })).sort((a, b) => b.n - a.n || a.county.localeCompare(b.county));
  },
  byRole: () => db.prepare("SELECT role, COUNT(*) AS n FROM signatures GROUP BY role ORDER BY n DESC").all(),
  byDistrict: (chamber) => {
    const col = chamber === "Senate" ? "senate_district" : "house_district";
    return db.prepare(`SELECT s.${col} AS district, COUNT(*) AS n, l.name, l.party, l.id AS legislator_id, l.stance FROM signatures s LEFT JOIN legislators l ON l.chamber = ? AND l.district = s.${col} WHERE s.${col} IS NOT NULL GROUP BY s.${col} ORDER BY n DESC, district`).all(chamber);
  },
  geocode: () => db.prepare("SELECT geocode_status AS status, COUNT(*) AS n FROM signatures GROUP BY geocode_status").all(),
};

function backupTo(file) { return db.backup(file); }

module.exports = { db, DATA_DIR, DB_FILE, migrate, getSetting, setSetting, allSettings, counts, backupTo };
