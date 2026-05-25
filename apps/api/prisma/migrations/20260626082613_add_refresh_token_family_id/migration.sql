-- Add family_id with a runtime DEFAULT so existing rows are backfilled automatically.
-- The DEFAULT is dropped immediately after so the application always supplies the value
-- explicitly (the Prisma schema has no @default here — family_id is set by auth.service.ts).
ALTER TABLE "RefreshToken" ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "RefreshToken" ALTER COLUMN "family_id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "RefreshToken_family_id_idx" ON "RefreshToken"("family_id");
