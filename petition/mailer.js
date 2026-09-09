// Outbound email. Three transports, chosen by MAIL_TRANSPORT:
//   gmail (default when GMAIL_USER + GMAIL_APP_PASSWORD are set)
//   smtp  (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE)
//   log   (prints the message to the console; used for local testing)
const nodemailer = require("nodemailer");

const ORGANIZER_EMAIL = process.env.ORGANIZER_EMAIL || "dezzerea70@gmail.com";
const FROM_NAME = process.env.FROM_NAME || "The Care Floor Coalition";

function pickTransport() {
  const mode = (process.env.MAIL_TRANSPORT || "").toLowerCase();
  if (mode === "log") return { kind: "log" };
  if (mode === "smtp" || (!mode && process.env.SMTP_HOST)) {
    return {
      kind: "smtp",
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      }),
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    };
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      kind: "gmail",
      transporter: nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      }),
      from: process.env.GMAIL_USER,
    };
  }
  return { kind: "log", warn: true };
}

const t = pickTransport();
if (t.warn) console.warn("[mail] No mail credentials set; messages will be logged to the console only. Set GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP_*) to send real email.");
else console.log(`[mail] transport: ${t.kind}; organizer notifications go to ${ORGANIZER_EMAIL}`);

async function send({ to, subject, text, replyTo }) {
  if (t.kind === "log") {
    console.log(`\n[mail:log] To: ${to}\n[mail:log] Subject: ${subject}\n${text}\n`);
    return { logged: true };
  }
  return t.transporter.sendMail({ from: `"${FROM_NAME}" <${t.from}>`, to, subject, text, replyTo });
}

async function verify() {
  if (t.kind === "log") return { ok: true, kind: "log" };
  try { await t.transporter.verify(); return { ok: true, kind: t.kind }; }
  catch (e) { return { ok: false, kind: t.kind, error: e.message }; }
}

function fmtSignature(s, total) {
  return [
    `NEW PETITION SIGNATURE${total ? ` (#${total})` : ""}`,
    "Petition to the 125th Indiana General Assembly for the Indiana Nursing Home Direct Care Staffing and Accountability Act",
    "",
    `Printed name:      ${s.name}`,
    `Residence address: ${s.street}, ${s.city}, IN ${s.zip}`,
    `County:            ${s.county}`,
    `Signer:            ${s.role}`,
    `Email:             ${s.email || "(none)"}`,
    `Phone:             ${s.phone || "(none)"}`,
    `Public listing:    ${s.public_listing ? "yes" : "no"}`,
    `Join coalition:    ${s.join_coalition ? "yes" : "no"}`,
    `Signed:            ${s.created_at} UTC`,
    "",
    "The signer affirmed: I am a resident of Indiana, I am signing once, and the information above is true.",
    "",
    "Admin: " + (process.env.PUBLIC_URL || "http://localhost:3000") + "/admin",
  ].join("\n");
}

function fmtMember(m, total) {
  return [
    `NEW COALITION MEMBER${total ? ` (#${total})` : ""}`,
    "",
    `Name:             ${m.name}`,
    `Email:            ${m.email || "(none)"}`,
    `Phone:            ${m.phone || "(none)"}`,
    `County:           ${m.county}`,
    `Role:             ${m.role}`,
    `Employer type:    ${m.employer_type || "(not given)"}`,
    `Wants to help by: ${m.help || "(not given)"}`,
    `Willing to testify: ${m.testify ? "yes" : "no"}`,
    `County contact:   ${m.county_contact ? "yes" : "no"}`,
    `Contact by:       ${m.contact_pref || "(any)"}`,
    `Message:          ${m.message || "(none)"}`,
    `Joined:           ${m.created_at} UTC`,
    "",
    "Reminder: reply only from a personal, non-work channel, and never reference their workplace in writing.",
  ].join("\n");
}

async function notifySignature(s, total) {
  await send({ to: ORGANIZER_EMAIL, subject: `Petition signature #${total}: ${s.county} County (${s.role})`, text: fmtSignature(s, total), replyTo: s.email || undefined });
}
async function notifyMember(m, total) {
  await send({ to: ORGANIZER_EMAIL, subject: `Coalition member #${total}: ${m.name}, ${m.county} County`, text: fmtMember(m, total), replyTo: m.email || undefined });
}
async function receiptSignature(s) {
  if (!s.email) return;
  const site = process.env.PUBLIC_URL || "";
  await send({
    to: s.email,
    subject: "You signed the Care Floor Petition",
    text: [
      `${s.name},`,
      "",
      "Thank you. Your signature on the Petition to the Indiana General Assembly for the Indiana Nursing Home Direct Care Staffing and Accountability Act has been recorded.",
      "",
      "What happens next: signatures are compiled by county and delivered, by constituents, to each signer's own state representative and senator before Organization Day, November 17, 2026, and again when the 2027 session convenes in January.",
      "",
      "Two things you can do this week:",
      "1. Find your two legislators by address at https://iga.in.gov/legislative/find-legislators and note their names.",
      `2. Print a paper signature sheet${site ? " at " + site : ""} and collect ten signatures from people you know. Paper is what a legislator presents.`,
      "",
      "Your address is used only to compile the petition for delivery to the General Assembly. It is never published.",
      "",
      "If you work in a facility: use a personal phone and personal email for anything about this campaign, never facility wifi or a work account.",
      "",
      "The Care Floor Coalition",
      "General information, not legal advice.",
    ].join("\n"),
  });
}
async function receiptMember(m) {
  if (!m.email) return;
  await send({
    to: m.email,
    subject: "Welcome to the Care Floor Coalition",
    text: [
      `${m.name},`,
      "",
      "You are in. The coalition is direct care workers, former workers, residents, families, and allied organizations working to pass a state direct care staffing floor and worker protections in the 2027 session of the Indiana General Assembly.",
      "",
      "Someone will reach you from a personal, non-work channel within a few days. Until then:",
      "- Write things down with dates, on your own phone, never on a work device.",
      "- If something happens to you after you report a safety problem, the window to file a retaliation complaint with the Indiana Department of Labor is 30 calendar days from the adverse action.",
      "- Do not send photos from inside a building or any resident information, to us or to anyone.",
      "",
      "The Care Floor Coalition",
      "General information, not legal advice.",
    ].join("\n"),
  });
}

module.exports = { send, verify, notifySignature, notifyMember, receiptSignature, receiptMember, ORGANIZER_EMAIL, transportKind: t.kind };
