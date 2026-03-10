import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseBpNumber(code) {
  if (!code) return null;
  const m = String(code).trim().match(/^BP(\d{3})$/i);
  if (!m) return null;
  return Number(m[1]);
}

function formatBpCode(n) {
  return `BP${String(n).padStart(3, "0")}`;
}

async function main() {
  const apply = String(process.env.APPLY || "").trim() === "1";

  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
  const summary = [];

  for (const tenant of tenants) {
    const partners = await prisma.businessPartner.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, name: true, createdAt: true }
    });

    const bpUsers = await prisma.authUser.findMany({
      where: { tenantId: tenant.id, role: "BP" },
      select: { username: true }
    });

    const used = new Set();
    let maxExisting = 0;

    for (const p of partners) {
      used.add(String(p.code));
      const num = parseBpNumber(p.code);
      if (num) maxExisting = Math.max(maxExisting, num);
    }

    for (const u of bpUsers) {
      used.add(String(u.username));
      const num = parseBpNumber(u.username);
      if (num) maxExisting = Math.max(maxExisting, num);
    }

    let next = Math.max(1, maxExisting + 1);

    const changes = [];
    for (const p of partners) {
      const current = String(p.code);
      const ok = /^BP\d{3}$/i.test(current);
      if (ok) continue;

      // allocate next available BP### not used by either BP usernames or BP partner codes
      let candidate = null;
      for (let guard = 0; guard < 5000; guard += 1) {
        const c = formatBpCode(next);
        next += 1;
        if (!used.has(c)) {
          candidate = c;
          used.add(c);
          break;
        }
      }
      if (!candidate) {
        throw new Error(`Unable to allocate BP code for partner ${p.id} (${p.code})`);
      }

      changes.push({ id: p.id, from: current, to: candidate, name: p.name });
    }

    let updatedCount = 0;

    if (apply && changes.length) {
      await prisma.$transaction(async (tx) => {
        for (const ch of changes) {
          // eslint-disable-next-line no-await-in-loop
          await tx.businessPartner.update({ where: { id: ch.id }, data: { code: ch.to } });
        }

        // Keep the shared BP sequence ahead of BOTH BP usernames and partner codes.
        // In generators we increment then use nextValue-1, so nextValue should be max+1.
        const newMax = Math.max(
          maxExisting,
          ...changes.map((c) => parseBpNumber(c.to) || 0)
        );

        await tx.userSequence.upsert({
          where: { tenantId_role: { tenantId: tenant.id, role: "BP" } },
          create: { tenantId: tenant.id, role: "BP", nextValue: newMax + 1 },
          update: { nextValue: newMax + 1 }
        });
      });

      updatedCount = changes.length;
    }

    summary.push({
      tenant: tenant.code,
      totalPartners: partners.length,
      totalBpUsers: bpUsers.length,
      maxExisting,
      proposedChanges: changes,
      applied: apply,
      updatedCount
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
