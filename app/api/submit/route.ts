import { journalPayloadSchema } from "../../../lib/journalSchema";

const MAX_BODY_BYTES = 200 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_WEBHOOK_URL = "http://localhost:5678/webhook/jurnal-pkl";
const GENERIC_GATEWAY_ERROR =
  "Gagal mengirim data ke layanan n8n. Pastikan layanan penerima aktif.";

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json(
      { ok: false, error: "Gagal membaca data permintaan." },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(rawBody, "utf-8") > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "Ukuran data melebihi batas 200 KB." },
      { status: 413 }
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { ok: false, error: "Format JSON tidak valid." },
      { status: 400 }
    );
  }

  const validation = journalPayloadSchema.safeParse(parsedJson);
  if (!validation.success) {
    return Response.json(
      { ok: false, error: "Data jurnal tidak sesuai format yang diharapkan." },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(validation.data),
      signal: controller.signal,
    });

    if (response.status === 202) {
      return Response.json({ ok: true }, { status: 200 });
    }

    return Response.json(
      { ok: false, error: GENERIC_GATEWAY_ERROR },
      { status: 502 }
    );
  } catch {
    return Response.json(
      { ok: false, error: GENERIC_GATEWAY_ERROR },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
