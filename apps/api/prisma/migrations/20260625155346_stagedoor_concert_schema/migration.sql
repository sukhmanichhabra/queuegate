/*
  Warnings:

  - You are about to drop the column `description` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `starts_at` on the `Event` table. All the data in the column will be lost.
  - Added the required column `artist` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `show_date` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticket_price` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `venue` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "description",
DROP COLUMN "starts_at",
ADD COLUMN     "artist" TEXT NOT NULL,
ADD COLUMN     "series_id" TEXT,
ADD COLUMN     "show_date" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "ticket_price" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "venue" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "queue_entries" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;
