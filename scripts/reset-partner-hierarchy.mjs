import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const shouldDelete = args.includes("--yes");

const ROLE_SCOPE = ["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function countSnapshot(tenantIds) {
  const whereTenant = { tenantId: { in: tenantIds } };
  return {
    businessPartners: await prisma.businessPartner.count({ where: whereTenant }),
    franchiseProfiles: await prisma.franchiseProfile.count({ where: whereTenant }),
    centerProfiles: await prisma.centerProfile.count({ where: whereTenant }),
    teacherProfiles: await prisma.teacherProfile.count({ where: whereTenant }),
    students: await prisma.student.count({ where: whereTenant }),
    authUsersScoped: await prisma.authUser.count({
      where: {
        ...whereTenant,
        role: { in: ROLE_SCOPE }
      }
    })
  };
}

async function main() {
  const partners = await prisma.businessPartner.findMany({
    select: { id: true, tenantId: true, code: true, name: true }
  });

  if (!partners.length) {
    console.log("No business partners found. Nothing to delete.");
    return;
  }

  const tenantIds = unique(partners.map((p) => p.tenantId));
  const bpIds = unique(partners.map((p) => p.id));

  console.log("Target business partners:");
  for (const partner of partners) {
    console.log(`- ${partner.code} | ${partner.name} | tenant=${partner.tenantId}`);
  }

  const before = await countSnapshot(tenantIds);
  console.log("\nSnapshot before delete:");
  console.log(JSON.stringify(before, null, 2));

  if (!shouldDelete) {
    console.log("\nDry run only. Re-run with --yes to perform deletion.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const whereTenant = { tenantId: { in: tenantIds } };
    const whereBp = { businessPartnerId: { in: bpIds } };

    await tx.examEnrollmentLevelWorksheetSelection.deleteMany({ where: whereTenant });
    await tx.examEnrollmentListItem.deleteMany({ where: whereTenant });
    await tx.examEnrollmentEntry.deleteMany({ where: whereTenant });
    await tx.examEnrollmentList.deleteMany({ where: whereTenant });

    await tx.mockTestResult.deleteMany({ where: whereTenant });
    await tx.mockTestAttempt.deleteMany({ where: whereTenant });
    await tx.mockTest.deleteMany({ where: whereTenant });

    await tx.attendanceCorrectionRequest.deleteMany({ where: whereTenant });
    await tx.attendanceEntry.deleteMany({ where: whereTenant });
    await tx.attendanceSession.deleteMany({ where: whereTenant });

    await tx.batchTeacherAssignment.deleteMany({ where: whereTenant });
    await tx.enrollment.deleteMany({ where: whereTenant });
    await tx.batch.deleteMany({ where: whereTenant });

    await tx.competitionEnrollment.deleteMany({ where: whereTenant });
    await tx.competitionWorksheet.deleteMany({ where: whereTenant });
    await tx.competitionStageTransition.deleteMany({ where: whereTenant });
    await tx.competition.deleteMany({ where: whereTenant });

    await tx.worksheetAssignment.deleteMany({ where: whereTenant });
    await tx.worksheetSubmission.deleteMany({ where: whereTenant });
    await tx.teacherNote.deleteMany({ where: whereTenant });

    await tx.aiPlaygroundLog.deleteMany({ where: whereTenant });
    await tx.certificate.deleteMany({ where: whereTenant });
    await tx.abuseFlag.deleteMany({ where: whereTenant });
    await tx.studentFeeInstallment.deleteMany({ where: whereTenant });
    await tx.studentAssignedCourse.deleteMany({ where: whereTenant });
    await tx.studentLevelProgressionHistory.deleteMany({ where: whereTenant });
    await tx.studentLevelCompletion.deleteMany({ where: whereTenant });

    await tx.financialTransaction.deleteMany({ where: whereTenant });
    await tx.settlement.deleteMany({ where: whereTenant });
    await tx.margin.deleteMany({ where: whereTenant });

    await tx.partnerCourseAccess.deleteMany({ where: whereBp });
    await tx.partnerLegacyProgram.deleteMany({ where: whereBp });
    await tx.partnerOperationalCity.deleteMany({ where: whereBp });
    await tx.partnerOperationalDistrict.deleteMany({ where: whereBp });
    await tx.partnerOperationalState.deleteMany({ where: whereBp });

    await tx.centerAddress.deleteMany({ where: whereTenant });
    await tx.franchiseAddress.deleteMany({ where: whereTenant });
    await tx.businessPartnerAddress.deleteMany({ where: whereBp });

    await tx.examPracticePlan.deleteMany({ where: whereTenant });
    await tx.examTextbookData.deleteMany({ where: whereTenant });
    await tx.examCycle.deleteMany({ where: whereTenant });

    await tx.worksheetQuestion.deleteMany({ where: whereTenant });
    await tx.worksheet.deleteMany({ where: whereTenant });

    await tx.student.deleteMany({ where: whereTenant });

    await tx.teacherProfile.deleteMany({ where: whereTenant });
    await tx.centerProfile.deleteMany({ where: whereTenant });
    await tx.franchiseProfile.deleteMany({ where: whereTenant });

    await tx.businessPartner.deleteMany({ where: whereTenant });

    await tx.userSequence.deleteMany({
      where: {
        ...whereTenant,
        role: { in: ROLE_SCOPE }
      }
    });

    await tx.authUser.deleteMany({
      where: {
        ...whereTenant,
        role: { in: ROLE_SCOPE }
      }
    });
  }, { timeout: 120000 });

  const after = await countSnapshot(tenantIds);
  console.log("\nSnapshot after delete:");
  console.log(JSON.stringify(after, null, 2));
}

main()
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
