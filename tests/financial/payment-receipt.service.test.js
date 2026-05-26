import { buildAllocationPreview, getRefundableAmount } from "../../src/services/payment-receipt.service.js";

describe("payment-receipt.service allocation engine", () => {
  test("allocates oldest dues first with partial next due", () => {
    const dues = [
      { id: "d1", sourceInstallmentId: "i1", dueDate: "2026-03-10T00:00:00.000Z", year: 2026, month: 3, pending: 1250, status: "OVERDUE" },
      { id: "d2", sourceInstallmentId: "i2", dueDate: "2026-04-10T00:00:00.000Z", year: 2026, month: 4, pending: 1250, status: "PENDING" },
      { id: "d3", sourceInstallmentId: "i3", dueDate: "2026-05-10T00:00:00.000Z", year: 2026, month: 5, pending: 1250, status: "PENDING" }
    ];

    const result = buildAllocationPreview({ dues, amount: 2000 });

    expect(result.allocatedTotal).toBe(2000);
    expect(result.unallocatedTotal).toBe(0);
    expect(result.allocations).toHaveLength(2);

    expect(result.allocations[0]).toMatchObject({
      allocationType: "DUE",
      sourceInstallmentId: "i1",
      allocatedAmount: 1250,
      duePendingBefore: 1250,
      duePendingAfter: 0
    });

    expect(result.allocations[1]).toMatchObject({
      allocationType: "DUE",
      sourceInstallmentId: "i2",
      allocatedAmount: 750,
      duePendingBefore: 1250,
      duePendingAfter: 500
    });
  });

  test("marks overpayment as explicit allocation artifact", () => {
    const dues = [
      { id: "d1", sourceInstallmentId: "i1", dueDate: "2026-03-10T00:00:00.000Z", year: 2026, month: 3, pending: 400, status: "PENDING" }
    ];

    const result = buildAllocationPreview({ dues, amount: 1000 });

    expect(result.allocatedTotal).toBe(400);
    expect(result.unallocatedTotal).toBe(600);
    expect(result.allocations).toHaveLength(2);

    expect(result.allocations[1]).toMatchObject({
      allocationType: "OVERPAYMENT",
      sourceInstallmentId: null,
      allocatedAmount: 600
    });
  });
});

describe("payment-receipt.service refund math", () => {
  test("computes refundable balance from immutable refund history", () => {
    const receipt = { totalAmount: 2500 };
    const refunds = [{ amount: 500 }, { amount: 700 }];

    expect(getRefundableAmount(receipt, refunds)).toBe(1300);
  });

  test("never returns negative refundable amount", () => {
    const receipt = { totalAmount: 1000 };
    const refunds = [{ amount: 700 }, { amount: 900 }];

    expect(getRefundableAmount(receipt, refunds)).toBe(0);
  });
});
