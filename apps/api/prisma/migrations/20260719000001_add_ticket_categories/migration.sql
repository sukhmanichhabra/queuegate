-- TicketCategory model was added to schema.prisma but no migration was generated for it.
-- This migration creates the ticket_categories table and adds the ticket_category_id
-- foreign key column to queue_entries.

-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e11d48',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_categories_event_id_idx" ON "ticket_categories"("event_id");

-- AddForeignKey: ticket_categories → Event
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add nullable ticket_category_id to queue_entries
ALTER TABLE "queue_entries" ADD COLUMN "ticket_category_id" UUID;

-- CreateIndex
CREATE INDEX "queue_entries_ticket_category_id_idx" ON "queue_entries"("ticket_category_id");

-- AddForeignKey: queue_entries → ticket_categories
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_ticket_category_id_fkey"
    FOREIGN KEY ("ticket_category_id") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
