import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createMockN8nServer } from "../../../scripts/mock-n8n.js";

const VALID_PAYLOAD = {
  period: { month: 10, year: 2026 },
  izinReason: "mengikuti gladi TKA",
  entries: [
    {
      date: "2026-10-05",
      status: "HADIR" as const,
      timeIn: "07.30",
      timeOut: "17.00",
      topic: "Topik rahasia uji",
      report: "Isi laporan rahasia uji",
    },
    { date: "2026-10-10", status: "LIBUR" as const },
  ],
  summary: { total: 2, hadir: 1, izin: 0, sakit: 0, libur: 1 },
};

function startMockServer(options?: {
  secret?: string;
  silent?: boolean;
}): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createMockN8nServer(options);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/webhook/jurnal-pkl`,
      });
    });
  });
}

function closeServer(server: Server | null): Promise<void> {
  if (!server || !server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function makeSubmitRequest(body: unknown): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost:3000/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

describe("POST /api/submit dan mock-n8n", () => {
  const originalUrl = process.env.N8N_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;
  let activeServer: Server | null = null;

  beforeEach(() => {
    process.env.N8N_WEBHOOK_SECRET = "test-secret-123";
  });

  afterEach(async () => {
    await closeServer(activeServer);
    activeServer = null;

    if (originalUrl === undefined) {
      delete process.env.N8N_WEBHOOK_URL;
    } else {
      process.env.N8N_WEBHOOK_URL = originalUrl;
    }

    if (originalSecret === undefined) {
      delete process.env.N8N_WEBHOOK_SECRET;
    } else {
      process.env.N8N_WEBHOOK_SECRET = originalSecret;
    }

    vi.restoreAllMocks();
  });

  it("Kriteria 5a: meneruskan JSON + header x-webhook-secret ke mock dan membalas { ok: true }", async () => {
    const { server, url } = await startMockServer({
      secret: "test-secret-123",
      silent: true,
    });
    activeServer = server;
    process.env.N8N_WEBHOOK_URL = url;

    let receivedSecretHeader: string | string[] | undefined;
    server.on("request", (req) => {
      receivedSecretHeader = req.headers["x-webhook-secret"];
    });

    const response = await POST(makeSubmitRequest(VALID_PAYLOAD));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(receivedSecretHeader).toBe("test-secret-123");
  });

  it("Kriteria 5b & 6 (secret salah): membalas 502 tanpa membocorkan URL atau secret", async () => {
    const { server, url } = await startMockServer({
      secret: "test-secret-123",
      silent: true,
    });
    activeServer = server;
    process.env.N8N_WEBHOOK_URL = url;
    process.env.N8N_WEBHOOK_SECRET = "secret-salah";

    const response = await POST(makeSubmitRequest(VALID_PAYLOAD));
    const rawText = await response.text();
    const json = JSON.parse(rawText);

    expect(response.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(rawText).not.toContain(url);
    expect(rawText).not.toContain("test-secret-123");
    expect(rawText).not.toContain("secret-salah");
  });

  it("Kriteria 5b & 6 (mock mati): membalas 502 yang bersih tanpa membocorkan URL atau secret", async () => {
    const { server, url } = await startMockServer({
      secret: "test-secret-123",
      silent: true,
    });
    process.env.N8N_WEBHOOK_URL = url;
    await closeServer(server);

    const response = await POST(makeSubmitRequest(VALID_PAYLOAD));
    const rawText = await response.text();
    const json = JSON.parse(rawText);

    expect(response.status).toBe(502);
    expect(json).toEqual({
      ok: false,
      error: "Gagal mengirim data ke layanan n8n. Pastikan layanan penerima aktif.",
    });
    expect(rawText).not.toContain(url);
    expect(rawText).not.toContain("127.0.0.1");
    expect(rawText).not.toContain("test-secret-123");
  });

  it("Mock hanya mencetak ringkasan status dan tidak mencetak isi laporan atau secret", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { server, url } = await startMockServer({
      secret: "test-secret-123",
      silent: false,
    });
    activeServer = server;
    process.env.N8N_WEBHOOK_URL = url;

    const response = await POST(makeSubmitRequest(VALID_PAYLOAD));
    expect(response.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const loggedText = String(logSpy.mock.calls[0][0]);
    expect(loggedText).toContain("10/2026");
    expect(loggedText).toContain("total: 2");
    expect(loggedText).not.toContain("Topik rahasia uji");
    expect(loggedText).not.toContain("Isi laporan rahasia uji");
    expect(loggedText).not.toContain("mengikuti gladi TKA");
    expect(loggedText).not.toContain("test-secret-123");
  });

  it("Menolak JSON rusak atau struktur tidak sesuai skema Zod dengan status 400", async () => {
    const badJsonResponse = await POST(makeSubmitRequest("{bukan json"));
    expect(badJsonResponse.status).toBe(400);

    const invalidShapePayload = {
      ...VALID_PAYLOAD,
      entries: [
        {
          date: "2026-10-10",
          status: "LIBUR",
          report: "tidak boleh ada report di LIBUR",
        },
      ],
    };
    const badShapeResponse = await POST(makeSubmitRequest(invalidShapePayload));
    expect(badShapeResponse.status).toBe(400);

    const emptyEntriesResponse = await POST(
      makeSubmitRequest({ ...VALID_PAYLOAD, entries: [] })
    );
    expect(emptyEntriesResponse.status).toBe(400);
  });

  it("Menolak body yang melebihi batas 200 KB dengan status 413", async () => {
    const oversizedReport = "a".repeat(205 * 1024);
    const oversizedPayload = {
      ...VALID_PAYLOAD,
      entries: [
        {
          ...VALID_PAYLOAD.entries[0],
          report: oversizedReport,
        },
      ],
    };

    const response = await POST(makeSubmitRequest(oversizedPayload));
    expect(response.status).toBe(413);
  });

  it("Kriteria 6: kode sisi browser (app/page.tsx) tidak mengandung N8N_WEBHOOK_URL atau N8N_WEBHOOK_SECRET", () => {
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "app", "page.tsx"),
      "utf-8"
    );

    expect(pageSource).not.toContain("N8N_WEBHOOK_URL");
    expect(pageSource).not.toContain("N8N_WEBHOOK_SECRET");
    expect(pageSource).not.toContain("x-webhook-secret");
  });
});
