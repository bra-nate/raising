-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'exported_person_data';
ALTER TYPE "ActivityAction" ADD VALUE 'redacted_for_retention';
ALTER TYPE "ActivityAction" ADD VALUE 'reviewed_confidential_access';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'retention_due';

-- AlterTable
ALTER TABLE "first_timers" ADD COLUMN     "consentNote" TEXT,
ADD COLUMN     "legalBasis" TEXT,
ADD COLUMN     "retentionRedactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "consentNote" TEXT,
ADD COLUMN     "legalBasis" TEXT,
ADD COLUMN     "retentionRedactedAt" TIMESTAMP(3);
