-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('pastor', 'leader', 'followup_team_lead', 'followup_team_member');

-- CreateEnum
CREATE TYPE "StatusTag" AS ENUM ('good', 'needs_attention', 'concern');

-- CreateEnum
CREATE TYPE "FirstTimerStatus" AS ENUM ('pending', 'contacted', 'interested', 'not_interested', 'converted');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('answered', 'no_answer', 'callback_requested', 'interested', 'not_interested');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('sunday_service', 'midweek', 'special_event', 'other');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('submitted_member_report', 'submitted_first_timer_report', 'added_member', 'updated_member', 'converted_first_timer', 'viewed_confidential_report', 'redacted_report', 'deleted_report', 'created_user', 'deactivated_user', 'updated_settings');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('member', 'first_timer', 'member_report', 'first_timer_report', 'user', 'settings');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('report_due', 'member_unreported', 'safety_flag', 'first_timer_assigned');

-- CreateEnum
CREATE TYPE "DeletePermission" AS ENUM ('pastor_only', 'leaders');

-- CreateEnum
CREATE TYPE "ReminderDay" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "assignedLeaderId" TEXT NOT NULL,
    "groupId" TEXT,
    "lastReportDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "convertedFromFirstTimerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_reports" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "statusTag" "StatusTag" NOT NULL,
    "content" TEXT NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "isSafetyFlagged" BOOLEAN NOT NULL DEFAULT false,
    "redactedAt" TIMESTAMP(3),
    "redactedById" TEXT,
    "redactionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "first_timers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "serviceType" "ServiceType",
    "assignedToId" TEXT,
    "teamLeadId" TEXT,
    "status" "FirstTimerStatus" NOT NULL DEFAULT 'pending',
    "convertedAt" TIMESTAMP(3),
    "convertedMemberId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "first_timers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "first_timer_reports" (
    "id" TEXT NOT NULL,
    "firstTimerId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "callOutcome" "CallOutcome" NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "first_timer_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "members_convertedFromFirstTimerId_key" ON "members"("convertedFromFirstTimerId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_assignedLeaderId_fkey" FOREIGN KEY ("assignedLeaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_convertedFromFirstTimerId_fkey" FOREIGN KEY ("convertedFromFirstTimerId") REFERENCES "first_timers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_reports" ADD CONSTRAINT "member_reports_redactedById_fkey" FOREIGN KEY ("redactedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "first_timers" ADD CONSTRAINT "first_timers_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "first_timers" ADD CONSTRAINT "first_timers_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "first_timer_reports" ADD CONSTRAINT "first_timer_reports_firstTimerId_fkey" FOREIGN KEY ("firstTimerId") REFERENCES "first_timers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "first_timer_reports" ADD CONSTRAINT "first_timer_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
