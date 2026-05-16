import { authHeader, http, loginAs, prisma, randomId } from "../tests/helpers/test-helpers.js";

async function main() {
  const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
  const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });

  const centerToken = centerLogin.body.data.access_token;
  const superadminToken = superadminLogin.body.data.access_token;

  const tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  const defaultCenter = await prisma.centerProfile.findFirstOrThrow({
    where: {
      tenantId: tenantDefault.id,
      authUser: {
        is: {
          email: "center.manager@abacusweb.local"
        }
      }
    },
    include: {
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  const centerHierarchyNodeId = defaultCenter.authUser?.hierarchyNodeId;
  const importBatch = await prisma.batch.create({
    data: {
      tenantId: tenantDefault.id,
      hierarchyNodeId: centerHierarchyNodeId,
      name: randomId("DbgBatch")
    }
  });

  try {
    const currentStudentCount = await prisma.student.count({
      where: {
        tenantId: tenantDefault.id,
        hierarchyNodeId: centerHierarchyNodeId,
        isActive: true
      }
    });

    await http
      .patch(`/api/bp/centers/${defaultCenter.id}/capacity`)
      .set(authHeader(superadminToken))
      .send({
        maxTeachers: 999,
        maxStudents: currentStudentCount + 1,
        allowOverAllocation: false
      });

    const csv = [
      "admissionNo,firstName,lastName,guardianName,guardianPhone,batchId",
      `${randomId("SB")},Bulk,Allowed,Guardian,9999999991,${importBatch.id}`,
      `${randomId("SB")},Bulk,Blocked,Guardian,9999999992,${importBatch.id}`
    ].join("\n");

    const response = await http
      .post("/api/students/import-csv")
      .set(authHeader(centerToken))
      .field("batchId", importBatch.id)
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "students.csv",
        contentType: "text/csv"
      });

    console.log(JSON.stringify(response.body, null, 2));
  } finally {
    await prisma.enrollment.deleteMany({
      where: {
        tenantId: tenantDefault.id,
        batchId: importBatch.id
      }
    });
    await prisma.batch.deleteMany({
      where: {
        tenantId: tenantDefault.id,
        id: importBatch.id
      }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
