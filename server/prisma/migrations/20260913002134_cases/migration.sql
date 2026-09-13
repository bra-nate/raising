-- CreateEnum
CREATE TYPE "CaseKind" AS ENUM ('concern', 'safety');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'opened_case';
ALTER TYPE "ActivityAction" ADD VALUE 'acknowledged_case';
ALTER TYPE "ActivityAction" ADD VALUE 'assigned_case';
ALTER TYPE "ActivityAction" ADD VALUE 'resolved_case';
ALTER TYPE "ActivityAction" ADD VALUE 'escalated_case';

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'case_record';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'case_assigned';
ALTER TYPE "NotificationType" ADD VALUE 'case_escalated';

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "kind" "CaseKind" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "memberId" TEXT NOT NULL,
    "openedByReportId" TEXT,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "actionPlan" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "lastEscalatedAt" TIMESTAMP(3),
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cases_status_kind_idx" ON "cases"("status", "kind");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_openedByReportId_fkey" FOREIGN KEY ("openedByReportId") REFERENCES "member_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
