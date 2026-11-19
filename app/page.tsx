"use client";

import { useState, type FormEvent } from "react";
import { parseTable } from "../lib/parseTable";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export default function HomePage() {
  const [rawText, setRawText] = useState("");
  const [izinReason, setIzinReason] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const hasInput = rawText.trim() !== "";
  const parseResult = parseTable(rawText, izinReason);
  const canSubmit = hasInput && parseResult.ok && submitStatus !== "submitting";

  function handleRawTextChange(value: string) {
    setRawText(value);
    if (submitStatus !== "idle") {
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  }

  function handleIzinReasonChange(value: string) {
    setIzinReason(value);
    if (submitStatus !== "idle") {
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parseResult.ok || !parseResult.data || submitStatus === "submitting") {
      return;
    }

    setSubmitStatus("submitting");
    setSubmitMessage("");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parseResult.data),
      });

      let body: { ok?: boolean; error?: string } | null = null;
      try {
        body = (await response.json()) as { ok?: boolean; error?: string };
      } catch {
        body = null;
      }

      if (response.ok && body?.ok === true) {
        setSubmitStatus("success");
        setSubmitMessage("Terkirim, hasil akan dikirim lewat Telegram");
      } else {
        setSubmitStatus("error");
        setSubmitMessage(
          body?.error || "Gagal mengirim data ke layanan n8n."
        );
      }
    } catch {
      setSubmitStatus("error");
      setSubmitMessage("Tidak dapat terhubung ke server aplikasi.");
    }
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Otomasi Jurnal PKL</h1>
        <p>
          Tempel tabel jurnal harian dari Google Sheets, periksa ringkasan
          parsing, lalu kirim ke n8n.
        </p>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="journal-table">
            Tabel Jurnal (salin dari Google Sheets)
          </label>
          <p className="hint">
            Kolom dipisah tab, baris dipisah baris baru. Baris judul dan header
            otomatis diabaikan.
          </p>
          <textarea
            id="journal-table"
            value={rawText}
            onChange={(event) => handleRawTextChange(event.target.value)}
            placeholder={
              "October in 2026\nDate\tIn\tOut\tStatus\tTopic\tReport\n05/10/2026\t07.30\t17.00\tPresents\tTopik\tLaporan harian"
            }
          />
        </div>

        <div className="field">
          <label htmlFor="izin-reason">Alasan Izin (opsional)</label>
          <input
            id="izin-reason"
            type="text"
            value={izinReason}
            onChange={(event) => handleIzinReasonChange(event.target.value)}
            placeholder="Contoh: mengikuti gladi TKA"
          />
        </div>

        {hasInput && (
          <section className="summary-card" aria-live="polite">
            <div className="summary-header">
              <h2>Ringkasan Hasil Parsing</h2>
              {parseResult.data?.period && (
                <span className="period-badge">
                  Periode:{" "}
                  {String(parseResult.data.period.month).padStart(2, "0")}/
                  {parseResult.data.period.year}
                </span>
              )}
            </div>

            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Valid</span>
                <span className="stat-value">{parseResult.summary.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">HADIR</span>
                <span className="stat-value">{parseResult.summary.hadir}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">IZIN</span>
                <span className="stat-value">{parseResult.summary.izin}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">SAKIT</span>
                <span className="stat-value">{parseResult.summary.sakit}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">LIBUR</span>
                <span className="stat-value">{parseResult.summary.libur}</span>
              </div>
            </div>

            {parseResult.errors.length > 0 && (
              <div className="error-box" role="alert">
                <p className="error-box-title">
                  Ditemukan {parseResult.errors.length} baris bermasalah:
                </p>
                <ul>
                  {parseResult.errors.map((err, index) => (
                    <li key={`${err.line}-${index}`}>
                      Baris {err.line}: {err.message}
                    </li>
                  ))}
                </ul>
                <p className="error-box-note">
                  Pengiriman diblokir sampai baris bermasalah di atas
                  diperbaiki.
                </p>
              </div>
            )}
          </section>
        )}

        <div className="actions">
          <button type="submit" className="submit-btn" disabled={!canSubmit}>
            {submitStatus === "submitting" ? "Mengirim..." : "Kirim"}
          </button>
        </div>

        {(submitStatus === "success" || submitStatus === "error") && (
          <div
            className={`status-banner ${submitStatus}`}
            role={submitStatus === "error" ? "alert" : "status"}
          >
            {submitMessage}
          </div>
        )}
      </form>
    </main>
  );
}
