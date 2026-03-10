import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeBpCode(code) {
  if (!code) return null;
  const raw = String(code).trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, "");
}

async function allocateUniqueCode({ tx, tenantId, desired, fallbackBase }) {
  const desiredCode = normalizeBpCode(desired);
  if (desiredCode) {
    const exists = await tx.businessPartner.findFirst({ where: { tenantId, code: desiredCode }, select: { id: true } });
    if (!exists) return desiredCode;
  }

  const base = normalizeBpCode(fallbackBase) || "BP";
  for (let i = 1; i <= 50; i += 1) {
    const candidate = i === 1 ? base : `${base}_${i}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await tx.businessPartner.findFirst({ where: { tenantId, code: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }

  throw new Error("Unable to allocate unique code");
}

async function main() {
  const tenantCode = process.env.TENANT_CODE || "DEFAULT";
  const bpUsername = process.env.BP_USERNAME || "BP001";

  const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode }, select: { id: true, code: true } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantCode}`);

  const user = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username: bpUsername, role: "BP" },
    select: { id: true, username: true, hierarchyNodeId: true }
  });

  if (!user?.hierarchyNodeId) {
    throw new Error(`BP user not found or missing hierarchyNodeId: ${bpUsername}`);
  }

  const linkedPartner = await prisma.businessPartner.findFirst({
    where: { tenantId: tenant.id, hierarchyNodeId: user.hierarchyNodeId },
    select: { id: true, code: true, name: true }
  });

  if (!linkedPartner) {
    throw new Error(`No BusinessPartner linked to BP user's hierarchyNodeId`);
  }

  const desiredCode = user.username;

  const result = await prisma.$transaction(async (tx) => {
    const conflict = await tx.businessPartner.findFirst({
      where: { tenantId: tenant.id, code: desiredCode, NOT: { id: linkedPartner.id } },
      select: { id: true, code: true, name: true, hierarchyNodeId: true }
    });

    let moved = null;
    if (conflict) {
      const nextCode = await allocateUniqueCode({
        tx,
        tenantId: tenant.id,
        desired: conflict.name && String(conflict.name).trim() ? String(conflict.name).trim() : null,
        fallbackBase: `LEGACY_${conflict.id.slice(0, 6)}`
      });

      moved = await tx.businessPartner.update({
        where: { id: conflict.id },
        data: { code: nextCode },
        select: { id: true, code: true, name: true }
      });
    }

    const updated = await tx.businessPartner.update({
      where: { id: linkedPartner.id },
      data: { code: desiredCode },
      select: { id: true, code: true, name: true }
    });

    return { moved, updated };
  });

  console.log(
    JSON.stringify(
      {
        tenant: tenant.code,
        bpUsername,
        before: linkedPartner,
        result
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
