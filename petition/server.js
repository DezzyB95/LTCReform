// The Care Floor Petition — web server.
// Serves the public site, records petition signatures and coalition sign-ups,
// emails each one to the organizer, and provides a password-protected admin
// area with CSV export and a printable delivery packet for the General Assembly.
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { db, stmts, DATA_DIR } = require("./db");
const mail = require("./mailer");

const PORT = Number(process.env.PORT || 3000);
const GOAL = Number(process.env.SIGNATURE_GOAL || 1000);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const COUNTIES = "Adams,Allen,Bartholomew,Benton,Blackford,Boone,Brown,Carroll,Cass,Clark,Clay,Clinton,Crawford,Daviess,Dearborn,Decatur,DeKalb,Delaware,Dubois,Elkhart,Fayette,Floyd,Fountain,Franklin,Fulton,Gibson,Grant,Greene,Hamilton,Hancock,Harrison,Hendricks,Henry,Howard,Huntington,Jackson,Jasper,Jay,Jefferson,Jennings,Johnson,Knox,Kosciusko,LaGrange,Lake,LaPorte,Lawrence,Madison,Marion,Marshall,Martin,Miami,Monroe,Montgomery,Morgan,Newton,Noble,Ohio,Orange,Owen,Parke,Perry,Pike,Porter,Posey,Pulaski,Putnam,Randolph,Ripley,Rush,St. Joseph,Scott,Shelby,Spencer,Starke,Steuben,Sullivan,Switzerland,Tippecanoe,Tipton,Union,Vanderburgh,Vermillion,Vigo,Wabash,Warren,Warrick,Washington,Wayne,Wells,White,Whitley".split(",");
const ROLES = [
  "A current CNA / QMA in Indiana long-term care",
  "A current LPN / RN in Indiana long-term care",
  "Other current long-term care staff (dietary, housekeeping, laundry, activities, therapy)",
  "A former long-term care worker",
  "A nursing home resident",
  "A family member of a resident",
  "An Indiana resident who supports this",
  "An organization (consumer, aging, disability, labor, faith, legal, academic)",
];
const HELP = ["Collect paper signatures in my county", "Be a quiet county contact for other workers", "Contact my legislators", "Testify or submit written testimony", "Host a listening session", "Share my story (with written consent, later)", "Help with public records requests", "Review the bill or the data", "Print, meeting space, or other support"];

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// ---------- helpers ----------
const s = (v, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const bool = (v) => v === true || v === "true" || v === "on" || v === 1 || v === "1";
const ipHash = (req) => crypto.createHash("sha256").update(String(req.ip || "") + (process.env.IP_SALT || "carefloor")).digest("hex").slice(0, 16);
const norm = (v) => s(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const PHONE_RE = /^[\d\s().+-]{7,20}$/;

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: "Too many submissions from this connection. Try again in an hour, or sign on paper." } });

// ---------- public API ----------
app.get("/api/stats", (req, res) => {
  const total = stmts.sigCount.get().n;
  res.json({ ok: true, total, goal: GOAL, members: stmts.memberCount.get().n, byCounty: stmts.sigByCounty.all(), byRole: stmts.sigByRole.all(), updated: new Date().toISOString() });
});

app.get("/api/wall", (req, res) => {
  const rows = stmts.wall.all().map((r) => {
    const parts = r.name.split(" ");
    const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    return { name: short, role: r.role.replace(/^A |^An |^Other /, "").replace(/ in Indiana long-term care$/, ""), county: r.county, when: r.created_at };
  });
  res.json({ ok: true, rows });
});

app.post("/api/sign", limiter, async (req, res) => {
  const b = req.body || {};
  if (s(b.website)) return res.json({ ok: true, id: 0 }); // honeypot: pretend success
  const v = {
    name: s(b.name, 80), street: s(b.street, 120), city: s(b.city, 60), zip: s(b.zip, 10), county: s(b.county, 40), role: s(b.role, 120),
    email: s(b.email, 120).toLowerCase(), phone: s(b.phone, 20),
    public_listing: bool(b.public_listing) ? 1 : 0, join_coalition: bool(b.join_coalition) ? 1 : 0,
  };
  const missing = [];
  if (v.name.length < 2 || !/\S\s+\S/.test(v.name)) missing.push("your full printed name");
  if (v.street.length < 4) missing.push("street address");
  if (v.city.length < 2) missing.push("city");
  if (!ZIP_RE.test(v.zip)) missing.push("a 5-digit ZIP");
  if (!COUNTIES.includes(v.county)) missing.push("county");
  if (!ROLES.includes(v.role)) missing.push("who you are");
  if (v.email && !EMAIL_RE.test(v.email)) missing.push("a valid email (or leave it blank)");
  if (v.phone && !PHONE_RE.test(v.phone)) missing.push("a valid phone (or leave it blank)");
  if (!bool(b.attest)) missing.push("the attestation checkbox");
  if (v.join_coalition && !v.email && !v.phone) missing.push("an email or phone so the coalition can reach you");
  if (missing.length) return res.status(400).json({ ok: false, error: "Still needed: " + missing.join(", ") + "." });

  const dedupe_key = norm(v.name) + "|" + v.zip.slice(0, 5);
  let id;
  try {
    id = stmts.insertSig.run({ ...v, dedupe_key, ip_hash: ipHash(req), user_agent: s(req.get("user-agent"), 200) }).lastInsertRowid;
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ ok: false, error: "A signature with this name and ZIP is already on the petition. Each person signs once. If that was not you, email the coalition." });
    console.error(e); return res.status(500).json({ ok: false, error: "The signature could not be saved. Try again, or sign on paper." });
  }
  const total = stmts.sigCount.get().n;
  const record = { ...v, id, created_at: new Date().toISOString().replace("T", " ").slice(0, 19) };
  res.json({ ok: true, id, total, goal: GOAL });
  // Notify after responding so a slow mail server never blocks the signer.
  try { await mail.notifySignature(record, total); stmts.markNotified.run(id); } catch (e) { console.error("[mail] organizer notify failed for signature", id, e.message); }
  try { await mail.receiptSignature(record); } catch (e) { console.error("[mail] receipt failed for signature", id, e.message); }
});

app.post("/api/join", limiter, async (req, res) => {
  const b = req.body || {};
  if (s(b.website)) return res.json({ ok: true, id: 0 });
  const helpList = Array.isArray(b.help) ? b.help : (typeof b.help === "string" && b.help ? [b.help] : []);
  const v = {
    name: s(b.name, 80), email: s(b.email, 120).toLowerCase(), phone: s(b.phone, 20), county: s(b.county, 40), role: s(b.role, 120),
    employer_type: s(b.employer_type, 60), help: helpList.map((h) => s(h, 80)).filter((h) => HELP.includes(h)).join("; "),
    testify: bool(b.testify) ? 1 : 0, county_contact: bool(b.county_contact) ? 1 : 0, message: s(b.message, 1000), contact_pref: s(b.contact_pref, 20),
  };
  const missing = [];
  if (v.name.length < 2) missing.push("your name");
  if (!v.email && !v.phone) missing.push("an email or a phone number");
  if (v.email && !EMAIL_RE.test(v.email)) missing.push("a valid email");
  if (v.phone && !PHONE_RE.test(v.phone)) missing.push("a valid phone number");
  if (!COUNTIES.includes(v.county)) missing.push("county");
  if (!ROLES.includes(v.role)) missing.push("who you are");
  if (!bool(b.consent)) missing.push("the consent checkbox");
  if (missing.length) return res.status(400).json({ ok: false, error: "Still needed: " + missing.join(", ") + "." });
  const dedupe_key = v.email ? "e:" + v.email : "p:" + v.phone.replace(/\D/g, "");
  let id;
  try { id = stmts.insertMember.run({ ...v, dedupe_key, ip_hash: ipHash(req) }).lastInsertRowid; }
  catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ ok: false, error: "You are already on the coalition list with that email or phone. Someone will be in touch." });
    console.error(e); return res.status(500).json({ ok: false, error: "The sign-up could not be saved. Try again." });
  }
  const total = stmts.memberCount.get().n;
  const record = { ...v, id, created_at: new Date().toISOString().replace("T", " ").slice(0, 19) };
  res.json({ ok: true, id, total });
  try { await mail.notifyMember(record, total); stmts.markMemberNotified.run(id); } catch (e) { console.error("[mail] organizer notify failed for member", id, e.message); }
  try { await mail.receiptMember(record); } catch (e) { console.error("[mail] receipt failed for member", id, e.message); }
});

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, mail: mail.transportKind, organizer: mail.ORGANIZER_EMAIL, signatures: stmts.sigCount.get().n, members: stmts.memberCount.get().n, dataDir: DATA_DIR });
});

// ---------- admin ----------
function adminAuth(req, res, next) {
  const user = process.env.ADMIN_USER || "organizer";
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(503).send("Admin is disabled until ADMIN_PASSWORD is set in the environment.");
  const h = req.get("authorization") || "";
  if (h.startsWith("Basic ")) {
    const [u, p] = Buffer.from(h.slice(6), "base64").toString().split(":");
    const ok = u === user && p && p.length === pass.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(pass));
    if (ok) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Care Floor Petition admin"').status(401).send("Sign in required.");
}
const admin = express.Router();
admin.use(adminAuth);

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px;background:#F7F5F1;color:#1C1C1A}h1,h2{font-weight:700;letter-spacing:-.01em}a{color:#2E4A62}nav a{margin-right:16px}table{border-collapse:collapse;width:100%;font-size:13.5px;background:#fff}th,td{border:1px solid #D9D5CC;padding:6px 8px;text-align:left;vertical-align:top}th{background:#EFECE5;position:sticky;top:0}.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}.k div{background:#fff;border:1px solid #D9D5CC;padding:12px;border-radius:4px}.k b{display:block;font-size:28px}.btn{display:inline-block;padding:8px 12px;border:1px solid #2E4A62;border-radius:3px;color:#2E4A62;text-decoration:none;margin-right:8px;background:#fff}form.inline{display:inline}button.x{border:1px solid #A8503C;color:#A8503C;background:#fff;border-radius:3px;padding:2px 8px;cursor:pointer}@media print{nav,.btn,button,.noprint{display:none!important}body{background:#fff;padding:0}th{position:static}}</style></head><body>
<nav class="noprint"><a href="/admin">Overview</a><a href="/admin/signatures">Signatures</a><a href="/admin/members">Coalition members</a><a href="/admin/packet">Delivery packet</a><a href="/admin/export/signatures.csv">Signatures CSV</a><a href="/admin/export/members.csv">Members CSV</a><a href="/">Public site</a></nav>${body}</body></html>`;

admin.get("/", (req, res) => {
  const total = stmts.sigCount.get().n, members = stmts.memberCount.get().n;
  const byCounty = stmts.sigByCounty.all(), byRole = stmts.sigByRole.all();
  res.send(page("Admin · overview", `<h1>Care Floor Petition · organizer</h1>
  <div class="k"><div>Signatures<b>${total}</b>of ${GOAL} goal</div><div>Coalition members<b>${members}</b></div><div>Counties represented<b>${byCounty.length}</b>of 92</div><div>Mail transport<b style="font-size:16px">${esc(mail.transportKind)}</b>to ${esc(mail.ORGANIZER_EMAIL)}</div></div>
  <h2>By county</h2><table><tr><th>County</th><th>Signatures</th></tr>${byCounty.map((r) => `<tr><td>${esc(r.county)}</td><td>${r.n}</td></tr>`).join("") || "<tr><td colspan=2>No signatures yet.</td></tr>"}</table>
  <h2 style="margin-top:24px">By signer type</h2><table><tr><th>Signer</th><th>Signatures</th></tr>${byRole.map((r) => `<tr><td>${esc(r.role)}</td><td>${r.n}</td></tr>`).join("") || "<tr><td colspan=2>No signatures yet.</td></tr>"}</table>
  <p style="margin-top:24px;color:#5B5A55">Delivery: sort by county, then look up each signer's House and Senate district at iga.in.gov/legislative/find-legislators, so each legislator receives the names from their own district. The delivery packet page prints the petition with a schedule of all online signatures (Exhibit B).</p>`));
});

admin.get("/signatures", (req, res) => {
  const rows = stmts.allSigs.all();
  res.send(page("Admin · signatures", `<h1>Signatures (${rows.length})</h1><p class="noprint"><a class="btn" href="/admin/export/signatures.csv">Download CSV</a><a class="btn" href="/admin/packet">Print delivery packet</a></p>
  <table><tr><th>#</th><th>Signed (UTC)</th><th>Name</th><th>Address</th><th>County</th><th>Signer</th><th>Email</th><th>Phone</th><th>Public</th><th>Join</th><th>Verified</th><th>Emailed</th><th class="noprint"></th></tr>
  ${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.street)}, ${esc(r.city)} ${esc(r.zip)}</td><td>${esc(r.county)}</td><td>${esc(r.role)}</td><td>${esc(r.email || "")}</td><td>${esc(r.phone || "")}</td><td>${r.public_listing ? "yes" : ""}</td><td>${r.join_coalition ? "yes" : ""}</td>
  <td><form class="inline" method="post" action="/admin/signatures/${r.id}/verify"><input type="hidden" name="v" value="${r.verified ? 0 : 1}"><button type="submit">${r.verified ? "✓ verified" : "mark verified"}</button></form></td><td>${r.notified ? "yes" : "no"}</td>
  <td class="noprint"><form class="inline" method="post" action="/admin/signatures/${r.id}/delete" onsubmit="return confirm('Delete signature #${r.id}?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=13>No signatures yet.</td></tr>"}</table>`));
});
admin.post("/signatures/:id/verify", (req, res) => { stmts.setVerified.run(Number(req.body.v) ? 1 : 0, Number(req.params.id)); res.redirect("/admin/signatures"); });
admin.post("/signatures/:id/delete", (req, res) => { stmts.deleteSig.run(Number(req.params.id)); res.redirect("/admin/signatures"); });

admin.get("/members", (req, res) => {
  const rows = stmts.allMembers.all();
  res.send(page("Admin · coalition members", `<h1>Coalition members (${rows.length})</h1><p class="noprint"><a class="btn" href="/admin/export/members.csv">Download CSV</a></p>
  <p style="color:#5B5A55">Reply only from a personal, non-work channel. Never reference a member's workplace in writing. Keep this list off any shared drive.</p>
  <table><tr><th>#</th><th>Joined (UTC)</th><th>Name</th><th>Email</th><th>Phone</th><th>County</th><th>Role</th><th>Employer type</th><th>Will help by</th><th>Testify</th><th>County contact</th><th>Contact by</th><th>Message</th><th class="noprint"></th></tr>
  ${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.email || "")}</td><td>${esc(r.phone || "")}</td><td>${esc(r.county)}</td><td>${esc(r.role)}</td><td>${esc(r.employer_type || "")}</td><td>${esc(r.help || "")}</td><td>${r.testify ? "yes" : ""}</td><td>${r.county_contact ? "yes" : ""}</td><td>${esc(r.contact_pref || "")}</td><td>${esc(r.message || "")}</td>
  <td class="noprint"><form class="inline" method="post" action="/admin/members/${r.id}/delete" onsubmit="return confirm('Delete member #${r.id}?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=14>No members yet.</td></tr>"}</table>`));
});
admin.post("/members/:id/delete", (req, res) => { stmts.deleteMember.run(Number(req.params.id)); res.redirect("/admin/members"); });

function csv(rows, cols) {
  const q = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n") + "\r\n";
}
admin.get("/export/signatures.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="signatures-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv(stmts.allSigs.all(), ["id", "created_at", "name", "street", "city", "zip", "county", "role", "email", "phone", "public_listing", "join_coalition", "verified", "notified"]));
});
admin.get("/export/members.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="members-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv(stmts.allMembers.all(), ["id", "created_at", "name", "email", "phone", "county", "role", "employer_type", "help", "testify", "county_contact", "contact_pref", "message"]));
});

// Printable delivery packet: petition text + Exhibit B schedule of online signatures, grouped by county.
admin.get("/packet", (req, res) => {
  const rows = stmts.allSigs.all();
  const county = s(req.query.county, 40);
  const list = county ? rows.filter((r) => r.county === county) : rows;
  const groups = {};
  list.forEach((r) => { (groups[r.county] = groups[r.county] || []).push(r); });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const body = `
  <style>.pk{max-width:8.5in;margin:0 auto;background:#fff;padding:0.6in;font-family:"Times New Roman",Times,serif;font-size:11.5pt;line-height:1.45;color:#000}.pk h1{text-align:center;font-size:15pt;letter-spacing:.05em;margin:0}.pk .sub{text-align:center;font-weight:700;font-size:11pt;margin:6px 0 18px}.pk .w{padding-left:1.6em;text-indent:-1.6em;margin:0 0 8px}.pk ol{padding-left:26px}.pk li{margin-bottom:6px}.pk table{font-size:9.5pt;margin-top:8px;page-break-inside:auto}.pk th,.pk td{border:1px solid #000;padding:3px 5px}.pk h2{font-size:12.5pt;margin:22px 0 6px;page-break-after:avoid}.pb{page-break-before:always}.pk .cert{margin-top:18px;font-size:10.5pt}.sel{margin:12px 0}@media print{.sel{display:none}.pk{padding:0}}</style>
  <div class="noprint sel">Filter by county: <select onchange="location='/admin/packet'+(this.value?'?county='+encodeURIComponent(this.value):'')"><option value="">All counties</option>${COUNTIES.map((c) => `<option ${c === county ? "selected" : ""}>${esc(c)}</option>`).join("")}</select> &nbsp; <a class="btn" href="#" onclick="print();return false">Print / save as PDF</a></div>
  <div class="pk">
    <h1>PETITION TO THE INDIANA GENERAL ASSEMBLY</h1>
    <p class="sub">For a state direct care staffing floor, protection of the caregivers who report, and accountability for nursing home Medicaid dollars</p>
    <p>To the Honorable Speaker and Members of the House of Representatives, and the Honorable President Pro Tempore and Members of the Senate, of the 125th General Assembly of the State of Indiana:</p>
    <p>The undersigned, residents of the State of Indiana, exercising the right secured by Article 1, Section 31 of the Constitution of the State of Indiana to instruct our representatives and to apply to the General Assembly for redress of grievances, respectfully represent:</p>
    <p class="w"><b>WHEREAS,</b> Indiana law sets no minimum number of certified nurse aide hours or total direct care hours per resident day in comprehensive care facilities, requiring only one-half hour of licensed nurse time per resident day under 410 IAC 16.2-3.1-17, and Indiana is one of eighteen states with no direct care staffing minimum of any kind;</p>
    <p class="w"><b>WHEREAS,</b> an analysis of federal payroll-based staffing data published March 18, 2025 ranked Indiana fiftieth of the fifty states and the District of Columbia for total nurse staffing hours per resident after adjusting for resident acuity, and federal data for the first quarter of 2026 show that eighty-eight percent of Indiana nursing homes staffed below their residents' assessed needs;</p>
    <p class="w"><b>WHEREAS,</b> the federal minimum staffing standard finalized in May 2024 was repealed effective February 2, 2026, and Public Law 119-21 bars its enforcement until after September 30, 2034, so that no federal floor will exist for the remainder of this decade unless the State of Indiana sets one;</p>
    <p class="w"><b>WHEREAS,</b> county-owned hospitals hold the licenses to most Indiana nursing homes and, according to published investigative reporting drawing on records obtained through litigation, retained roughly $2.6 billion of $5.6 billion in supplemental Medicaid payments generated by those homes over approximately fifteen years, applying it to hospital construction, equipment, and operations rather than bedside care;</p>
    <p class="w"><b>WHEREAS,</b> a resident's rights are exercised through the frontline caregiver, and Indiana's at-will employment law, together with a thirty-day window to file a retaliation complaint, leaves that caregiver exposed to discipline, termination, and nurse aide registry referral for acts and omissions caused by conditions the facility created; and</p>
    <p class="w"><b>WHEREAS,</b> the safety of residents and the safety of the workers who care for them are one problem, and no resident right can be enforced by a worker who cannot act on it without losing their livelihood;</p>
    <p><b>NOW, THEREFORE,</b> your petitioners respectfully pray that the General Assembly:</p>
    <ol>
      <li>Introduce, hear in committee, and enact in the 2027 regular session the <b>Indiana Nursing Home Direct Care Staffing and Accountability Act</b>, adding IC 16-28-17, IC 16-28-18, IC 16-28-19, IC 16-28-20, and IC 16-22-15 to the Indiana Code and amending IC 16-28-5-4 and IC 16-28-9-3;</li>
      <li>Establish thereby a minimum direct care staffing standard of 3.00 total hours per resident day beginning July 1, 2027 and 3.48 hours beginning July 1, 2028, including 2.45 certified nurse aide hours and a registered nurse on site twenty-four hours a day, with acuity-based staffing above the minimum, annual unannounced acuity verification surveys, and public posting of staffing on every shift;</li>
      <li>Protect every direct care employee who reports an unsafe condition or refuses an unsafe assignment, through a rebuttable presumption of retaliation, a private right of action, and a systemic cause determination before any nurse aide registry finding, discipline, or termination for an act or omission caused by staffing below the standard, missing or inoperable equipment, an inaccurate assist level, or facility direction;</li>
      <li>Provide that penalties for staffing and retaliation violations exceed the cost of compliance, are not reduced upon correction, are not paid from Medicaid funds or charged to residents, and are deposited in a direct care restitution fund;</li>
      <li>Require county hospitals that hold nursing facility licenses to spend not less than eighty percent of the nursing facility supplemental Medicaid payments attributable to a facility on direct care at that facility, to file annual public facility-level accountings, and to repay diverted amounts; and</li>
      <li>Recognize the direct care workforce as a party to nursing home policy in Indiana, by consulting the Care Floor Coalition and the facility direct care staffing committees created by the Act in the development of rules, reimbursement, and oversight affecting long-term care, and by inviting direct care workers, residents, and families to testify at any hearing on the Act.</li>
    </ol>
    <p>Respectfully submitted by the undersigned residents of Indiana, whose names appear on the attached paper signature sheets and on the Schedule of Signatures Collected Online (Exhibit B), each of whom has signed this petition once on the date shown.</p>
    <p style="margin-top:14px">Presented to the [House of Representatives / Senate] by the Honorable ______________________________, District ____, on ______________, 20____, for referral to the Committee on ______________________________.</p>
    <p>Submitted on behalf of the petitioners by The Care Floor Coalition. Total signatures attached: ${list.length} online${county ? ` (${esc(county)} County)` : ""} plus ______ on paper sheets.</p>

    <h2 class="pb">EXHIBIT B · SCHEDULE OF SIGNATURES COLLECTED ONLINE${county ? ` · ${esc(county).toUpperCase()} COUNTY` : ""}</h2>
    <p>The signatures listed below were submitted through the coalition's petition website, on which each signer entered their printed name, residence address, county, and the date, and affirmed that they are a resident of Indiana, that they signed once, and that the information given is true. Each record was received by the coalition by email at the time of signing and is reproduced here without alteration. Residence addresses are provided to the presenting member and the committee and are not otherwise published. Prepared ${esc(today)}.</p>
    ${Object.keys(groups).sort().map((c) => `<h2>${esc(c)} County (${groups[c].length})</h2><table><tr><th style="width:24px">#</th><th>Printed name</th><th>Residence address</th><th>Signer</th><th style="width:80px">Date signed</th></tr>${groups[c].map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.street)}, ${esc(r.city)}, IN ${esc(r.zip)}</td><td>${esc(r.role.replace(/ in Indiana long-term care$/, ""))}</td><td>${esc(r.created_at.slice(0, 10))}</td></tr>`).join("")}</table>`).join("") || "<p>No online signatures yet.</p>"}
    <p class="cert">Certification: I certify that the entries above are a true transcription of signature records received by The Care Floor Coalition through its petition website, that duplicate submissions were removed, and that the original records are retained and available to the presenting member on request.</p>
    <p class="cert">Signature: ______________________________ &nbsp;&nbsp; Printed name: ______________________________ &nbsp;&nbsp; Date: ______________</p>
  </div>`;
  res.send(page("Admin · delivery packet", body));
});

app.use("/admin", admin);

// ---------- static site ----------
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: "5m" }));
app.use((req, res) => res.status(404).send("Not found"));

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Care Floor Petition listening on http://localhost:${PORT} (data in ${DATA_DIR})`);
    const v = await mail.verify();
    if (!v.ok) console.error(`[mail] ${v.kind} transport failed to verify: ${v.error}`);
  });
}
module.exports = app;
