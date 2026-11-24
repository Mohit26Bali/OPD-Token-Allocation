-- CreateEnum
CREATE TYPE "TokenSource" AS ENUM ('ONLINE', 'WALK_IN', 'PAID_PRIORITY', 'FOLLOW_UP', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('WAITING', 'ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'REJECTED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AllocationEventType" AS ENUM ('TOKEN_CREATED', 'TOKEN_ALLOCATED', 'TOKEN_REALLOCATED', 'TOKEN_CANCELLED', 'TOKEN_NO_SHOW', 'TOKEN_CALLED', 'TOKEN_STARTED', 'TOKEN_COMPLETED', 'EMERGENCY_INSERTED', 'SLOT_CAPACITY_CHANGED', 'DOCTOR_DELAYED', 'DOCTOR_AVAILABILITY_CHANGED', 'TOKEN_REJECTED');

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "delayedAt" TIMESTAMP(3),
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpdSlot" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "maximumCapacity" INTEGER NOT NULL,
    "emergencyReserve" INTEGER NOT NULL DEFAULT 0,
    "paidReserve" INTEGER NOT NULL DEFAULT 0,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpdSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "tokenNumber" TEXT NOT NULL,
    "source" "TokenSource" NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'WAITING',
    "priorityScoreAtIntake" INTEGER NOT NULL,
    "preferredDoctorId" TEXT,
    "displacedFromTokenId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationEvent" (
    "id" TEXT NOT NULL,
    "type" "AllocationEventType" NOT NULL,
    "tokenId" TEXT,
    "slotId" TEXT,
    "doctorId" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Doctor_active_idx" ON "Doctor"("active");

-- CreateIndex
CREATE INDEX "OpdSlot_doctorId_date_idx" ON "OpdSlot"("doctorId", "date");

-- CreateIndex
CREATE INDEX "OpdSlot_status_idx" ON "OpdSlot"("status");

-- CreateIndex
CREATE INDEX "Token_slotId_status_idx" ON "Token"("slotId", "status");

-- CreateIndex
CREATE INDEX "Token_doctorId_status_idx" ON "Token"("doctorId", "status");

-- CreateIndex
CREATE INDEX "Token_status_idx" ON "Token"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Token_slotId_tokenNumber_key" ON "Token"("slotId", "tokenNumber");

-- CreateIndex
CREATE INDEX "AllocationEvent_tokenId_idx" ON "AllocationEvent"("tokenId");

-- CreateIndex
CREATE INDEX "AllocationEvent_slotId_idx" ON "AllocationEvent"("slotId");

-- CreateIndex
CREATE INDEX "AllocationEvent_createdAt_idx" ON "AllocationEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "OpdSlot" ADD CONSTRAINT "OpdSlot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "OpdSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationEvent" ADD CONSTRAINT "AllocationEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationEvent" ADD CONSTRAINT "AllocationEvent_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "OpdSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationEvent" ADD CONSTRAINT "AllocationEvent_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
