import "dotenv/config";
import express from "express";
import cors from "cors";
import batches from "./routes/batches.js";
import { demoAuth } from "./middleware/auth.js";
import { prisma } from "./db.js";
import "./workers/delivery.js";
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/verify/:token", async (req, res) => {
  const c = await prisma.certificate.findUnique({
    where: { verificationToken: req.params.token },
    include: { candidate: { select: { name: true, course: true } } },
  });
  if (!c) return res.status(404).json({ genuine: false, status: "NOT_FOUND" });
  res.json({
    genuine: c.status === "VALID",
    status: c.status,
    certificateNo: c.certificateNo,
    candidate: c.candidate,
    issuedAt: c.issuedAt,
  });
});
app.use(demoAuth);
app.use("/api/batches", batches);
app.listen(Number(process.env.PORT || 4000), () =>
  console.log("CertiFlow API running"),
);
