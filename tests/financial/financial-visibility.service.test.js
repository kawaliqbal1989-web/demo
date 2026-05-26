import {
  buildFeeReminderCards,
  buildTeacherFinancialWidgets,
  listTeacherStudentFinancialRows
} from "../../src/services/financial-visibility.service.js";

describe("financial-visibility reminder generation", () => {
  test("builds pending, overdue, and waived reminders from fee timeline", () => {
    const timeline = {
      dues: [
        {
          id: "d1",
          year: 2026,
          month: 4,
          dueDate: "2026-04-05T00:00:00.000Z",
          pending: 1200,
          status: "OVERDUE"
        },
        {
          id: "d2",
          year: 2026,
          month: 5,
          dueDate: "2026-05-05T00:00:00.000Z",
          pending: 900,
          status: "PENDING"
        },
        {
          id: "d3",
          year: 2026,
          month: 6,
          dueDate: "2026-06-05T00:00:00.000Z",
          pending: 0,
          status: "WAIVED",
          adjustmentRemarks: "Special waiver"
        }
      ],
      summary: {
        totalPending: 2100,
        totalOverdue: 1200
      }
    };

    const reminders = buildFeeReminderCards({
      timeline,
      asOf: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(reminders.some((item) => item.kind === "PENDING_MONTH")).toBe(true);
    expect(reminders.some((item) => item.kind === "MULTI_MONTH_PENDING")).toBe(true);
    expect(reminders.some((item) => item.kind === "OVERDUE")).toBe(true);
    expect(reminders.some((item) => item.kind === "WAIVED")).toBe(true);
  });

  test("returns empty reminder list when there are no due signals", () => {
    const reminders = buildFeeReminderCards({
      timeline: {
        dues: [
          {
            id: "p1",
            year: 2026,
            month: 5,
            dueDate: "2026-05-01T00:00:00.000Z",
            pending: 0,
            status: "PAID"
          }
        ],
        summary: {
          totalPending: 0,
          totalOverdue: 0
        }
      }
    });

    expect(reminders).toHaveLength(0);
  });
});

describe("financial-visibility teacher widgets", () => {
  test("aggregates pending/overdue/high-risk counts", () => {
    const widgets = buildTeacherFinancialWidgets([
      {
        totals: { totalPending: 2000, totalOverdue: 500 },
        riskLevel: "HIGH"
      },
      {
        totals: { totalPending: 400, totalOverdue: 0 },
        riskLevel: "LOW"
      },
      {
        totals: { totalPending: 0, totalOverdue: 0 },
        riskLevel: "NONE"
      }
    ]);

    expect(widgets.pendingFeeStudents).toBe(2);
    expect(widgets.overdueStudents).toBe(1);
    expect(widgets.highRiskStudents).toBe(1);
    expect(widgets.pendingAmount).toBe(2400);
    expect(widgets.collectionRisk).toBe("HIGH");
  });

  test("enforces assigned-student scope filters in teacher queries", async () => {
    const calls = [];
    const tx = {
      batchTeacherAssignment: {
        findMany: async () => [{ batchId: "batch_1" }]
      },
      enrollment: {
        groupBy: async (args) => {
          calls.push({ method: "groupBy", args });
          return [];
        },
        findMany: async (args) => {
          calls.push({ method: "findMany", args });
          return [];
        }
      }
    };

    await listTeacherStudentFinancialRows({
      tenantId: "tenant_default",
      teacherUserId: "teacher_001",
      hierarchyNodeId: "center_001",
      limit: 10,
      offset: 0,
      tx
    });

    const whereFromGroupBy = calls.find((item) => item.method === "groupBy")?.args?.where;
    const whereFromFindMany = calls.find((item) => item.method === "findMany")?.args?.where;

    expect(whereFromGroupBy).toMatchObject({
      tenantId: "tenant_default",
      hierarchyNodeId: "center_001",
      status: "ACTIVE"
    });
    expect(Array.isArray(whereFromGroupBy.OR)).toBe(true);
    expect(whereFromGroupBy.OR).toEqual(
      expect.arrayContaining([
        { assignedTeacherUserId: "teacher_001" },
        { batchId: { in: ["batch_1"] } }
      ])
    );

    expect(whereFromFindMany).toMatchObject({
      tenantId: "tenant_default",
      hierarchyNodeId: "center_001",
      status: "ACTIVE"
    });
    expect(Array.isArray(whereFromFindMany.OR)).toBe(true);
    expect(whereFromFindMany.OR).toEqual(
      expect.arrayContaining([
        { assignedTeacherUserId: "teacher_001" },
        { batchId: { in: ["batch_1"] } }
      ])
    );
  });
});
