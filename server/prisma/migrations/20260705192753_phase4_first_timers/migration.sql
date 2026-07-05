/*
  Warnings:

  - You are about to drop the column `serviceType` on the `first_timers` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'added_first_timer';

-- AlterTable
ALTER TABLE "first_timers" DROP COLUMN "serviceType",
ADD COLUMN     "serviceName" TEXT;

-- DropEnum
DROP TYPE "ServiceType";
