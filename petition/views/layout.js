// Tiny server-rendered view helpers for admin and public utility pages.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `body{font:15px/1.5 -apple-system,"Segoe UI",Roboto,"Source Sans 3",sans-serif;margin:0;padding:24px;background:#F7F5F1;color:#1C1C1A}
h1,h2,h3{font-weight:700;letter-spacing:-.01em;margin:0 0 10px}h1{font-size:26px}h2{font-size:19px;margin-top:26px}a{color:#2E4A62}
nav.top{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:14px;padding-bottom:12px;border-bottom:1px solid #1C1C1A;margin-bottom:20px}nav.top a{text-decoration:none;color:#5B5A55}nav.top a.on,nav.top a:hover{color:#1C1C1A;text-decoration:underline}
table{border-collapse:collapse;width:100%;font-size:13.5px;background:#fff}th,td{border:1px solid #D9D5CC;padding:6px 8px;text-align:left;vertical-align:top}th{background:#EFECE5;position:sticky;top:0;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}.k div{background:#fff;border:1px solid #D9D5CC;padding:12px;border-radius:4px}.k b{display:block;font-size:28px;font-variant-numeric:tabular-nums}.k small{color:#5B5A55}
.btn{display:inline-block;padding:8px 12px;border:1px solid #2E4A62;border-radius:3px;color:#2E4A62;text-decoration:none;margin:0 8px 8px 0;background:#fff;font:inherit;cursor:pointer}.btn.primary{background:#2E4A62;color:#fff}
form.inline{display:inline}button.x{border:1px solid #A8503C;color:#A8503C;background:#fff;border-radius:3px;padding:2px 8px;cursor:pointer;font:inherit;font-size:12px}
.f{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;background:#fff;border:1px solid #D9D5CC;padding:14px;border-radius:4px;margin:12px 0}.f label{display:flex;flex-direction:column;font-size:12px;font-weight:600;gap:3px}.f input,.f select,.f textarea{font:inherit;font-size:14px;padding:7px 8px;border:1px solid #C4BFB3;border-radius:3px;background:#F7F5F1}.f .full{grid-column:1/-1}
.msg{background:#D9E2EA;border-left:4px solid #2E4A62;padding:10px 12px;margin:12px 0;border-radius:3px}.warn{background:#EFD9D2;border-left-color:#A8503C}.muted{color:#5B5A55}.tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;background:#EFECE5}.tag.ok{background:#D9E2EA}.tag.no{background:#EFD9D2}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.filters select,.filters input{font:inherit;font-size:14px;padding:6px 8px;border:1px solid #C4BFB3;border-radius:3px}
.pub{max-width:62ch;margin:40px auto;font-size:17px}.pub h1{font-size:28px}
@media print{nav,.btn,button,.noprint,.filters{display:none!important}body{background:#fff;padding:0}th{position:static}}`;

const NAV = [["/admin", "Overview"], ["/admin/signatures", "Signatures"], ["/admin/members", "Members"], ["/admin/legislators", "Legislators"], ["/admin/paper", "Paper sheets"], ["/admin/packet", "Delivery packet"], ["/admin/settings", "Settings"], ["/", "Public site"]];

function page(title, body, { current = "", admin = true } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
${admin ? `<nav class="top noprint">${NAV.map(([h, t]) => `<a href="${h}" class="${h === current ? "on" : ""}">${t}</a>`).join("")}</nav>` : ""}${body}</body></html>`;
}

function publicPage(title, body) {
  return page(title, `<div class="pub">${body}</div>`, { admin: false });
}

module.exports = { esc, page, publicPage };
