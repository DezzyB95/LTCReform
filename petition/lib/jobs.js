// Background maintenance: resend organizer notifications that failed, and
// finish district lookups that timed out at signing. Runs every few minutes
// in the server process; runOnce() is also called from the admin page.
const { db, counts } = require("./db");
const mail = require("./mailer");
const { lookupDistricts } = require("./geocode");

const legislatorsFor = (row) => ({
  house: row.house_district ? db.prepare("SELECT * FROM legislators WHERE chamber='House' AND district=?").get(row.house_district) : null,
  senate: row.senate_district ? db.prepare("SELECT * FROM legislators WHERE chamber='Senate' AND district=?").get(row.senate_district) : null,
});

async function geocodeRow(row, opts = {}) {
  const r = await lookupDistricts(row, opts);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (r.status === "done") db.prepare("UPDATE signatures SET house_district=?, senate_district=?, geocode_status='done', geocoded_at=?, geocode_attempts=geocode_attempts+1 WHERE id=?").run(r.house, r.senate, now, row.id);
  else if (r.status === "nomatch") db.prepare("UPDATE signatures SET geocode_status='nomatch', geocoded_at=?, geocode_attempts=geocode_attempts+1 WHERE id=?").run(now, row.id);
  else db.prepare("UPDATE signatures SET geocode_status=CASE WHEN geocode_attempts>=5 THEN 'error' ELSE 'pending' END, geocode_attempts=geocode_attempts+1 WHERE id=?").run(row.id);
  return r;
}

async function runOnce({ geocodeOpts } = {}) {
  const out = { notified: 0, geocoded: 0, nomatch: 0, errors: 0 };
  // 1. Unsent organizer notifications (mail server was down, etc.)
  const total = counts.online();
  for (const row of db.prepare("SELECT * FROM signatures WHERE notified=0 ORDER BY id LIMIT 20").all()) {
    try { await mail.notifySignature(row, total, legislatorsFor(row)); db.prepare("UPDATE signatures SET notified=1 WHERE id=?").run(row.id); out.notified++; }
    catch (e) { out.errors++; console.error("[jobs] notify signature", row.id, e.message); }
  }
  const mtotal = counts.members();
  for (const row of db.prepare("SELECT * FROM members WHERE notified=0 ORDER BY id LIMIT 20").all()) {
    try { await mail.notifyMember(row, mtotal); db.prepare("UPDATE members SET notified=1 WHERE id=?").run(row.id); out.notified++; }
    catch (e) { out.errors++; console.error("[jobs] notify member", row.id, e.message); }
  }
  // 2. District lookups still pending
  for (const row of db.prepare("SELECT * FROM signatures WHERE geocode_status='pending' ORDER BY id LIMIT 15").all()) {
    const r = await geocodeRow(row, geocodeOpts);
    if (r.status === "done") out.geocoded++; else if (r.status === "nomatch") out.nomatch++; else out.errors++;
    await new Promise((res) => setTimeout(res, 400)); // be polite to a free public service
  }
  return out;
}

let timer = null;
function start(intervalMs = 5 * 60 * 1000) {
  if (timer) return;
  const tick = () => runOnce().then((o) => { if (o.notified || o.geocoded || o.nomatch || o.errors) console.log("[jobs]", JSON.stringify(o)); }).catch((e) => console.error("[jobs]", e.message));
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 15 * 1000);
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { runOnce, start, stop, geocodeRow, legislatorsFor };
