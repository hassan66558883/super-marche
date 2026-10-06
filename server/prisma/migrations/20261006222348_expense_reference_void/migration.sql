-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "reference" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_id" UUID;
