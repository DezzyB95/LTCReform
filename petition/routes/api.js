// Public JSON API and the signer-facing confirm/remove pages.
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { db, counts, getSetting } = require("../lib/db");
const mail = require("../lib/mailer");
const { lookupDistricts } = require("../lib/geocode");
const { legislatorsFor } = require("../lib/jobs");
const V = require("../lib/validate");
const { esc, publicPage } = require("../views/layout");

const router = express.Router();
const token = (p) => p + crypto.randomBytes(18).toString("base64url");
const ipHash = (req) => crypto.createHash("sha256").update(String(req.ip || "") + (process.env.IP_SALT || "carefloor")).digest("hex").slice(0, 16);
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: "Too many submissions from this connection. Try again in an hour, or sign on paper." } });
const GEOCODE_INLINE_MS = Number(process.env.GEOCODE_INLINE_MS || 3500);
const geocodeEnabled = () => String(process.env.GEOCODE || "on") !== "off";

const publicLeg = (l) => l ? { chamber: l.chamber, district: l.district, name: l.name, party: l.party || "", email: l.email || "", phone: l.phone || "" } : null;

router.get("/api/stats", (req, res) => {
  const online = counts.online(), paper = counts.paper();
  res.json({ ok: true, total: online + paper, online, paper, confirmed: counts.confirmed(), goal: Number(getSetting("goal")) || 1000, members: counts.members(), byCounty: counts.byCounty(), byRole: counts.byRole(), banner: getSetting("banner"), organizationDay: getSetting("organization_day"), adjournment: getSetting("adjournment"), updated: new Date().toISOString() });
});

router.get("/api/wall", (req, res) => {
  const rows = db.prepare("SELECT name, role, county, created_at FROM signatures WHERE public_listing = 1 ORDER BY id DESC LIMIT 200").all()
    .map((r) => ({ name: V.shortName(r.name), role: V.shortRole(r.role), county: r.county, when: r.created_at }));
  res.json({ ok: true, rows });
});

router.get("/api/legislators", (req, res) => {
  // Public directory (name, chamber, district, office contact only) so the page can show "your legislators".
  res.json({ ok: true, rows: db.prepare("SELECT chamber, district, name, party, email, phone FROM legislators ORDER BY chamber, district").all() });
});

router.post("/api/sign", limiter, async (req, res) => {
  const b = req.body || {};
  if (V.s(b.website)) return res.json({ ok: true, id: 0 }); // honeypot
  const r = V.validateSignature(b);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  const v = r.values;

  // District lookup before responding, so the signer sees their legislators; bounded by a short timeout.
  let geo = { status: "pending" };
  if (geocodeEnabled()) geo = await lookupDistricts(v, { timeoutMs: GEOCODE_INLINE_MS });
  const rec = { ...v, confirm_token: token("c_"), remove_token: token("s_"), house_district: geo.house || null, senate_district: geo.senate || null, geocode_status: geo.status === "done" || geo.status === "nomatch" ? geo.status : "pending", geocoded_at: geo.status === "done" || geo.status === "nomatch" ? now() : null, geocode_attempts: geo.status === "pending" ? 0 : 1, ip_hash: ipHash(req), user_agent: V.s(req.get("user-agent"), 200) };
  let id;
  try {
    id = db.prepare(`INSERT INTO signatures (name, street, city, zip, county, role, email, phone, public_listing, join_coalition, attest, dedupe_key, ip_hash, user_agent, confirm_token, remove_token, house_district, senate_district, geocode_status, geocoded_at, geocode_attempts)
      VALUES (@name, @street, @city, @zip, @county, @role, @email, @phone, @public_listing, @join_coalition, 1, @dedupe_key, @ip_hash, @user_agent, @confirm_token, @remove_token, @house_district, @senate_district, @geocode_status, @geocoded_at, @geocode_attempts)`).run(rec).lastInsertRowid;
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ ok: false, error: "A signature with this name and ZIP is already on the petition. Each person signs once. If that was not you, email the coalition." });
    console.error(e); return res.status(500).json({ ok: false, error: "The signature could not be saved. Try again, or sign on paper." });
  }
  const total = counts.online();
  const legs = legislatorsFor(rec);
  const record = { ...rec, id, created_at: now() };
  res.json({ ok: true, id, total: total + counts.paper(), online: total, goal: Number(getSetting("goal")) || 1000, districts: rec.house_district ? { house: rec.house_district, senate: rec.senate_district } : null, legislators: { house: publicLeg(legs.house), senate: publicLeg(legs.senate) }, confirmationSent: !!v.email });

  // If the coalition box was checked, create the member record too (same contact details).
  if (v.join_coalition && (v.email || v.phone)) {
    try {
      db.prepare(`INSERT OR IGNORE INTO members (name, email, phone, county, role, employer_type, help, testify, county_contact, message, contact_pref, consent, dedupe_key, ip_hash, remove_token)
        VALUES (@name, @email, @phone, @county, @role, '', 'Signed the petition and asked to join', 0, 0, '', '', 1, @dedupe_key, @ip_hash, @remove_token)`).run({ name: v.name, email: v.email, phone: v.phone, county: v.county, role: v.role, dedupe_key: v.email ? "e:" + v.email : "p:" + v.phone.replace(/\D/g, ""), ip_hash: rec.ip_hash, remove_token: token("m_") });
    } catch (e) { console.error("[sign] member insert", e.message); }
  }
  try { await mail.notifySignature(record, total, legs); db.prepare("UPDATE signatures SET notified=1 WHERE id=?").run(id); } catch (e) { console.error("[mail] organizer notify failed for signature", id, e.message); }
  try { await mail.receiptSignature(record, legs); } catch (e) { console.error("[mail] receipt failed for signature", id, e.message); }
});

router.post("/api/join", limiter, async (req, res) => {
  const b = req.body || {};
  if (V.s(b.website)) return res.json({ ok: true, id: 0 });
  const r = V.validateMember(b);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  const v = { ...r.values, ip_hash: ipHash(req), remove_token: token("m_") };
  let id;
  try {
    id = db.prepare(`INSERT INTO members (name, email, phone, county, role, employer_type, help, testify, county_contact, message, contact_pref, consent, dedupe_key, ip_hash, remove_token)
      VALUES (@name, @email, @phone, @county, @role, @employer_type, @help, @testify, @county_contact, @message, @contact_pref, 1, @dedupe_key, @ip_hash, @remove_token)`).run(v).lastInsertRowid;
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ ok: false, error: "You are already on the coalition list with that email or phone. Someone will be in touch." });
    console.error(e); return res.status(500).json({ ok: false, error: "The sign-up could not be saved. Try again." });
  }
  const total = counts.members();
  const record = { ...v, id, created_at: now() };
  res.json({ ok: true, id, total });
  try { await mail.notifyMember(record, total); db.prepare("UPDATE members SET notified=1 WHERE id=?").run(id); } catch (e) { console.error("[mail] organizer notify failed for member", id, e.message); }
  try { await mail.receiptMember(record); } catch (e) { console.error("[mail] receipt failed for member", id, e.message); }
});

router.get("/api/health", (req, res) => {
  res.json({ ok: true, mail: mail.transportKind, organizer: mail.ORGANIZER_EMAIL, signatures: counts.online(), members: counts.members(), geocode: counts.geocode(), version: require("../package.json").version });
});

// ---- signer-facing pages ----
router.get("/confirm/:token", (req, res) => {
  const row = db.prepare("SELECT id, name, confirmed_at FROM signatures WHERE confirm_token = ?").get(String(req.params.token).slice(0, 80));
  if (!row) return res.status(404).send(publicPage("Link not found", `<h1>That link is not valid.</h1><p>It may have been used already or the signature may have been removed. <a href="/">Back to the petition</a>.</p>`));
  if (!row.confirmed_at) db.prepare("UPDATE signatures SET confirmed_at = ? WHERE id = ?").run(now(), row.id);
  res.send(publicPage("Signature confirmed", `<h1>Confirmed. Thank you, ${esc(row.name.split(" ")[0])}.</h1><p>Your signature is now marked as confirmed on the petition to the Indiana General Assembly.</p><p>Two things that help most this week: find your two legislators at <a href="https://iga.in.gov/legislative/find-legislators" rel="noopener">iga.in.gov</a>, and <a href="/#petition">print a paper sheet</a> to collect ten more signatures.</p><p><a href="/">Back to the petition</a></p>`));
});

router.get("/remove/:token", (req, res) => {
  const t = String(req.params.token).slice(0, 80);
  const kind = t.startsWith("m_") ? "member" : "signature";
  const row = kind === "member" ? db.prepare("SELECT id, name FROM members WHERE remove_token = ?").get(t) : db.prepare("SELECT id, name FROM signatures WHERE remove_token = ?").get(t);
  if (!row) return res.status(404).send(publicPage("Link not found", `<h1>That link is not valid.</h1><p>The record may already have been removed. <a href="/">Back to the site</a>.</p>`));
  res.send(publicPage("Remove my details", `<h1>Remove your ${kind === "member" ? "coalition membership" : "signature"}?</h1><p>This deletes the ${kind === "member" ? "contact details you gave when you joined" : "signature and address you entered"} from the coalition's records. It cannot be undone.</p><form method="post" action="/remove/${esc(t)}"><button class="btn primary" type="submit">Yes, remove my details</button> <a class="btn" href="/">Keep them</a></form>`));
});
router.post("/remove/:token", (req, res) => {
  const t = String(req.params.token).slice(0, 80);
  const r = t.startsWith("m_") ? db.prepare("DELETE FROM members WHERE remove_token = ?").run(t) : db.prepare("DELETE FROM signatures WHERE remove_token = ?").run(t);
  res.send(publicPage("Removed", `<h1>${r.changes ? "Removed." : "Nothing to remove."}</h1><p>${r.changes ? "Your details have been deleted from the coalition's records. If you signed a paper sheet as well, email the coalition and it will strike that line before delivery." : "That record was already gone."}</p><p><a href="/">Back to the site</a></p>`));
});

module.exports = router;
