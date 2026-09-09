// SQLite storage for signatures and coalition members.
// The database file lives at DATA_DIR/petition.db (default ./data). Mount a
// persistent volume there in production or the data disappears on redeploy.
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "petition.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  zip TEXT NOT NULL,
  county TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  public_listing INTEGER NOT NULL DEFAULT 0,
  join_coalition INTEGER NOT NULL DEFAULT 0,
  attest INTEGER NOT NULL DEFAULT 1,
  dedupe_key TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  user_agent TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  county TEXT NOT NULL,
  role TEXT NOT NULL,
  employer_type TEXT,
  help TEXT,
  testify INTEGER NOT NULL DEFAULT 0,
  county_contact INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  contact_pref TEXT,
  consent INTEGER NOT NULL DEFAULT 1,
  dedupe_key TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sig_county ON signatures(county);
CREATE INDEX IF NOT EXISTS idx_sig_created ON signatures(created_at);
CREATE INDEX IF NOT EXISTS idx_mem_county ON members(county);
`);

const stmts = {
  insertSig: db.prepare(`INSERT INTO signatures
    (name, street, city, zip, county, role, email, phone, public_listing, join_coalition, attest, dedupe_key, ip_hash, user_agent)
    VALUES (@name, @street, @city, @zip, @county, @role, @email, @phone, @public_listing, @join_coalition, 1, @dedupe_key, @ip_hash, @user_agent)`),
  insertMember: db.prepare(`INSERT INTO members
    (name, email, phone, county, role, employer_type, help, testify, county_contact, message, contact_pref, consent, dedupe_key, ip_hash)
    VALUES (@name, @email, @phone, @county, @role, @employer_type, @help, @testify, @county_contact, @message, @contact_pref, 1, @dedupe_key, @ip_hash)`),
  sigCount: db.prepare(`SELECT COUNT(*) AS n FROM signatures`),
  memberCount: db.prepare(`SELECT COUNT(*) AS n FROM members`),
  sigByCounty: db.prepare(`SELECT county, COUNT(*) AS n FROM signatures GROUP BY county ORDER BY n DESC, county`),
  sigByRole: db.prepare(`SELECT role, COUNT(*) AS n FROM signatures GROUP BY role ORDER BY n DESC`),
  wall: db.prepare(`SELECT name, role, county, created_at FROM signatures WHERE public_listing = 1 ORDER BY id DESC LIMIT 200`),
  allSigs: db.prepare(`SELECT * FROM signatures ORDER BY county, id`),
  allMembers: db.prepare(`SELECT * FROM members ORDER BY id DESC`),
  markNotified: db.prepare(`UPDATE signatures SET notified = 1 WHERE id = ?`),
  markMemberNotified: db.prepare(`UPDATE members SET notified = 1 WHERE id = ?`),
  sigsSince: db.prepare(`SELECT * FROM signatures WHERE id > ? ORDER BY id`),
  deleteSig: db.prepare(`DELETE FROM signatures WHERE id = ?`),
  deleteMember: db.prepare(`DELETE FROM members WHERE id = ?`),
  setVerified: db.prepare(`UPDATE signatures SET verified = ? WHERE id = ?`),
};

module.exports = { db, stmts, DATA_DIR };
