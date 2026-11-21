import { prisma } from "../db.js";
import { randomUUID } from "node:crypto";
export async function audit(
  batchId: string,
  actorId: string,
  action: string,
  metadata?: unknown,
) {
  await prisma.auditEvent.create({
    data: { batchId, actorId, action, metadata: metadata as any },
  });
}
export async function submitBatch(batchId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
    if (!["DRAFT", "RETURNED"].includes(b.status))
      throw new Error("Batch cannot be submitted from current state");
    const updated = await tx.batch.update({
      where: { id: batchId },
      data: {
        status: b.candidateCount > 50 ? "QUALITY_REVIEW" : "DISTRICT_REVIEW",
        submittedAt: new Date(),
      },
    });
    await tx.approval.deleteMany({ where: { batchId } });
    await tx.auditEvent.create({
      data: {
        batchId,
        actorId,
        action: "BATCH_SUBMITTED",
        metadata: { previousStatus: b.status, approvalReset: true },
      },
    });
    return updated;
  });
}

export async function decideDistrict(
  batchId: string,
  actorId: string,
  decision: "APPROVE" | "RETURN" | "REJECT",
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    // Lock this batch so concurrent approvals are processed sequentially.
    await tx.$queryRaw`
      SELECT "id" FROM "Batch"
      WHERE "id" = ${batchId}
      FOR UPDATE
    `;

    const b = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (b.status !== "DISTRICT_REVIEW") {
      throw new Error("Batch is not awaiting district review");
    }

    if (decision === "RETURN") {
      const updated = await tx.batch.update({
        where: { id: batchId },
        data: { status: "RETURNED" },
      });

      await tx.approval.deleteMany({
        where: { batchId },
      });

      await tx.auditEvent.create({
        data: {
          batchId,
          actorId,
          action: "BATCH_RETURNED",
          metadata: { reason, approvalReset: true },
        },
      });

      return updated;
    }

    if (decision === "REJECT") {
      const updated = await tx.batch.update({
        where: { id: batchId },
        data: { status: "REJECTED" },
      });

      await tx.auditEvent.create({
        data: {
          batchId,
          actorId,
          action: "BATCH_REJECTED",
          metadata: { reason },
        },
      });

      return updated;
    }

    await tx.approval.create({
      data: {
        batchId,
        officerId: actorId,
        decision: "APPROVE",
      },
    }).catch(() => {
      throw new Error("Officer has already approved this batch");
    });

    const count = await tx.approval.count({
      where: {
        batchId,
        decision: "APPROVE",
      },
    });

    const nextStatus =
      count >= 2 ? "STATE_REVIEW" : "DISTRICT_REVIEW";

    const updated = await tx.batch.update({
      where: { id: batchId },
      data: { status: nextStatus },
    });

    await tx.auditEvent.create({
      data: {
        batchId,
        actorId,
        action: "DISTRICT_APPROVED",
        metadata: {
          approvalCount: count,
          nextStatus,
        },
      },
    });

    return updated;
  });
}

export async function decideQuality(
  batchId: string,
  actorId: string,
  decision: "APPROVE" | "RETURN" | "REJECT",
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Batch"
      WHERE "id" = ${batchId}
      FOR UPDATE
    `;

    const batch = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (batch.status !== "QUALITY_REVIEW") {
      throw new Error("Batch is not awaiting quality review");
    }

    if (decision === "APPROVE") {
      const updated = await tx.batch.update({
        where: { id: batchId },
        data: { status: "DISTRICT_REVIEW" },
      });

      await tx.auditEvent.create({
        data: {
          batchId,
          actorId,
          action: "QUALITY_APPROVED",
          metadata: { nextStatus: "DISTRICT_REVIEW" },
        },
      });

      return updated;
    }

    const nextStatus =
      decision === "RETURN" ? "RETURNED" : "REJECTED";

    const updated = await tx.batch.update({
      where: { id: batchId },
      data: { status: nextStatus },
    });

    if (decision === "RETURN") {
      await tx.approval.deleteMany({
        where: { batchId },
      });
    }

    await tx.auditEvent.create({
      data: {
        batchId,
        actorId,
        action:
          decision === "RETURN"
            ? "QUALITY_RETURNED"
            : "QUALITY_REJECTED",
        metadata: {
          reason,
          approvalReset: decision === "RETURN",
        },
      },
    });

    return updated;
  });
}

export async function finalApprove(batchId: string, actorId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
  SELECT "id" FROM "Batch"
  WHERE "id" = ${batchId}
  FOR UPDATE
`;
    const b = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { candidates: true },
    });
    if (b.status !== "STATE_REVIEW")
      throw new Error("Batch is not awaiting state approval");
    await tx.batch.update({
      where: { id: batchId },
      data: { status: "APPROVED" },
    });
    // One bulk insert instead of one query per candidate.
    await tx.certificate.createMany({
      data: b.candidates.map((c) => ({
        candidateId: c.id,
        certificateNo: `CF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        verificationToken: randomUUID(),
      })),
      skipDuplicates: true,
    });
    await tx.auditEvent.create({
      data: {
        batchId,
        actorId,
        action: "STATE_APPROVED_AND_CERTIFICATES_ISSUED",
        metadata: { count: b.candidates.length },
      },
    });
    return b.candidates.map((c) => c.id);
  }, { timeout: 60_000, maxWait: 10_000 });
  // No background delivery jobs: approval + certificate issuance finish in the transaction.
  return result.length;
}
