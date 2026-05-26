import { jest } from "@jest/globals";
import { computeFeeTimelinesForStudents } from "../../src/services/student-fee-due.service.js";

function buildTx({ installments = [], payments = [], monthAdjustments = [] } = {}) {
  return {
    studentFeeInstallment: {
      findMany: jest.fn().mockResolvedValue(installments)
    },
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue(payments)
    },
    studentFeeMonthAdjustment: {
      findMany: jest.fn().mockResolvedValue(monthAdjustments)
    }
  };
}

describe("student-fee-due.service", () => {
  test("generates recurring dues, applies monthly payment, and honors waiver", async () => {
    const tx = buildTx({
      installments: [
        {
          id: "inst-rec-1",
          studentId: "stu-1",
          amount: 1000,
          dueDate: new Date("2026-01-10T00:00:00.000Z"),
          isRecurringMonthly: true,
          recurrenceEndDate: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ],
      payments: [
        {
          id: "pay-feb",
          studentId: "stu-1",
          type: "ENROLLMENT",
          grossAmount: 1000,
          feeScheduleType: "MONTHLY",
          feeMonth: 2,
          feeYear: 2026,
          installmentId: null,
          receivedAt: new Date("2026-02-11T00:00:00.000Z"),
          createdAt: new Date("2026-02-11T00:00:00.000Z")
        }
      ],
      monthAdjustments: [
        {
          id: "adj-mar",
          studentId: "stu-1",
          year: 2026,
          month: 3,
          adjustmentType: "WAIVED",
          remarks: "Approved waiver",
          createdByUserId: "user-1",
          createdAt: new Date("2026-03-01T00:00:00.000Z")
        }
      ]
    });

    const timelines = await computeFeeTimelinesForStudents({
      tenantId: "tenant-1",
      studentIds: ["stu-1"],
      asOf: new Date("2026-03-20T00:00:00.000Z"),
      tx
    });

    const timeline = timelines.get("stu-1");
    expect(timeline).toBeTruthy();
    expect(timeline.dues).toHaveLength(3);

    const jan = timeline.dues.find((row) => row.monthKey === "2026-01");
    const feb = timeline.dues.find((row) => row.monthKey === "2026-02");
    const mar = timeline.dues.find((row) => row.monthKey === "2026-03");

    expect(jan?.status).toBe("OVERDUE");
    expect(jan?.pending).toBe(1000);

    expect(feb?.status).toBe("PAID");
    expect(feb?.pending).toBe(0);
    expect(feb?.paid).toBe(1000);

    expect(mar?.status).toBe("WAIVED");
    expect(mar?.amount).toBe(0);
    expect(mar?.pending).toBe(0);

    expect(timeline.summary).toMatchObject({
      totalDue: 2000,
      totalPaid: 1000,
      totalPending: 1000,
      waivedMonths: 1,
      pausedMonths: 0
    });
  });

  test("allocates untagged payment in FIFO order", async () => {
    const tx = buildTx({
      installments: [
        {
          id: "inst-1",
          studentId: "stu-2",
          amount: 500,
          dueDate: new Date("2026-01-10T00:00:00.000Z"),
          isRecurringMonthly: false,
          recurrenceEndDate: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: "inst-2",
          studentId: "stu-2",
          amount: 500,
          dueDate: new Date("2026-02-10T00:00:00.000Z"),
          isRecurringMonthly: false,
          recurrenceEndDate: null,
          createdAt: new Date("2026-02-01T00:00:00.000Z")
        }
      ],
      payments: [
        {
          id: "pay-1",
          studentId: "stu-2",
          type: "ENROLLMENT",
          grossAmount: 600,
          feeScheduleType: "ADVANCE",
          feeMonth: null,
          feeYear: null,
          installmentId: null,
          receivedAt: new Date("2026-02-15T00:00:00.000Z"),
          createdAt: new Date("2026-02-15T00:00:00.000Z")
        }
      ],
      monthAdjustments: []
    });

    const timelines = await computeFeeTimelinesForStudents({
      tenantId: "tenant-1",
      studentIds: ["stu-2"],
      asOf: new Date("2026-02-20T00:00:00.000Z"),
      tx
    });

    const timeline = timelines.get("stu-2");
    expect(timeline).toBeTruthy();

    const first = timeline.dues.find((row) => row.sourceInstallmentId === "inst-1");
    const second = timeline.dues.find((row) => row.sourceInstallmentId === "inst-2");

    expect(first?.status).toBe("PAID");
    expect(first?.paid).toBe(500);
    expect(first?.pending).toBe(0);

    expect(second?.status).toBe("PARTIAL");
    expect(second?.paid).toBe(100);
    expect(second?.pending).toBe(400);

    expect(timeline.summary).toMatchObject({
      totalPaid: 600,
      totalPending: 400,
      unallocatedPaymentAmount: 0
    });
  });

  test("stops recurring generation at recurrence end month", async () => {
    const tx = buildTx({
      installments: [
        {
          id: "inst-rec-stop",
          studentId: "stu-3",
          amount: 300,
          dueDate: new Date("2026-01-15T00:00:00.000Z"),
          isRecurringMonthly: true,
          recurrenceEndDate: new Date("2026-02-18T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ],
      payments: [],
      monthAdjustments: []
    });

    const timelines = await computeFeeTimelinesForStudents({
      tenantId: "tenant-1",
      studentIds: ["stu-3"],
      asOf: new Date("2026-04-01T00:00:00.000Z"),
      tx
    });

    const timeline = timelines.get("stu-3");
    expect(timeline).toBeTruthy();
    expect(timeline.dues.map((row) => row.monthKey)).toEqual(["2026-01", "2026-02"]);
  });
});
