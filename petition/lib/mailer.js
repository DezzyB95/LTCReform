// Outbound email. Transport chosen by MAIL_TRANSPORT:
//   gmail (default when GMAIL_USER + GMAIL_APP_PASSWORD are set)
//   smtp  (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM)
//   log   (prints to the console; local testing)
const nodemailer = require("nodemailer");

// Every signature and sign-up is sent here. This is the coalition's address and is
// not configurable by environment; NOTIFY_ALSO may add extra recipients (comma-separated).
const COALITION_EMAIL = "dezzerea70@gmail.com";
const ORGANIZER_EMAIL = [COALITION_EMAIL].concat(String(process.env.NOTIFY_ALSO || "").split(",").map((x) => x.trim()).filter(Boolean)).join(", ");
const FROM_NAME = process.env.FROM_NAME || "The Care Floor Coalition";
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");

function pickTransport() {
  const mode = (process.env.MAIL_TRANSPORT || "").toLowerCase();
  if (mode === "log") return { kind: "log" };
  if (mode === "smtp" || (!mode && process.env.SMTP_HOST)) {
    return {
      kind: "smtp",
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      }),
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    };
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      kind: "gmail",
      transporter: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } }),
      from: process.env.GMAIL_USER,
    };
  }
  return { kind: "log", warn: true };
}

const t = pickTransport();
if (t.warn) {
  const msg = "[mail] No mail credentials set. Every signature must reach " + COALITION_EMAIL + "; set GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP_*) in .env.";
  if (process.env.NODE_ENV === "production" && process.env.MAIL_TRANSPORT !== "log") { console.error(msg + " Refusing to start."); process.exit(1); }
  console.warn(msg + " Messages will be printed to the console only (development mode).");
} else console.log(`[mail] transport: ${t.kind}; every signature and sign-up goes to ${ORGANIZER_EMAIL}`);

const sent = []; // last few messages, for tests and the admin health view
async function send({ to, subject, text, replyTo }) {
  sent.push({ to, subject, at: new Date().toISOString() }); if (sent.length > 50) sent.shift();
  if (t.kind === "log") { console.log(`\n[mail:log] To: ${to}\n[mail:log] Subject: ${subject}\n${text}\n`); return { logged: true }; }
  return t.transporter.sendMail({ from: `"${FROM_NAME}" <${t.from}>`, to, subject, text, replyTo });
}
async function verify() {
  if (t.kind === "log") return { ok: true, kind: "log" };
  try { await t.transporter.verify(); return { ok: true, kind: t.kind }; } catch (e) { return { ok: false, kind: t.kind, error: e.message }; }
}

const legLine = (l) => l ? `${l.chamber === "House" ? "Rep." : "Sen."} ${l.name}${l.party ? " (" + l.party + ")" : ""}, ${l.chamber} District ${l.district}${l.email ? ", " + l.email : ""}${l.phone ? ", " + l.phone : ""}` : null;

function fmtSignature(s, total, legs = {}) {
  return [
    `NEW PETITION SIGNATURE (#${total})`,
    "Petition to the 125th Indiana General Assembly for the Indiana Nursing Home Direct Care Staffing and Accountability Act",
    "",
    `Printed name:      ${s.name}`,
    `Residence address: ${s.street}, ${s.city}, IN ${s.zip}`,
    `County:            ${s.county}`,
    `House district:    ${s.house_district || "(pending lookup)"}${legs.house ? " — " + legLine(legs.house) : ""}`,
    `Senate district:   ${s.senate_district || "(pending lookup)"}${legs.senate ? " — " + legLine(legs.senate) : ""}`,
    `Signer:            ${s.role}`,
    `Email:             ${s.email || "(none)"}`,
    `Phone:             ${s.phone || "(none)"}`,
    `Public listing:    ${s.public_listing ? "yes" : "no"}`,
    `Join coalition:    ${s.join_coalition ? "yes" : "no"}`,
    `Signed:            ${s.created_at} UTC`,
    "",
    "The signer affirmed: I am a resident of Indiana, I am signing once, and the information above is true.",
    "",
    `Admin: ${PUBLIC_URL}/admin/signatures`,
  ].join("\n");
}

function fmtMember(m, total) {
  return [
    `NEW COALITION MEMBER (#${total})`, "",
    `Name:             ${m.name}`, `Email:            ${m.email || "(none)"}`, `Phone:            ${m.phone || "(none)"}`,
    `County:           ${m.county}`, `Role:             ${m.role}`, `Employer type:    ${m.employer_type || "(not given)"}`,
    `Wants to help by: ${m.help || "(not given)"}`, `Willing to testify: ${m.testify ? "yes" : "no"}`, `County contact:   ${m.county_contact ? "yes" : "no"}`,
    `Contact by:       ${m.contact_pref || "(any)"}`, `Message:          ${m.message || "(none)"}`, `Joined:           ${m.created_at} UTC`,
    "", "Reminder: reply only from a personal, non-work channel, and never reference their workplace in writing.",
    `Admin: ${PUBLIC_URL}/admin/members`,
  ].join("\n");
}

async function notifySignature(s, total, legs) {
  await send({ to: ORGANIZER_EMAIL, subject: `Petition signature #${total}: ${s.county} County${s.house_district ? `, HD ${s.house_district}/SD ${s.senate_district}` : ""}`, text: fmtSignature(s, total, legs), replyTo: s.email || undefined });
}
async function notifyMember(m, total) {
  await send({ to: ORGANIZER_EMAIL, subject: `Coalition member #${total}: ${m.name}, ${m.county} County`, text: fmtMember(m, total), replyTo: m.email || undefined });
}

async function receiptSignature(s, legs = {}) {
  if (!s.email) return;
  const legLines = [legs.house, legs.senate].filter(Boolean).map((l) => "  " + legLine(l));
  await send({
    to: s.email,
    subject: "Please confirm your signature on the Care Floor Petition",
    text: [
      `${s.name},`, "",
      "Thank you. Your signature on the Petition to the Indiana General Assembly for the Indiana Nursing Home Direct Care Staffing and Accountability Act has been recorded.",
      "",
      "Please confirm it by opening this link (it tells your legislators the signature is real):",
      `${PUBLIC_URL}/confirm/${s.confirm_token}`,
      "",
      ...(s.house_district ? [`Your address is in Indiana House District ${s.house_district} and Senate District ${s.senate_district}.${legLines.length ? " Your legislators:" : ""}`, ...legLines, ""] : ["Your legislators: look them up by address at https://iga.in.gov/legislative/find-legislators", ""]),
      "What happens next: signatures are sorted by district and delivered, by constituents, to each signer's own state representative and senator before Organization Day, November 17, 2026, and again when the 2027 session convenes in January.",
      "",
      `Print a paper signature sheet at ${PUBLIC_URL} and collect ten signatures from people you know. Paper is what a legislator presents.`,
      "",
      "Your address is used only to compile the petition for delivery to the General Assembly. It is never published.",
      `To remove your signature and your details at any time: ${PUBLIC_URL}/remove/${s.remove_token}`,
      "",
      "If you work in a facility: use a personal phone and personal email for anything about this campaign, never facility wifi or a work account.",
      "", "The Care Floor Coalition", "General information, not legal advice.",
    ].join("\n"),
  });
}

async function receiptMember(m) {
  if (!m.email) return;
  await send({
    to: m.email,
    subject: "Welcome to the Care Floor Coalition",
    text: [
      `${m.name},`, "",
      "You are in. The coalition is direct care workers, former workers, residents, families, and allied organizations working to pass a state direct care staffing floor and worker protections in the 2027 session of the Indiana General Assembly.",
      "", "Someone will reach you from a personal, non-work channel within a few days. Until then:",
      "- Write things down with dates, on your own phone, never on a work device.",
      "- If something happens to you after you report a safety problem, the window to file a retaliation complaint with the Indiana Department of Labor is 30 calendar days from the adverse action.",
      "- Do not send photos from inside a building or any resident information, to us or to anyone.",
      "", `To leave the list and delete your details at any time: ${PUBLIC_URL}/remove/${m.remove_token}`,
      "", "The Care Floor Coalition", "General information, not legal advice.",
    ].join("\n"),
  });
}

module.exports = { send, verify, sent, notifySignature, notifyMember, receiptSignature, receiptMember, COALITION_EMAIL, ORGANIZER_EMAIL, PUBLIC_URL, transportKind: t.kind };
