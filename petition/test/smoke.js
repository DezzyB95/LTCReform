// End-to-end API test on a throwaway database with the console mail transport.
// Covers signing, confirmation, removal, duplicates, validation, honeypot,
// coalition join, stats, wall, admin auth, legislators, paper sheets, settings,
// packet, CSV export, and backup. Run: npm test
process.env.MAIL_TRANSPORT = "log";
process.env.GEOCODE = "off";
process.env.DATA_DIR = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "cfp-"));
process.env.ADMIN_USER = "organizer";
process.env.ADMIN_PASSWORD = "test-password";
process.env.PUBLIC_URL = "http://test.local";

const app = require("../server");
const mail = require("../lib/mailer");
const { db } = require("../lib/db");
const { parseCensusResponse, lookupDistricts } = require("../lib/geocode");
const jobs = require("../lib/jobs");

let failed = 0;
const t = (name, cond, extra) => { if (cond) console.log("  ok  " + name); else { failed++; console.log("  FAIL " + name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); } };

// ---- unit: geocoder parsing ----
const sample = { result: { addressMatches: [{ matchedAddress: "200 W WASHINGTON ST, INDIANAPOLIS, IN, 46204", coordinates: { x: -86.16, y: 39.77 }, geographies: { "State Legislative Districts - Upper": [{ SLDU: "030", NAME: "State Senate District 30" }], "State Legislative Districts - Lower": [{ SLDL: "096", NAME: "State House District 96" }] } }] } };
const parsed = parseCensusResponse(sample);
t("geocode: parses Census response into integer districts", parsed.status === "done" && parsed.house === 96 && parsed.senate === 30, parsed);
t("geocode: no match handled", parseCensusResponse({ result: { addressMatches: [] } }).status === "nomatch");

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, opts = {}) => { const r = await fetch(base + path, { redirect: "manual", ...opts }); const ct = r.headers.get("content-type") || ""; return { status: r.status, headers: r.headers, body: ct.includes("json") ? await r.json() : await r.text() }; };
  const post = (path, data, headers = {}) => j(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
  const auth = { authorization: "Basic " + Buffer.from("organizer:test-password").toString("base64"), origin: base };
  const form = (path, data) => j(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...auth }, body: new URLSearchParams(data).toString() });

  // geocoder with a mocked fetch (the real service is exercised in production)
  const mocked = await lookupDistricts({ street: "200 W Washington St", city: "Indianapolis", zip: "46204" }, { fetchImpl: async () => ({ ok: true, json: async () => sample }) });
  t("geocode: lookup through mocked fetch", mocked.status === "done" && mocked.house === 96, mocked);
  const timedOut = await lookupDistricts({ street: "x", city: "y", zip: "46204" }, { timeoutMs: 20, fetchImpl: (url, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  t("geocode: timeout reported as error", timedOut.status === "error" && /timeout/.test(timedOut.error), timedOut);

  // ---- signing ----
  const sig = { name: "Test Signer", street: "123 Main St", city: "Fort Wayne", zip: "46802", county: "Allen", role: "A current CNA / QMA in Indiana long-term care", email: "signer@example.com", attest: true, public_listing: true, join_coalition: true };
  const before = mail.sent.length;
  let r = await post("/api/sign", sig);
  t("sign: accepted", r.status === 200 && r.body.ok && r.body.total === 1 && r.body.confirmationSent === true, r.body);
  await new Promise((res) => setTimeout(res, 50));
  const organizerMail = mail.sent.slice(before).find((m) => m.to.includes("dezzerea70@gmail.com"));
  t("sign: organizer email sent automatically to dezzerea70@gmail.com", !!organizerMail && /Petition signature #1/.test(organizerMail.subject), mail.sent.slice(before));
  t("sign: receipt with confirm link sent to signer", mail.sent.slice(before).some((m) => m.to === "signer@example.com" && /confirm/i.test(m.subject)));
  t("sign: join box also created a coalition member", db.prepare("SELECT COUNT(*) AS n FROM members WHERE email='signer@example.com'").get().n === 1);
  r = await post("/api/sign", sig);
  t("sign: duplicate rejected", r.status === 409, r.body);
  r = await post("/api/sign", { ...sig, name: "Bad Zip", zip: "abc" });
  t("sign: validation error names the field", r.status === 400 && /ZIP/.test(r.body.error), r.body);
  r = await post("/api/sign", { ...sig, name: "Spam Bot", website: "http://spam" });
  t("sign: honeypot swallowed", r.status === 200 && r.body.id === 0, r.body);
  r = await post("/api/sign", { ...sig, name: "Second Person", zip: "46804", county: "Marion", email: "", public_listing: false, join_coalition: false });
  t("sign: second signature without email", r.body.total === 2 && r.body.confirmationSent === false, r.body);
  r = await j("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad json" });
  t("sign: malformed JSON handled", r.status === 400 && r.body.ok === false, r.body);

  // ---- confirm / remove ----
  const row = db.prepare("SELECT * FROM signatures WHERE email='signer@example.com'").get();
  r = await j("/confirm/" + row.confirm_token);
  t("confirm: link marks signature confirmed", r.status === 200 && /Confirmed/.test(r.body) && db.prepare("SELECT confirmed_at FROM signatures WHERE id=?").get(row.id).confirmed_at);
  r = await j("/confirm/c_nope");
  t("confirm: bad token 404", r.status === 404);
  r = await j("/remove/" + row.remove_token);
  t("remove: shows confirmation page", r.status === 200 && /Remove your signature/.test(r.body));

  // ---- stats / wall ----
  r = await j("/api/stats");
  t("stats: totals, confirmed, county breakdown", r.body.total === 2 && r.body.confirmed === 1 && r.body.byCounty.length === 2 && r.body.goal === 1000, r.body);
  r = await j("/api/wall");
  t("wall: only opted-in, abbreviated name, no address", r.body.rows.length === 1 && r.body.rows[0].name === "Test S." && !JSON.stringify(r.body).includes("Main St"), r.body);

  // ---- join ----
  const mem = { name: "Coalition Member", email: "member@example.com", phone: "317-555-0100", county: "Marion", role: "A former long-term care worker", help: ["Contact my legislators", "Testify or submit written testimony"], testify: true, consent: true, contact_pref: "text" };
  r = await post("/api/join", mem);
  t("join: accepted", r.status === 200 && r.body.ok && r.body.total === 2, r.body);
  r = await post("/api/join", mem);
  t("join: duplicate rejected", r.status === 409, r.body);
  r = await post("/api/join", { ...mem, email: "", phone: "" });
  t("join: requires a contact method", r.status === 400 && /email or a phone/.test(r.body.error), r.body);
  await new Promise((res) => setTimeout(res, 50));
  t("join: organizer and welcome emails sent", mail.sent.some((m) => /Coalition member #2/.test(m.subject)) && mail.sent.some((m) => m.to === "member@example.com"));

  // ---- admin ----
  r = await j("/admin");
  t("admin: requires auth", r.status === 401);
  r = await j("/admin", { headers: auth });
  t("admin: overview renders counts", r.status === 200 && /Signatures<b>2<\/b>/.test(r.body) && /Confirmed by email<b>1<\/b>/.test(r.body), r.body.slice(0, 200));
  r = await form("/admin/legislators/new", { chamber: "House", district: "80", name: "Test Rep", party: "R", email: "h80@iga.in.gov" });
  t("admin: add legislator", r.status === 302 && db.prepare("SELECT COUNT(*) AS n FROM legislators").get().n === 1);
  r = await form("/admin/legislators/import", { csv: "chamber,district,name,party\nSenate,15,Test Sen,D\nHouse,80,Test Rep Updated,R\nbogus,999,x" });
  t("admin: CSV import upserts and skips bad lines", /Imported 2/.test(decodeURIComponent(r.headers.get("location"))) && db.prepare("SELECT name FROM legislators WHERE chamber='House' AND district=80").get().name === "Test Rep Updated", r.headers.get("location"));
  db.prepare("UPDATE signatures SET house_district=80, senate_district=15, geocode_status='done' WHERE id=?").run(row.id);
  r = await j("/admin/packet?chamber=House&district=80", { headers: auth });
  t("admin: district packet has addressed cover letter and Exhibit B", r.status === 200 && /Dear Representative Updated/.test(r.body) && /House District 80 \(1\)/.test(r.body) && /EXHIBIT B/.test(r.body));
  r = await form("/admin/paper", { county: "Allen", sheets: "2", signatures: "17", collected_on: "2026-10-01", circulator: "Vol" });
  r = await j("/api/stats");
  t("paper: counts added to public tally", r.body.total === 19 && r.body.paper === 17 && r.body.byCounty.find((c) => c.county === "Allen").n === 18, r.body);
  r = await form("/admin/settings", { goal: "2500", banner: "Hearing Tuesday", coalition_name: "The Care Floor Coalition", public_contact: "PO Box 1", organization_day: "2026-11-17", adjournment: "2027-04-29" });
  r = await j("/api/stats");
  t("settings: goal and banner reach the public API", r.body.goal === 2500 && r.body.banner === "Hearing Tuesday", r.body);
  r = await j("/admin/signatures?status=confirmed", { headers: auth });
  t("admin: signature filter", /Test Signer/.test(r.body) && !/Second Person/.test(r.body));
  r = await j("/admin/export/signatures.csv", { headers: auth });
  t("admin: CSV export has both rows and districts", r.status === 200 && r.body.split("\n").filter(Boolean).length === 3 && /,80,15,/.test(r.body));
  r = await j("/admin/backup.db", { headers: auth });
  t("admin: database backup downloads", r.status === 200 && r.body.length > 1000 && r.body.startsWith("SQLite format 3"));
  r = await j("/admin/settings", { method: "POST", headers: { ...auth, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "goal=1" });
  t("admin: cross-site POST blocked", r.status === 403);
  const jobOut = await jobs.runOnce({ geocodeOpts: { fetchImpl: async () => ({ ok: true, json: async () => sample }) } });
  t("jobs: pending district lookups completed via mocked geocoder", jobOut.geocoded >= 1 && db.prepare("SELECT house_district FROM signatures WHERE name='Second Person'").get().house_district === 96, jobOut);

  // ---- public pages ----
  r = await j("/");
  t("public: site serves", r.status === 200 && /The Care Floor Petition/.test(r.body));
  r = await j("/privacy");
  t("public: privacy page serves", r.status === 200 && /What we collect/.test(r.body));
  r = await j("/api/health");
  t("health", r.body.ok && r.body.mail === "log");
  r = await j("/remove/" + row.remove_token, { method: "POST" });
  t("remove: deletes the signature", r.status === 200 && /Removed\./.test(r.body) && !db.prepare("SELECT 1 FROM signatures WHERE id=?").get(row.id));

  server.close();
  console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${failed === 0 ? "checks" : ""} passed`);
  process.exit(failed ? 1 : 0);
});
