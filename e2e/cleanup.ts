import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config(
  process.env.DOTENV_CONFIG_PATH
    ? {
        path: process.env.DOTENV_CONFIG_PATH
      }
    : undefined
);

function getEffectiveDatabaseUrl() {
  return process.env.E2E_DATABASE_URL || process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || null;
}

export async function cleanupE2EData() {
  const effectiveDatabaseUrl = getEffectiveDatabaseUrl();
  if (effectiveDatabaseUrl) {
    process.env.DATABASE_URL = effectiveDatabaseUrl;
  }

  const prisma = new PrismaClient();

  try {
    const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
    if (!tenant) {
      return;
    }

    const tenantId = tenant.id;

    const partners = await prisma.businessPartner.findMany({
      where: { tenantId, code: { startsWith: "BP-E2E-" } },
      select: { id: true }
    });
    const businessPartnerIds = partners.map((p) => p.id);

    const cycles = await prisma.examCycle.findMany({
      where: {
        tenantId,
        OR: [
          { code: { startsWith: "EXE2E-" } },
          ...(businessPartnerIds.length ? [{ businessPartnerId: { in: businessPartnerIds } }] : [])
        ]
      },
      select: { id: true }
    });
    const examCycleIds = cycles.map((c) => c.id);

    const worksheets = await prisma.worksheet.findMany({
      where: {
        tenantId,
        OR: [
          { title: { startsWith: "E2E Base Exam Worksheet" } },
          ...(examCycleIds.length ? [{ examCycleId: { in: examCycleIds } }] : [])
        ]
      },
      select: { id: true }
    });
    const worksheetIds = worksheets.map((w) => w.id);

    const nodes = await prisma.hierarchyNode.findMany({
      where: { tenantId, code: { startsWith: "E2E-" } },
      select: { id: true }
    });
    const hierarchyNodeIds = nodes.map((n) => n.id);

    const students = await prisma.student.findMany({
      where: {
        tenantId,
        OR: [
          ...(hierarchyNodeIds.length ? [{ hierarchyNodeId: { in: hierarchyNodeIds } }] : []),
          ...(examCycleIds.length ? [{ temporaryExamCycleId: { in: examCycleIds } }] : [])
        ]
      },
      select: { id: true }
    });
    const studentIds = students.map((s) => s.id);

    // Delete leaf tables first.
    if (worksheetIds.length || studentIds.length) {
      await prisma.worksheetSubmission.deleteMany({
        where: {
          tenantId,
          OR: [
            ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
            ...(worksheetIds.length ? [{ worksheetId: { in: worksheetIds } }] : [])
          ]
        }
      });

      await prisma.worksheetAssignment.deleteMany({
        where: {
          tenantId,
          OR: [
            ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
            ...(worksheetIds.length ? [{ worksheetId: { in: worksheetIds } }] : [])
          ]
        }
      });
    }

    if (worksheetIds.length) {
      await prisma.worksheetQuestion.deleteMany({ where: { tenantId, worksheetId: { in: worksheetIds } } });
    }

    if (examCycleIds.length) {
      await prisma.examEnrollmentLevelWorksheetSelection.deleteMany({
        where: {
          tenantId,
          list: {
            examCycleId: { in: examCycleIds }
          }
        }
      });

      await prisma.examEnrollmentListItem.deleteMany({
        where: {
          tenantId,
          OR: [
            {
              list: {
                examCycleId: { in: examCycleIds }
              }
            },
            {
              entry: {
                examCycleId: { in: examCycleIds }
              }
            }
          ]
        }
      });

      await prisma.examEnrollmentList.deleteMany({ where: { tenantId, examCycleId: { in: examCycleIds } } });
      await prisma.examEnrollmentEntry.deleteMany({ where: { tenantId, examCycleId: { in: examCycleIds } } });
    }

    // ExamCycle -> BusinessPartner is onDelete: Restrict, so remove cycles before partners.
    if (examCycleIds.length) {
      await prisma.examCycle.deleteMany({ where: { tenantId, id: { in: examCycleIds } } });
    }

    if (worksheetIds.length) {
      await prisma.worksheet.deleteMany({ where: { tenantId, id: { in: worksheetIds } } });
    }

    if (studentIds.length) {
      await prisma.student.deleteMany({ where: { tenantId, id: { in: studentIds } } });
    }

    if (businessPartnerIds.length) {
      await prisma.businessPartner.deleteMany({ where: { tenantId, id: { in: businessPartnerIds } } });
    }

    if (hierarchyNodeIds.length) {
      await prisma.hierarchyNode.deleteMany({ where: { tenantId, id: { in: hierarchyNodeIds } } });
    }

    await prisma.authUser.deleteMany({ where: { tenantId, email: { endsWith: "@e2e.local" } } });
  } catch (error) {
    // Avoid failing an otherwise-green suite just because cleanup couldn't run.
    // The logs are still visible in the Playwright output.
    const message = error instanceof Error ? error.message : String(error);
    console.warn("E2E cleanup failed:", message);
    console.warn(
      "Tip: set E2E_CLEANUP=0 to disable automatic cleanup, or run cleanup manually after inspecting the DB."
    );
  } finally {
    await prisma.$disconnect();
  }
}
