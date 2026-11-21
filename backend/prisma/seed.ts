import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  for (const [id, name, email, role, district] of [
    ["anika", "Anika", "anika@demo.local", "CENTRE", null],
    ["dev", "Dev", "dev@demo.local", "DISTRICT_OFFICER", "Hyderabad"],
    ["meera", "Meera", "meera@demo.local", "DISTRICT_OFFICER", "Hyderabad"],
    ["kabir", "Kabir", "kabir@demo.local", "DISTRICT_OFFICER", "Hyderabad"],
    ["neha", "Neha", "neha@demo.local", "QUALITY", null],
    ["farah", "Farah", "farah@demo.local", "STATE", null],
  ] as any[]) {
    await p.user.upsert({
      where: { email },
      create: { id, name, email, role, district },
      update: {},
    });
  }
  const count = await p.batch.count();
  if (!count) {
    const b = await p.batch.create({
      data: {
        name: "Demo batch - Web Development",
        centreId: "anika",
        district: "Hyderabad",
        candidateCount: 3,
        candidates: {
          create: [
            {
              name: "Aarav Sharma",
              email: "aarav@example.com",
              phone: "+919900000001",
              course: "Full Stack Development",
              externalId: "C-001",
            },
            {
              name: "Isha Reddy",
              email: "isha@example.com",
              phone: "+919900000002",
              course: "Full Stack Development",
              externalId: "C-002",
            },
            {
              name: "Rohan Kumar",
              email: "rohan@example.com",
              phone: "+919900000003",
              course: "Full Stack Development",
              externalId: "C-003",
            },
          ],
        },
      },
    });
    await p.auditEvent.create({
      data: { batchId: b.id, actorId: "anika", action: "DEMO_BATCH_CREATED" },
    });
  }
}
main().finally(() => p.$disconnect());
