// The Care Floor Petition — web server entry point.
// Wires the public site, the JSON API, the admin area, and background jobs.
require("dotenv").config();
const path = require("path");
const express = require("express");
const { DATA_DIR } = require("./lib/db");
const mail = require("./lib/mailer");
const jobs = require("./lib/jobs");

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(require("./routes/api"));
app.use("/admin", require("./routes/admin"));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: "5m" }));
app.use((req, res) => res.status(404).send("Not found"));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Bad request body." });
  console.error(err);
  res.status(500).send("Server error");
});

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Care Floor Petition v${require("./package.json").version} listening on http://localhost:${PORT} (data in ${DATA_DIR})`);
    const v = await mail.verify();
    if (!v.ok) console.error(`[mail] ${v.kind} transport failed to verify: ${v.error}`);
    jobs.start();
  });
}
module.exports = app;
