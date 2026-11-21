
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allow } from "../middleware/auth.js";
import {
  audit,
  submitBatch,
  decideDistrict,
  decideQuality,
  finalApprove,
} from "../services/workflow.js";

const r = Router();

const candidateSchema = z
  .array(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(8),
      course: z.string().min(2),
      externalId: z.string().min(1),
    }),
  )
  .min(1)
  .max(500);

// CREATE BATCH
r.post("/", allow("CENTRE"), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(2),
      district: z.string().min(2),
      candidates: candidateSchema,
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed; no records were saved",
      details: parsed.error.flatten(),
    });
  }

  try {
    const b = await prisma.batch.create({
      data: {
        name: parsed.data.name,
        district: parsed.data.district,
        centreId: req.actor!.id,
        candidateCount: parsed.data.candidates.length,
        candidates: {
          create: parsed.data.candidates,
        },
      },
    });

    await audit(b.id, req.actor!.id, "BATCH_CREATED", {
      candidateCount: b.candidateCount,
    });

    res.status(201).json(b);
  } catch (e: any) {
    res.status(409).json({ error: e.message });
  }
});

// GET ALL BATCHES
r.get("/", async (req, res) => {
  const where: any = {};

  if (req.actor?.role === "CENTRE") {
    where.centreId = req.actor.id;
  }

  if (req.actor?.role === "DISTRICT_OFFICER") {
    where.district = req.actor.district;
  }

  const batches = await prisma.batch.findMany({
    where,
    include: {
      _count: {
        select: {
          candidates: true,
          approvals: true,
        },
      },
      approvals: {
        select: {
          officerId: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  res.json(batches);
});

// GET SINGLE BATCH
r.get("/:id", async (req, res) => {
  const b = await prisma.batch.findUnique({
    where: { id: req.params.id },
    include: {
      candidates: true,
      approvals: true,
      events: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!b) {
    return res.status(404).json({ error: "Batch not found" });
  }

  res.json(b);
});

// SUBMIT OR RESUBMIT BATCH
r.post("/:id/submit", allow("CENTRE"), async (req, res) => {
  try {
    const batchId = req.params.id as string;

    const b = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (b.centreId !== req.actor!.id) {
      return res.status(403).json({ error: "Not your batch" });
    }

    res.json(await submitBatch(b.id, req.actor!.id));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DISTRICT OFFICER DECISION
r.post(
  "/:id/district-decision",
  allow("DISTRICT_OFFICER"),
  async (req, res) => {
    const batchId = req.params.id as string;

    const p = z
      .object({
        decision: z.enum(["APPROVE", "RETURN", "REJECT"]),
        reason: z.string().optional(),
      })
      .safeParse(req.body);

    if (!p.success) {
      return res.status(400).json({
        error: p.error.flatten(),
      });
    }

    try {
      const b = await prisma.batch.findUniqueOrThrow({
        where: { id: batchId },
      });

      if (b.district !== req.actor!.district) {
        return res.status(403).json({
          error: "Wrong district",
        });
      }

      res.json(
        await decideDistrict(
          b.id,
          req.actor!.id,
          p.data.decision,
          p.data.reason,
        ),
      );
    } catch (e: any) {
      res.status(409).json({ error: e.message });
    }
  },
);

// QUALITY OFFICER DECISION
r.post(
  "/:id/quality-decision",
  allow("QUALITY"),
  async (req, res) => {
    const batchId = req.params.id as string;

    const parsed = z
      .object({
        decision: z.enum(["APPROVE", "RETURN", "REJECT"]),
        reason: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.flatten(),
      });
    }

    try {
      const result = await decideQuality(
        batchId,
        req.actor!.id,
        parsed.data.decision,
        parsed.data.reason,
      );

      res.json(result);
    } catch (error: any) {
      res.status(409).json({
        error: error.message,
      });
    }
  },
);

// STATE FINAL APPROVAL
r.post("/:id/state-approve", allow("STATE"), async (req, res) => {
  try {
    const batchId = req.params.id as string;

    res.json({
      issued: await finalApprove(batchId, req.actor!.id),
    });
  } catch (e: any) {
    res.status(409).json({
      error: e.message,
    });
  }
});

// CANCEL CERTIFICATE
r.post("/:id/cancel/:certificateId", allow("STATE"), async (req, res) => {
  const batchId = req.params.id as string;
  const certificateId = req.params.certificateId as string;

  const c = await prisma.certificate.update({
    where: { id: certificateId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  await audit(batchId, req.actor!.id, "CERTIFICATE_CANCELLED", {
    certificateId: c.id,
  });

  res.json(c);
});

export default r;
