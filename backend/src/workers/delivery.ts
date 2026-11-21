import { Worker } from "bullmq";
import { connection } from "../queue.js";
import { prisma } from "../db.js";
// Stand-in WhatsApp provider: simulate transient failures; BullMQ retries with backoff.
new Worker(
  "certificate-delivery",
  async (job) => {
    const cert = await prisma.certificate.findFirst({
      where: { candidateId: job.data.candidateId },
      include: { candidate: true },
    });
    if (!cert || cert.status !== "VALID") return;
    if (Math.random() < 0.15)
      throw new Error("Simulated WhatsApp provider timeout");
    console.log(
      `[WhatsApp MOCK] sent ${cert.certificateNo} to ${cert.candidate.phone}`,
    );
  },
  { connection, concurrency: 10 },
);
