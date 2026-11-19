import { z } from "zod";

const hadirEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.literal("HADIR"),
    timeIn: z.string().regex(/^\d{2}\.\d{2}$/),
    timeOut: z.string().regex(/^\d{2}\.\d{2}$/),
    topic: z.string().min(1),
    report: z.string().min(1),
  })
  .strict();

const nonHadirEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["LIBUR", "IZIN", "SAKIT"]),
  })
  .strict();

export const journalEntrySchema = z.union([
  hadirEntrySchema,
  nonHadirEntrySchema,
]);

export const journalPayloadSchema = z
  .object({
    period: z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .strict(),
    izinReason: z.string().nullable(),
    entries: z.array(journalEntrySchema).min(1),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        hadir: z.number().int().nonnegative(),
        izin: z.number().int().nonnegative(),
        sakit: z.number().int().nonnegative(),
        libur: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type ValidatedJournalPayload = z.infer<typeof journalPayloadSchema>;
