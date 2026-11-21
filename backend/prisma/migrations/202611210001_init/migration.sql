CREATE TYPE "Role" AS ENUM (
  'CENTRE',
  'DISTRICT_OFFICER',
  'QUALITY',
  'STATE'
);

CREATE TYPE "BatchStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'QUALITY_REVIEW',
  'DISTRICT_REVIEW',
  'STATE_REVIEW',
  'RETURNED',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "CertificateStatus" AS ENUM (
  'VALID',
  'CANCELLED'
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "role" "Role" NOT NULL,
  "district" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Batch" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "centreId" TEXT NOT NULL,
  "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
  "district" TEXT NOT NULL,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Candidate" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "Batch"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "course" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  UNIQUE("batchId", "externalId")
);

CREATE TABLE "Approval" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "Batch"("id"),
  "officerId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("batchId", "officerId")
);

CREATE TABLE "Certificate" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL UNIQUE REFERENCES "Candidate"("id"),
  "certificateNo" TEXT NOT NULL UNIQUE,
  "verificationToken" TEXT NOT NULL UNIQUE,
  "status" "CertificateStatus" NOT NULL DEFAULT 'VALID',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3)
);

CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT REFERENCES "Batch"("id"),
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Batch_status_district_submittedAt_idx"
  ON "Batch"("status", "district", "submittedAt");

CREATE INDEX "AuditEvent_batchId_createdAt_idx"
  ON "AuditEvent"("batchId", "createdAt");
