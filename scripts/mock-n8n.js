const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEBHOOK_PATH = "/webhook/jurnal-pkl";
const DEFAULT_PORT = 5678;

/**
 * Membaca nilai N8N_WEBHOOK_SECRET dari .env.local jika belum ada di process.env.
 * Tidak pernah mencetak isi secret ke log atau terminal.
 * @param {string} [envFilePath]
 * @returns {string}
 */
function loadSecretFromEnvFile(
  envFilePath = path.join(process.cwd(), ".env.local")
) {
  try {
    if (!fs.existsSync(envFilePath)) {
      return "";
    }
    const content = fs.readFileSync(envFilePath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      if (key !== "N8N_WEBHOOK_SECRET") {
        continue;
      }
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Membuat HTTP server tiruan n8n yang menerima POST /webhook/jurnal-pkl,
 * memeriksa header x-webhook-secret, membalas 202, dan hanya mencetak ringkasan.
 * @param {{ secret?: string; silent?: boolean }} [options]
 * @returns {import("node:http").Server}
 */
function createMockN8nServer(options = {}) {
  const expectedSecret =
    options.secret !== undefined
      ? options.secret
      : process.env.N8N_WEBHOOK_SECRET || loadSecretFromEnvFile();
  const silent = Boolean(options.silent);

  return http.createServer((req, res) => {
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;

    if (req.method !== "POST" || pathname !== WEBHOOK_PATH) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    const rawHeader = req.headers["x-webhook-secret"];
    const receivedSecret = Array.isArray(rawHeader)
      ? rawHeader[0] || ""
      : rawHeader || "";

    if (expectedSecret && receivedSecret !== expectedSecret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf-8");

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Request" }));
        return;
      }

      if (!payload || typeof payload !== "object") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Request" }));
        return;
      }

      if (!silent) {
        const month = payload.period?.month ?? "?";
        const year = payload.period?.year ?? "?";
        const summary = payload.summary ?? {};
        const total = summary.total ?? 0;
        const hadir = summary.hadir ?? 0;
        const izin = summary.izin ?? 0;
        const sakit = summary.sakit ?? 0;
        const libur = summary.libur ?? 0;

        console.log(
          `[mock-n8n] Menerima jurnal periode ${month}/${year} — total: ${total} (HADIR: ${hadir}, IZIN: ${izin}, SAKIT: ${sakit}, LIBUR: ${libur})`
        );
      }

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "accepted" }));
    });
  });
}

if (require.main === module) {
  const server = createMockN8nServer();
  server.listen(DEFAULT_PORT, "127.0.0.1", () => {
    console.log(
      `[mock-n8n] Server tiruan n8n berjalan di http://localhost:${DEFAULT_PORT}${WEBHOOK_PATH}`
    );
  });
}

module.exports = {
  createMockN8nServer,
  loadSecretFromEnvFile,
};
