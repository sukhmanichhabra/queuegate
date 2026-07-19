-- image_url was added to schema.prisma but never included in any migration.
-- This migration adds the missing nullable column to the Event table.
-- This is safe to run on a non-empty table because the column is optional (NULL allowed).

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
