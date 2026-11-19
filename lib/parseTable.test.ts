import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTable } from "./parseTable";

describe("parseTable", () => {
  it("Kriteria 1: mengubah teks contoh Bagian 4 menjadi JSON yang sama persis dengan Bagian 5", () => {
    const input = [
      "October in 2026",
      "Date\tIn\tOut\tStatus\tTopic\tReport",
      "05/10/2026\t07.30\t17.00\tPresents\tSwagger,scalar,docusaurus\tlearning how to use swagger,scalar, docusaurus",
      "10/10/2026\tDay Off\t\t\t\t",
      "12/10/2026\tPermit\t\t\t\t",
      "29/10/2026\tSick\t\t\t\t",
    ].join("\n");

    const result = parseTable(input, "mengikuti gladi TKA");

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({
      period: { month: 10, year: 2026 },
      izinReason: "mengikuti gladi TKA",
      entries: [
        {
          date: "2026-10-05",
          status: "HADIR",
          timeIn: "07.30",
          timeOut: "17.00",
          topic: "Swagger,scalar,docusaurus",
          report: "learning how to use swagger,scalar, docusaurus",
        },
        { date: "2026-10-10", status: "LIBUR" },
        { date: "2026-10-12", status: "IZIN" },
        { date: "2026-10-29", status: "SAKIT" },
      ],
      summary: {
        total: 4,
        hadir: 1,
        izin: 1,
        sakit: 1,
        libur: 1,
      },
    });
  });

  it("Kriteria 2: mem-parsing fixtures/sample-table.txt menjadi 27 entri (15 HADIR, 4 IZIN, 1 SAKIT, 7 LIBUR)", () => {
    const fixturePath = path.join(process.cwd(), "fixtures", "sample-table.txt");
    const rawText = fs.readFileSync(fixturePath, "utf-8");

    const result = parseTable(rawText);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.data?.period).toEqual({ month: 10, year: 2026 });
    expect(result.data?.izinReason).toBeNull();
    expect(result.data?.entries.length).toBe(27);
    expect(result.data?.summary).toEqual({
      total: 27,
      hadir: 15,
      izin: 4,
      sakit: 1,
      libur: 7,
    });
  });

  it("Kriteria 3: menangani variasi huruf, spasi ujung sel, jam titik/titik dua, baris judul/kosong, urutan tanggal, dan tidak merapikan isi laporan", () => {
    const input = [
      "",
      "   October in 2026   ",
      "Date\tIn\tOut\tStatus\tTopic\tReport",
      "",
      "15/10/2026\t  day off  \t\t\t\t",
      "06/10/2026\t 07:30 \t 17:00 \t presents \t  topik   acak!!  \t  isi   laporan  dengan   spasi  ganda  ",
      "08/10/2026\tPERMIT",
      "07/10/2026\tsick",
      "",
    ].join("\r\n");

    const result = parseTable(input, "   ");

    expect(result.ok).toBe(true);
    expect(result.data?.izinReason).toBeNull();
    // Pastikan terurut berdasarkan tanggal naik
    expect(result.data?.entries.map((e) => e.date)).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-15",
    ]);

    const hadirEntry = result.data?.entries[0];
    expect(hadirEntry).toEqual({
      date: "2026-10-06",
      status: "HADIR",
      timeIn: "07.30",
      timeOut: "17.00",
      // Spasi ujung sel dibersihkan, tapi spasi/tanda baca di dalam teks tidak diubah
      topic: "topik   acak!!",
      report: "isi   laporan  dengan   spasi  ganda",
    });
  });

  it("Kriteria 4a: melaporkan nomor baris untuk status tidak dikenali dan tanggal tidak valid serta memblokir pengiriman", () => {
    const input = [
      "October in 2026",
      "Date\tIn\tOut\tStatus\tTopic\tReport",
      "32/10/2026\tDay Off",
      "05/10/2026\tBolos",
    ].join("\n");

    const result = parseTable(input);

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[1].line).toBe(4);
  });

  it("Kriteria 4b: menolak tanggal ganda dan tanggal yang bercampur beda bulan/tahun beserta nomor barisnya", () => {
    const input = [
      "05/10/2026\tDay Off",
      "05/10/2026\tPermit",
      "06/11/2026\tSick",
    ].join("\n");

    const result = parseTable(input);

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("Kriteria 4c: melaporkan kolom kosong (Out, Topic, atau Report) pada baris HADIR dan memblokir pengiriman", () => {
    const input = [
      "05/10/2026\t07.30\t\tPresents\tTopik A\tLaporan A",
      "06/10/2026\t07.30\t17.00\tPresents\t\tLaporan B",
      "07/10/2026\t07.30\t17.00\tPresents\tTopik C\t",
    ].join("\n");

    const result = parseTable(input);

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });
});
