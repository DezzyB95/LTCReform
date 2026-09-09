// End-to-end smoke test: starts the server on a temp database with the log
// mail transport, signs the petition, joins the coalition, checks stats,
// duplicates, validation, admin auth, CSV export, and the delivery packet.
process.env.MAIL_TRANSPORT = "log";
process.env.DATA_DIR = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "cfp-"));
process.env.ADMIN_USER = "organizer";
process.env.ADMIN_PASSWORD = "test-password";
process.env.PORT = "0";

const app = require("../server");
const assert = require("assert");

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, opts = {}) => {
    const r = await fetch(base + path, opts);
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text() };
  };
  const post = (path, data, headers = {}) => j(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
  const auth = { authorization: "Basic " + Buffer.from("organizer:test-password").toString("base64") };
  let failed = 0;
  const t = (name, cond, extra) => { if (cond) console.log("  ok  " + name); else { failed++; console.log("  FAIL " + name, extra || ""); } };

  const sig = { name: "Test Signer", street: "123 Main St", city: "Fort Wayne", zip: "46802", county: "Allen", role: "A current CNA / QMA in Indiana long-term care", email: "signer@example.com", attest: true, public_listing: true, join_coalition: false };
  let r = await post("/api/sign", sig);
  t("sign: accepted", r.status === 200 && r.body.ok && r.body.total === 1, r.body);
  r = await post("/api/sign", sig);
  t("sign: duplicate rejected", r.status === 409, r.body);
  r = await post("/api/sign", { ...sig, name: "Bad Zip", zip: "abc" });
  t("sign: validation error names the field", r.status === 400 && /ZIP/.test(r.body.error), r.body);
  r = await post("/api/sign", { ...sig, name: "Spam Bot", website: "http://spam" });
  t("sign: honeypot swallowed", r.status === 200 && r.body.id === 0, r.body);
  r = await post("/api/sign", { ...sig, name: "Second Person", zip: "46804", county: "Marion", public_listing: false });
  t("sign: second signature", r.body.total === 2, r.body);

  r = await j("/api/stats");
  t("stats: totals and county breakdown", r.body.total === 2 && r.body.byCounty.length === 2 && r.body.goal > 0, r.body);
  r = await j("/api/wall");
  t("wall: only opted-in, abbreviated name", r.body.rows.length === 1 && r.body.rows[0].name === "Test S." && !JSON.stringify(r.body).includes("Main St"), r.body);

  const mem = { name: "Coalition Member", email: "member@example.com", phone: "317-555-0100", county: "Marion", role: "A former long-term care worker", help: ["Contact my legislators", "Testify or submit written testimony"], testify: true, consent: true, contact_pref: "text" };
  r = await post("/api/join", mem);
  t("join: accepted", r.status === 200 && r.body.ok && r.body.total === 1, r.body);
  r = await post("/api/join", mem);
  t("join: duplicate rejected", r.status === 409, r.body);
  r = await post("/api/join", { ...mem, email: "", phone: "" });
  t("join: requires a contact method", r.status === 400 && /email or a phone/.test(r.body.error), r.body);

  r = await j("/admin");
  t("admin: requires auth", r.status === 401);
  r = await j("/admin", { headers: auth });
  t("admin: overview renders counts", r.status === 200 && /Signatures<b>2<\/b>/.test(r.body) && /Coalition members<b>1<\/b>/.test(r.body));
  r = await j("/admin/export/signatures.csv", { headers: auth });
  t("admin: CSV export has both rows", r.status === 200 && r.body.split("\n").filter(Boolean).length === 3 && r.body.includes("Second Person"));
  r = await j("/admin/packet", { headers: auth });
  t("admin: delivery packet lists signers by county", r.status === 200 && /Allen County \(1\)/.test(r.body) && /Marion County \(1\)/.test(r.body) && /EXHIBIT B/.test(r.body));
  r = await j("/admin/packet?county=Allen", { headers: auth });
  t("admin: packet county filter", /Allen County \(1\)/.test(r.body) && !/Marion County/.test(r.body.replace(/<option[^>]*>Marion<\/option>/, "")));
  r = await j("/");
  t("public: site serves", r.status === 200 && /The Care Floor Petition/.test(r.body));
  r = await j("/api/health");
  t("health", r.body.ok && r.body.mail === "log");

  server.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
});
