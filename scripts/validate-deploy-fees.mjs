import { PrismaClient } from "@prisma/client";
import {
  listPendingInstallments,
  listReminders,
  listStudentWise
} from "../deploy/src/services/center-fees-reporting.service.js";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const tenantId = process.env.TENANT_ID || "tenant_default";
  const centerCode = process.env.CENTER_CODE || "SCH-001";

  const center = await prisma.hierarchyNode.findFirst({
    where: { tenantId, code: centerCode },
    select: { id: true, name: true, code: true }
  });

  if (!center) {
    console.log(
      JSON.stringify(
        {
          error: "CENTER_NOT_FOUND",
          tenantId,
          centerCode
        },
        null,
        2
      )
    );
    return;
  }

  const base = {
    tenantId,
    centerId: center.id,
    range: { from, to, toExclusive: to },
    limit: 20,
    offset: 0
  };

  const [studentWise, pending, reminders] = await Promise.all([
    listStudentWise(base),
    listPendingInstallments(base),
    listReminders(base)
  ]);

  const output = {
    tenantId,
    center,
    month: {
      from: from.toISOString(),
      to: to.toISOString()
    },
    studentWise: {
      total: studentWise.total,
      rows: Array.isArray(studentWise.items) ? studentWise.items.length : 0
    },
    pendingInstallments: {
      total: pending.total,
      rows: Array.isArray(pending.items) ? pending.items.length : 0
    },
    reminders: {
      total: reminders.total,
      rows: Array.isArray(reminders.items) ? reminders.items.length : 0
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
