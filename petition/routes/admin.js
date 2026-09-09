// Organizer admin: overview, signatures, members, legislators, paper sheets,
// delivery packets, settings, exports, backup. HTTP basic auth.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const { db, counts, getSetting, setSetting, allSettings, backupTo, DB_FILE } = require("../lib/db");
const mail = require("../lib/mailer");
const jobs = require("../lib/jobs");
const V = require("../lib/validate");
const { esc, page } = require("../views/layout");
const { packetHtml } = require("../views/petition");

const router = express.Router();

// ---- auth + CSRF-style origin check ----
router.use((req, res, next) => {
  const user = process.env.ADMIN_USER || "organizer";
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(503).send("Admin is disabled until ADMIN_PASSWORD is set in the environment.");
  const h = req.get("authorization") || "";
  if (h.startsWith("Basic ")) {
    const idx = Buffer.from(h.slice(6), "base64").toString().indexOf(":");
    const raw = Buffer.from(h.slice(6), "base64").toString();
    const u = raw.slice(0, idx), p = raw.slice(idx + 1);
    if (u === user && p.length === pass.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(pass))) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Care Floor Petition admin"').status(401).send("Sign in required.");
});
router.use((req, res, next) => {
  if (req.method === "GET") return next();
  const origin = req.get("origin") || (req.get("referer") ? new URL(req.get("referer")).origin : "");
  const host = req.get("x-forwarded-host") || req.get("host");
  if (origin && new URL(origin).host !== host) return res.status(403).send("Cross-site request blocked.");
  next();
});

const q = (v) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csv = (rows, cols) => "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n") + "\r\n";
const sendCsv = (res, name, body) => { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`); res.send(body); };
const opt = (list, cur) => list.map((c) => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("");
const legName = (l) => l ? `${l.chamber === "House" ? "Rep." : "Sen."} ${l.name}${l.party ? " (" + l.party.slice(0, 1) + ")" : ""}` : '<span class="muted">not in directory</span>';

// ---- overview ----
router.get("/", (req, res) => {
  const online = counts.online(), paper = counts.paper(), members = counts.members(), confirmed = counts.confirmed();
  const goal = Number(getSetting("goal")) || 1000;
  const byCounty = counts.byCounty(), house = counts.byDistrict("House"), senate = counts.byDistrict("Senate");
  const geo = Object.fromEntries(counts.geocode().map((r) => [r.status, r.n]));
  const legCount = db.prepare("SELECT COUNT(*) AS n FROM legislators").get().n;
  const msg = req.query.msg ? `<div class="msg">${esc(req.query.msg)}</div>` : "";
  res.send(page("Admin · overview", `<h1>Care Floor Petition · organizer</h1>${msg}
  <div class="k"><div>Signatures<b>${online + paper}</b><small>${online} online · ${paper} on paper · goal ${goal}</small></div><div>Confirmed by email<b>${confirmed}</b><small>of ${online} online</small></div><div>Coalition members<b>${members}</b></div><div>Counties<b>${byCounty.length}</b><small>of 92</small></div><div>Districts found<b>${geo.done || 0}</b><small>${geo.pending || 0} pending · ${geo.nomatch || 0} no match · ${geo.error || 0} failed</small></div><div>Legislator directory<b>${legCount}</b><small>of 150 · <a href="/admin/legislators">edit</a></small></div></div>
  <p class="noprint"><a class="btn" href="/admin/packet">Print delivery packet</a><a class="btn" href="/admin/export/signatures.csv">Signatures CSV</a><a class="btn" href="/admin/export/members.csv">Members CSV</a><a class="btn" href="/admin/backup.db">Download database backup</a><form class="inline" method="post" action="/admin/jobs/run"><button class="btn" type="submit">Run district lookups and resend failed emails now</button></form></p>
  <p class="muted">Mail transport: <b>${esc(mail.transportKind)}</b> to ${esc(mail.ORGANIZER_EMAIL)}. Last messages: ${mail.sent.slice(-3).map((m) => esc(m.subject)).join(" · ") || "none yet"}.</p>
  <h2>By House district</h2><table><tr><th>HD</th><th>Signatures</th><th>Legislator</th><th>Stance</th><th></th></tr>${house.map((r) => `<tr><td>${r.district}</td><td>${r.n}</td><td>${r.name ? esc(r.name) + (r.party ? " (" + esc(r.party) + ")" : "") : '<span class="muted">not in directory</span>'}</td><td>${esc(r.stance || "")}</td><td><a href="/admin/packet?chamber=House&district=${r.district}">packet</a></td></tr>`).join("") || "<tr><td colspan=5>No districts determined yet.</td></tr>"}</table>
  <h2>By Senate district</h2><table><tr><th>SD</th><th>Signatures</th><th>Legislator</th><th>Stance</th><th></th></tr>${senate.map((r) => `<tr><td>${r.district}</td><td>${r.n}</td><td>${r.name ? esc(r.name) + (r.party ? " (" + esc(r.party) + ")" : "") : '<span class="muted">not in directory</span>'}</td><td>${esc(r.stance || "")}</td><td><a href="/admin/packet?chamber=Senate&district=${r.district}">packet</a></td></tr>`).join("") || "<tr><td colspan=5>No districts determined yet.</td></tr>"}</table>
  <h2>By county (online + paper)</h2><table><tr><th>County</th><th>Signatures</th><th></th></tr>${byCounty.map((r) => `<tr><td>${esc(r.county)}</td><td>${r.n}</td><td><a href="/admin/packet?county=${encodeURIComponent(r.county)}">packet</a></td></tr>`).join("") || "<tr><td colspan=3>No signatures yet.</td></tr>"}</table>
  <h2>By signer type</h2><table><tr><th>Signer</th><th>Online signatures</th></tr>${counts.byRole().map((r) => `<tr><td>${esc(r.role)}</td><td>${r.n}</td></tr>`).join("") || "<tr><td colspan=2>None yet.</td></tr>"}</table>`, { current: "/admin" }));
});

router.post("/jobs/run", async (req, res) => {
  const o = await jobs.runOnce();
  res.redirect("/admin?msg=" + encodeURIComponent(`Done: ${o.notified} emails resent, ${o.geocoded} districts found, ${o.nomatch} addresses with no match, ${o.errors} errors.`));
});

// ---- signatures ----
router.get("/signatures", (req, res) => {
  const f = { county: V.s(req.query.county, 40), chamber: V.s(req.query.chamber, 10), district: parseInt(req.query.district, 10), status: V.s(req.query.status, 20), qtext: V.s(req.query.q, 60) };
  let where = [], args = [];
  if (f.county) { where.push("county = ?"); args.push(f.county); }
  if (f.chamber && f.district) { where.push((f.chamber === "Senate" ? "senate_district" : "house_district") + " = ?"); args.push(f.district); }
  if (f.status === "confirmed") where.push("confirmed_at IS NOT NULL"); else if (f.status === "unconfirmed") where.push("confirmed_at IS NULL AND email <> ''"); else if (f.status === "nodistrict") where.push("house_district IS NULL"); else if (f.status === "unverified") where.push("verified = 0");
  if (f.qtext) { where.push("(name LIKE ? OR email LIKE ? OR city LIKE ?)"); args.push(`%${f.qtext}%`, `%${f.qtext}%`, `%${f.qtext}%`); }
  const rows = db.prepare(`SELECT * FROM signatures ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC`).all(...args);
  res.send(page("Admin · signatures", `<h1>Online signatures (${rows.length})</h1>
  <form class="filters" method="get"><select name="county"><option value="">All counties</option>${opt(V.COUNTIES, f.county)}</select><select name="chamber"><option value="">Chamber</option>${opt(["House", "Senate"], f.chamber)}</select><input name="district" type="number" min="1" max="100" placeholder="District" value="${f.district || ""}" style="width:90px"><select name="status"><option value="">Any status</option>${["confirmed", "unconfirmed", "nodistrict", "unverified"].map((s) => `<option value="${s}" ${f.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><input name="q" placeholder="name, email, city" value="${esc(f.qtext)}"><button class="btn" type="submit">Filter</button><a class="btn" href="/admin/signatures">Clear</a><a class="btn" href="/admin/export/signatures.csv">CSV</a></form>
  <table><tr><th>#</th><th>Signed (UTC)</th><th>Name</th><th>Address</th><th>County</th><th>HD/SD</th><th>Signer</th><th>Contact</th><th>Flags</th><th>Verified</th><th class="noprint"></th></tr>
  ${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.street)}, ${esc(r.city)} ${esc(r.zip)}</td><td>${esc(r.county)}</td><td>${r.house_district ? `${r.house_district}/${r.senate_district}` : `<span class="tag no">${esc(r.geocode_status)}</span>`}</td><td>${esc(V.shortRole(r.role))}</td><td>${esc(r.email || "")}${r.phone ? "<br>" + esc(r.phone) : ""}</td>
  <td>${r.confirmed_at ? '<span class="tag ok">confirmed</span>' : (r.email ? '<span class="tag">unconfirmed</span>' : "")} ${r.public_listing ? '<span class="tag">public</span>' : ""} ${r.join_coalition ? '<span class="tag">join</span>' : ""} ${r.notified ? "" : '<span class="tag no">email not sent</span>'}</td>
  <td><form class="inline" method="post" action="/admin/signatures/${r.id}/verify"><input type="hidden" name="v" value="${r.verified ? 0 : 1}"><button type="submit" class="btn" style="padding:2px 8px;font-size:12px">${r.verified ? "✓ verified" : "mark verified"}</button></form></td>
  <td class="noprint"><form class="inline" method="post" action="/admin/signatures/${r.id}/delete" onsubmit="return confirm('Delete signature #${r.id}?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=11>No signatures match.</td></tr>"}</table>`, { current: "/admin/signatures" }));
});
router.post("/signatures/:id/verify", (req, res) => { db.prepare("UPDATE signatures SET verified = ? WHERE id = ?").run(Number(req.body.v) ? 1 : 0, Number(req.params.id)); res.redirect(req.get("referer") || "/admin/signatures"); });
router.post("/signatures/:id/delete", (req, res) => { db.prepare("DELETE FROM signatures WHERE id = ?").run(Number(req.params.id)); res.redirect("/admin/signatures"); });

// ---- members ----
router.get("/members", (req, res) => {
  const rows = db.prepare("SELECT * FROM members ORDER BY id DESC").all();
  res.send(page("Admin · coalition members", `<h1>Coalition members (${rows.length})</h1><p class="noprint"><a class="btn" href="/admin/export/members.csv">Download CSV</a></p>
  <div class="msg warn">Reply only from a personal, non-work channel. Never reference a member's workplace in writing. Keep this list off any shared drive.</div>
  <table><tr><th>#</th><th>Joined (UTC)</th><th>Name</th><th>Contact</th><th>County</th><th>Role</th><th>Employer type</th><th>Will help by</th><th>Testify</th><th>County contact</th><th>Reach by</th><th>Message</th><th class="noprint"></th></tr>
  ${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.email || "")}${r.phone ? "<br>" + esc(r.phone) : ""}</td><td>${esc(r.county)}</td><td>${esc(V.shortRole(r.role))}</td><td>${esc(r.employer_type || "")}</td><td>${esc(r.help || "")}</td><td>${r.testify ? "yes" : ""}</td><td>${r.county_contact ? "yes" : ""}</td><td>${esc(r.contact_pref || "")}</td><td>${esc(r.message || "")}</td>
  <td class="noprint"><form class="inline" method="post" action="/admin/members/${r.id}/delete" onsubmit="return confirm('Delete member #${r.id}?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=13>No members yet.</td></tr>"}</table>`, { current: "/admin/members" }));
});
router.post("/members/:id/delete", (req, res) => { db.prepare("DELETE FROM members WHERE id = ?").run(Number(req.params.id)); res.redirect("/admin/members"); });

// ---- legislators ----
router.get("/legislators", (req, res) => {
  const rows = db.prepare("SELECT l.*, (SELECT COUNT(*) FROM signatures s WHERE (l.chamber='House' AND s.house_district=l.district) OR (l.chamber='Senate' AND s.senate_district=l.district)) AS sigs, (SELECT COUNT(*) FROM contact_log c WHERE c.legislator_id=l.id) AS contacts FROM legislators l ORDER BY chamber, district").all();
  const edit = req.query.edit ? db.prepare("SELECT * FROM legislators WHERE id = ?").get(Number(req.query.edit)) : null;
  const msg = req.query.msg ? `<div class="msg">${esc(req.query.msg)}</div>` : "";
  const f = edit || { chamber: "House", district: "", name: "", party: "", email: "", phone: "", office: "", committees: "", stance: "", notes: "" };
  res.send(page("Admin · legislators", `<h1>Legislator directory (${rows.length} of 150)</h1>${msg}
  <p class="muted">Membership changes after the November 2026 election. Export the current roster from <a href="https://iga.in.gov/legislative/2026/legislators" rel="noopener">iga.in.gov</a> and paste it below as CSV, or add members one at a time. Stance is your own tracking: unknown, supportive, undecided, opposed, sponsor.</p>
  <form method="post" action="/admin/legislators/${edit ? edit.id : "new"}" class="f"><label>Chamber<select name="chamber">${opt(["House", "Senate"], f.chamber)}</select></label><label>District<input name="district" type="number" min="1" max="100" value="${esc(f.district)}" required></label><label>Name<input name="name" value="${esc(f.name)}" required></label><label>Party<input name="party" value="${esc(f.party)}"></label><label>Email<input name="email" value="${esc(f.email)}"></label><label>Phone<input name="phone" value="${esc(f.phone)}"></label><label>Office / staff<input name="office" value="${esc(f.office)}"></label><label>Committees<input name="committees" value="${esc(f.committees)}"></label><label>Stance<select name="stance">${opt(["", "unknown", "supportive", "undecided", "opposed", "sponsor", "co-author"], f.stance)}</select></label><label class="full">Notes<textarea name="notes" rows="2">${esc(f.notes)}</textarea></label><div class="full"><button class="btn primary" type="submit">${edit ? "Save changes" : "Add legislator"}</button>${edit ? ' <a class="btn" href="/admin/legislators">Cancel</a>' : ""}</div></form>
  <details><summary>Import or update many at once (CSV)</summary><form method="post" action="/admin/legislators/import" class="f"><label class="full">Columns: chamber,district,name,party,email,phone,office,committees. Header row optional. Existing districts are updated.<textarea name="csv" rows="8" placeholder="House,1,Jane Doe,R,h1@iga.in.gov,317-232-9600,,Public Health"></textarea></label><div class="full"><button class="btn primary" type="submit">Import</button> <a class="btn" href="/admin/export/legislators.csv">Export current CSV</a></div></form></details>
  <table><tr><th>Chamber</th><th>Dist.</th><th>Name</th><th>Party</th><th>Contact</th><th>Committees</th><th>Stance</th><th>Signers</th><th>Contacts logged</th><th class="noprint"></th></tr>
  ${rows.map((r) => `<tr><td>${r.chamber}</td><td>${r.district}</td><td>${esc(r.name)}</td><td>${esc(r.party || "")}</td><td>${esc(r.email || "")}${r.phone ? "<br>" + esc(r.phone) : ""}</td><td>${esc(r.committees || "")}</td><td>${esc(r.stance || "")}</td><td>${r.sigs}</td><td>${r.contacts}</td><td class="noprint"><a href="/admin/legislators?edit=${r.id}">edit</a> · <a href="/admin/legislators/${r.id}/log">log</a> · <a href="/admin/packet?chamber=${r.chamber}&district=${r.district}">packet</a> · <form class="inline" method="post" action="/admin/legislators/${r.id}/delete" onsubmit="return confirm('Remove ${esc(r.name)}?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=10>No legislators entered yet.</td></tr>"}</table>`, { current: "/admin/legislators" }));
});
router.post("/legislators/import", (req, res) => {
  const text = String(req.body.csv || "");
  let n = 0, bad = 0;
  const parseLine = (line) => { const out = []; let cur = "", inq = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (inq) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inq = false; else cur += c; } else if (c === '"') inq = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map((x) => x.trim()); };
  const up = db.prepare(`INSERT INTO legislators (chamber, district, name, party, email, phone, office, committees) VALUES (@chamber, @district, @name, @party, @email, @phone, @office, @committees)
    ON CONFLICT(chamber, district) DO UPDATE SET name=excluded.name, party=excluded.party, email=excluded.email, phone=excluded.phone, office=excluded.office, committees=excluded.committees, updated_at=datetime('now')`);
  db.transaction(() => {
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || /^chamber/i.test(line)) return;
      const [chamber, district, name, party = "", email = "", phone = "", office = "", committees = ""] = parseLine(line);
      const r = V.validateLegislator({ chamber: /^s/i.test(chamber) ? "Senate" : /^h/i.test(chamber) ? "House" : chamber, district, name, party, email, phone, office, committees });
      if (!r.ok) { bad++; return; }
      up.run(r.values); n++;
    });
  })();
  res.redirect("/admin/legislators?msg=" + encodeURIComponent(`Imported ${n} legislators${bad ? `, skipped ${bad} bad lines` : ""}.`));
});
router.post("/legislators/:id", (req, res) => {
  const r = V.validateLegislator(req.body);
  if (!r.ok) return res.redirect("/admin/legislators?msg=" + encodeURIComponent(r.error));
  try {
    if (req.params.id === "new") db.prepare("INSERT INTO legislators (chamber, district, name, party, email, phone, office, committees, stance, notes) VALUES (@chamber, @district, @name, @party, @email, @phone, @office, @committees, @stance, @notes)").run(r.values);
    else db.prepare("UPDATE legislators SET chamber=@chamber, district=@district, name=@name, party=@party, email=@email, phone=@phone, office=@office, committees=@committees, stance=@stance, notes=@notes, updated_at=datetime('now') WHERE id=@id").run({ ...r.values, id: Number(req.params.id) });
  } catch (e) { return res.redirect("/admin/legislators?msg=" + encodeURIComponent(String(e.message).includes("UNIQUE") ? "That chamber and district already has an entry; edit it instead." : e.message)); }
  res.redirect("/admin/legislators?msg=" + encodeURIComponent("Saved " + r.values.name + "."));
});
router.post("/legislators/:id/delete", (req, res) => { db.prepare("DELETE FROM legislators WHERE id = ?").run(Number(req.params.id)); res.redirect("/admin/legislators"); });
router.get("/legislators/:id/log", (req, res) => {
  const l = db.prepare("SELECT * FROM legislators WHERE id = ?").get(Number(req.params.id));
  if (!l) return res.status(404).send("Not found");
  const rows = db.prepare("SELECT * FROM contact_log WHERE legislator_id = ? ORDER BY id DESC").all(l.id);
  res.send(page("Admin · contact log", `<h1>${legName(l)}, ${l.chamber} District ${l.district}</h1><p class="muted">${esc(l.email || "")} ${esc(l.phone || "")} ${esc(l.office || "")} · stance: ${esc(l.stance || "unknown")}</p>
  <form method="post" action="/admin/legislators/${l.id}/log" class="f"><label>Date<input name="created_at" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Who made contact<input name="who" placeholder="constituent name, never a current employee's"></label><label>Method<select name="method">${opt(["visit", "phone", "email", "letter", "event", "hearing"], "")}</select></label><label>Follow up on<input name="follow_up_on" type="date"></label><label class="full">What they said<textarea name="summary" rows="3" required></textarea></label><div class="full"><button class="btn primary" type="submit">Log it</button> <a class="btn" href="/admin/legislators">Back</a></div></form>
  <table><tr><th>Date</th><th>Who</th><th>Method</th><th>Summary</th><th>Follow up</th></tr>${rows.map((r) => `<tr><td>${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.who || "")}</td><td>${esc(r.method || "")}</td><td>${esc(r.summary)}</td><td>${esc(r.follow_up_on || "")}</td></tr>`).join("") || "<tr><td colspan=5>No contacts logged.</td></tr>"}</table>`, { current: "/admin/legislators" }));
});
router.post("/legislators/:id/log", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("INSERT INTO contact_log (created_at, legislator_id, who, method, summary, follow_up_on) VALUES (?, ?, ?, ?, ?, ?)").run((V.s(req.body.created_at, 10) || new Date().toISOString().slice(0, 10)) + " 00:00:00", id, V.s(req.body.who, 80), V.s(req.body.method, 20), V.s(req.body.summary, 2000), V.s(req.body.follow_up_on, 10) || null);
  res.redirect(`/admin/legislators/${id}/log`);
});

// ---- paper sheets ----
router.get("/paper", (req, res) => {
  const rows = db.prepare("SELECT * FROM paper_counts ORDER BY id DESC").all();
  res.send(page("Admin · paper sheets", `<h1>Paper signature sheets</h1><p class="muted">Log each batch of paper sheets as it comes in. These counts are added to the public tally and the county totals. Keep the originals in one folder, sorted by county, and never photograph them at a workplace.</p>
  <form method="post" action="/admin/paper" class="f"><label>County<select name="county" required><option value="">Select</option>${opt(V.COUNTIES, "")}</select></label><label>Sheets<input name="sheets" type="number" min="0" value="1"></label><label>Signatures<input name="signatures" type="number" min="0" required></label><label>Collected on<input name="collected_on" type="date"></label><label>Circulator<input name="circulator"></label><label class="full">Note<input name="note" placeholder="where collected, anything to verify"></label><div class="full"><button class="btn primary" type="submit">Add batch</button></div></form>
  <table><tr><th>#</th><th>Logged</th><th>County</th><th>Sheets</th><th>Signatures</th><th>Collected</th><th>Circulator</th><th>Note</th><th class="noprint"></th></tr>${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.county)}</td><td>${r.sheets}</td><td>${r.signatures}</td><td>${esc(r.collected_on || "")}</td><td>${esc(r.circulator || "")}</td><td>${esc(r.note || "")}</td><td class="noprint"><form class="inline" method="post" action="/admin/paper/${r.id}/delete" onsubmit="return confirm('Delete this batch?')"><button class="x" type="submit">delete</button></form></td></tr>`).join("") || "<tr><td colspan=9>No paper batches logged.</td></tr>"}</table>`, { current: "/admin/paper" }));
});
router.post("/paper", (req, res) => {
  const county = V.s(req.body.county, 40); const sigs = parseInt(req.body.signatures, 10);
  if (!V.COUNTIES.includes(county) || !(sigs >= 0)) return res.redirect("/admin/paper");
  db.prepare("INSERT INTO paper_counts (county, sheets, signatures, collected_on, circulator, note) VALUES (?, ?, ?, ?, ?, ?)").run(county, parseInt(req.body.sheets, 10) || 0, sigs, V.s(req.body.collected_on, 10) || null, V.s(req.body.circulator, 80), V.s(req.body.note, 300));
  res.redirect("/admin/paper");
});
router.post("/paper/:id/delete", (req, res) => { db.prepare("DELETE FROM paper_counts WHERE id = ?").run(Number(req.params.id)); res.redirect("/admin/paper"); });

// ---- delivery packet ----
router.get("/packet", (req, res) => {
  const county = V.s(req.query.county, 40), chamber = V.s(req.query.chamber, 10), district = parseInt(req.query.district, 10);
  let rows, legislator = null, group = "county", label = "All signatures";
  if (chamber && district) {
    const col = chamber === "Senate" ? "senate_district" : "house_district";
    rows = db.prepare(`SELECT * FROM signatures WHERE ${col} = ? ORDER BY county, id`).all(district);
    legislator = db.prepare("SELECT * FROM legislators WHERE chamber = ? AND district = ?").get(chamber, district) || null;
    label = `${chamber} District ${district}`; group = chamber === "Senate" ? "senate" : "house";
  } else if (county) { rows = db.prepare("SELECT * FROM signatures WHERE county = ? ORDER BY id").all(county); label = county + " County"; }
  else { rows = db.prepare("SELECT * FROM signatures ORDER BY county, id").all(); group = V.s(req.query.group, 10) || "county"; }
  const paper = county ? db.prepare("SELECT COALESCE(SUM(signatures),0) AS n, COALESCE(SUM(sheets),0) AS s FROM paper_counts WHERE county = ?").get(county) : null;
  const body = `<div class="filters noprint">Packet for: <b>${esc(label)}</b>${legislator ? ` · cover letter addressed to ${legName(legislator)}` : chamber && district ? ' · <span class="muted">add this legislator to the directory to include an addressed cover letter</span>' : ""}
    &nbsp; <select onchange="location=this.value"><option value="/admin/packet">All signatures, by county</option><option value="/admin/packet?group=house" ${group === "house" ? "selected" : ""}>All signatures, by House district</option><option value="/admin/packet?group=senate" ${group === "senate" ? "selected" : ""}>All signatures, by Senate district</option>${V.COUNTIES.map((c) => `<option value="/admin/packet?county=${encodeURIComponent(c)}" ${c === county ? "selected" : ""}>${esc(c)} County</option>`).join("")}</select>
    <a class="btn" href="#" onclick="print();return false">Print / save as PDF</a></div>
    ${packetHtml({ rows, group, legislator, coalition: getSetting("coalition_name"), contact: getSetting("public_contact"), paperNote: paper && paper.n ? `${paper.n} on ${paper.s} paper sheets from ${county} County` : "" })}`;
  res.send(page("Admin · delivery packet", body, { current: "/admin/packet" }));
});

// ---- settings ----
router.get("/settings", (req, res) => {
  const st = allSettings();
  res.send(page("Admin · settings", `<h1>Settings</h1>${req.query.msg ? `<div class="msg">${esc(req.query.msg)}</div>` : ""}
  <form method="post" action="/admin/settings" class="f"><label>Signature goal<input name="goal" type="number" min="1" value="${esc(st.goal)}"></label><label>Coalition name (on packets)<input name="coalition_name" value="${esc(st.coalition_name)}"></label><label>Public contact line (on cover letters)<input name="public_contact" value="${esc(st.public_contact)}" placeholder="mailing address · personal email · phone"></label><label>Organization Day<input name="organization_day" type="date" value="${esc(st.organization_day)}"></label><label>Adjournment deadline<input name="adjournment" type="date" value="${esc(st.adjournment)}"></label><label class="full">Banner at the top of the public page (leave blank for none)<input name="banner" value="${esc(st.banner)}" placeholder="e.g. Hearing on HB ____ Tuesday 1:30 pm, Room 156. Come."></label><div class="full"><button class="btn primary" type="submit">Save</button></div></form>
  <h2>Environment (read-only)</h2><table><tr><th>Setting</th><th>Value</th></tr><tr><td>Organizer email</td><td>${esc(mail.ORGANIZER_EMAIL)}</td></tr><tr><td>Mail transport</td><td>${esc(mail.transportKind)}</td></tr><tr><td>Public URL</td><td>${esc(mail.PUBLIC_URL)}</td></tr><tr><td>Database</td><td>${esc(DB_FILE)}</td></tr><tr><td>District lookup</td><td>${String(process.env.GEOCODE || "on") === "off" ? "off" : "on (U.S. Census geocoder)"}</td></tr></table>`, { current: "/admin/settings" }));
});
router.post("/settings", (req, res) => {
  ["goal", "coalition_name", "public_contact", "organization_day", "adjournment", "banner"].forEach((k) => setSetting(k, V.s(req.body[k], 300)));
  res.redirect("/admin/settings?msg=Saved.");
});

// ---- exports and backup ----
router.get("/export/signatures.csv", (req, res) => sendCsv(res, "signatures", csv(db.prepare("SELECT * FROM signatures ORDER BY county, id").all(), ["id", "created_at", "name", "street", "city", "zip", "county", "house_district", "senate_district", "role", "email", "phone", "public_listing", "join_coalition", "confirmed_at", "verified", "notified", "geocode_status"])));
router.get("/export/members.csv", (req, res) => sendCsv(res, "members", csv(db.prepare("SELECT * FROM members ORDER BY id").all(), ["id", "created_at", "name", "email", "phone", "county", "role", "employer_type", "help", "testify", "county_contact", "contact_pref", "message"])));
router.get("/export/legislators.csv", (req, res) => sendCsv(res, "legislators", csv(db.prepare("SELECT * FROM legislators ORDER BY chamber, district").all(), ["chamber", "district", "name", "party", "email", "phone", "office", "committees", "stance", "notes"])));
router.get("/backup.db", async (req, res) => {
  const tmp = path.join(os.tmpdir(), `petition-backup-${Date.now()}.db`);
  try { await backupTo(tmp); res.setHeader("Content-Disposition", `attachment; filename="petition-${new Date().toISOString().slice(0, 10)}.db"`); res.sendFile(tmp, () => fs.unlink(tmp, () => {})); }
  catch (e) { res.status(500).send("Backup failed: " + esc(e.message)); }
});

module.exports = router;
