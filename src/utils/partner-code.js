async function generatePartnerCode({ tx, tenantId }) {
  // Reuse the existing per-tenant sequence mechanism (same table as username generation)
  // but store codes in BusinessPartner.code.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Allocate a sequence value under Role.BP
    // (Prisma expects Role enum values, which includes "BP").
    const sequence = await tx.userSequence.upsert({
      where: {
        tenantId_role: {
          tenantId,
          role: "BP"
        }
      },
      create: {
        tenantId,
        role: "BP",
        nextValue: 2
      },
      update: {
        nextValue: {
          increment: 1
        }
      }
    });

    const currentValue = sequence.nextValue - 1;
    const code = `BP${String(currentValue).padStart(3, "0")}`;

    const existing = await tx.businessPartner.findFirst({
      where: {
        tenantId,
        code
      },
      select: { id: true }
    });

    if (!existing) {
      const existingUser = await tx.authUser.findFirst({
        where: {
          tenantId,
          username: code
        },
        select: { id: true }
      });

      if (!existingUser) {
        return code;
      }
    }
  }

  const error = new Error("Unable to allocate unique business partner code");
  error.statusCode = 409;
  error.errorCode = "PARTNER_CODE_GENERATION_CONFLICT";
  throw error;
}

export { generatePartnerCode };
