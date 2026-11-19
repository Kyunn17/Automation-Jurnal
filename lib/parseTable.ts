export type EntryStatus = "HADIR" | "LIBUR" | "IZIN" | "SAKIT";

export interface HadirEntry {
  date: string;
  status: "HADIR";
  timeIn: string;
  timeOut: string;
  topic: string;
  report: string;
}

export interface NonHadirEntry {
  date: string;
  status: "LIBUR" | "IZIN" | "SAKIT";
}

export type JournalEntry = HadirEntry | NonHadirEntry;

export interface JournalSummary {
  total: number;
  hadir: number;
  izin: number;
  sakit: number;
  libur: number;
}

export interface JournalPayload {
  period: {
    month: number;
    year: number;
  };
  izinReason: string | null;
  entries: JournalEntry[];
  summary: JournalSummary;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  ok: boolean;
  data: JournalPayload | null;
  summary: JournalSummary;
  errors: ParseError[];
}

const DATE_ATTEMPT_REGEX = /^\d+[\/\-]/;
const DATE_DDMMYYYY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_ATTEMPT_REGEX = /^\d{1,2}[:.]\d{2}$/;
const TIME_VALID_REGEX = /^(\d{1,2})[:.](\d{2})$/;

function parseValidDate(raw: string): {
  isoDate: string;
  day: number;
  month: number;
  year: number;
} | null {
  const match = DATE_DDMMYYYY_REGEX.exec(raw);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { isoDate, day, month, year };
}

function parseValidTime(raw: string): string | null {
  const match = TIME_VALID_REGEX.exec(raw);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}.${match[2]}`;
}

function mapNonHadirStatus(raw: string): "LIBUR" | "IZIN" | "SAKIT" | null {
  const normalized = raw.toLowerCase();
  if (normalized === "day off") return "LIBUR";
  if (normalized === "permit") return "IZIN";
  if (normalized === "sick") return "SAKIT";
  return null;
}

/**
 * Mengubah teks tabel jurnal (tab-separated dari Google Sheets) menjadi objek JSON untuk n8n.
 * Hanya melakukan trim spasi di ujung sel tanpa mengubah atau merapikan isi topic dan report.
 */
export function parseTable(
  rawText: string,
  izinReason?: string | null
): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const entries: JournalEntry[] = [];
  const errors: ParseError[] = [];

  const seenDates = new Map<string, number>();
  let firstPeriod: { month: number; year: number; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = lines[i];

    if (rawLine.trim() === "") {
      continue;
    }

    const cells = rawLine.split("\t").map((cell) => cell.trim());
    const col1 = cells[0] ?? "";
    const col2 = cells[1] ?? "";

    const parsedDate = parseValidDate(col1);
    const looksLikeDateRow =
      parsedDate !== null ||
      DATE_ATTEMPT_REGEX.test(col1) ||
      TIME_ATTEMPT_REGEX.test(col2) ||
      mapNonHadirStatus(col2) !== null;

    // Abaikan baris judul, header, atau baris yang kolom pertamanya bukan tanggal
    if (!looksLikeDateRow) {
      continue;
    }

    if (!parsedDate) {
      errors.push({
        line: lineNumber,
        message: `Tanggal tidak valid: "${col1}" (gunakan format dd/mm/yyyy yang valid).`,
      });
      continue;
    }

    // Cek periode bulan dan tahun harus sama
    if (!firstPeriod) {
      firstPeriod = {
        month: parsedDate.month,
        year: parsedDate.year,
        line: lineNumber,
      };
    } else if (
      parsedDate.month !== firstPeriod.month ||
      parsedDate.year !== firstPeriod.year
    ) {
      errors.push({
        line: lineNumber,
        message: `Tanggal "${col1}" berbeda bulan/tahun dengan baris ${firstPeriod.line}. Semua tanggal harus dalam satu bulan dan tahun yang sama.`,
      });
      continue;
    }

    // Cek tanggal ganda
    const previousLine = seenDates.get(parsedDate.isoDate);
    if (previousLine !== undefined) {
      errors.push({
        line: lineNumber,
        message: `Tanggal ganda: "${col1}" sudah terdaftar pada baris ${previousLine}.`,
      });
      continue;
    }
    seenDates.set(parsedDate.isoDate, lineNumber);

    // Cek kolom kedua: jam masuk (HADIR) atau status (Day Off / Permit / Sick)
    if (col2 === "") {
      errors.push({
        line: lineNumber,
        message: "Kolom kedua (jam masuk In atau Status) kosong.",
      });
      continue;
    }

    if (TIME_ATTEMPT_REGEX.test(col2)) {
      const timeIn = parseValidTime(col2);
      if (!timeIn) {
        errors.push({
          line: lineNumber,
          message: `Jam masuk (In) tidak valid: "${col2}".`,
        });
        continue;
      }

      const rawTimeOut = cells[2] ?? "";
      const rawTopic = cells[4] ?? "";
      const rawReport = cells[5] ?? "";

      let hasRowError = false;

      if (rawTimeOut === "") {
        errors.push({
          line: lineNumber,
          message: "Kolom jam pulang (Out) kosong pada baris HADIR.",
        });
        hasRowError = true;
      }

      const timeOut = rawTimeOut !== "" ? parseValidTime(rawTimeOut) : null;
      if (rawTimeOut !== "" && !timeOut) {
        errors.push({
          line: lineNumber,
          message: `Jam pulang (Out) tidak valid: "${rawTimeOut}".`,
        });
        hasRowError = true;
      }

      if (rawTopic === "") {
        errors.push({
          line: lineNumber,
          message: "Kolom Topic kosong pada baris HADIR.",
        });
        hasRowError = true;
      }

      if (rawReport === "") {
        errors.push({
          line: lineNumber,
          message: "Kolom Report kosong pada baris HADIR.",
        });
        hasRowError = true;
      }

      if (hasRowError || !timeOut) {
        continue;
      }

      entries.push({
        date: parsedDate.isoDate,
        status: "HADIR",
        timeIn,
        timeOut,
        topic: rawTopic,
        report: rawReport,
      });
      continue;
    }

    const nonHadirStatus = mapNonHadirStatus(col2);
    if (nonHadirStatus) {
      entries.push({
        date: parsedDate.isoDate,
        status: nonHadirStatus,
      });
      continue;
    }

    errors.push({
      line: lineNumber,
      message: `Status atau jam masuk tidak dikenali: "${col2}".`,
    });
  }

  // Urutkan berdasarkan tanggal naik
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const summary: JournalSummary = {
    total: entries.length,
    hadir: entries.filter((e) => e.status === "HADIR").length,
    izin: entries.filter((e) => e.status === "IZIN").length,
    sakit: entries.filter((e) => e.status === "SAKIT").length,
    libur: entries.filter((e) => e.status === "LIBUR").length,
  };

  if (errors.length > 0 || entries.length === 0 || !firstPeriod) {
    if (errors.length === 0 && rawText.trim() !== "") {
      errors.push({
        line: 1,
        message: "Tidak ditemukan baris data dengan format tanggal dd/mm/yyyy.",
      });
    }
    return {
      ok: false,
      data: null,
      summary,
      errors,
    };
  }

  const cleanedReason =
    typeof izinReason === "string" && izinReason.trim() !== ""
      ? izinReason.trim()
      : null;

  return {
    ok: true,
    data: {
      period: {
        month: firstPeriod.month,
        year: firstPeriod.year,
      },
      izinReason: cleanedReason,
      entries,
      summary,
    },
    summary,
    errors: [],
  };
}
