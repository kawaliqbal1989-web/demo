const rolePrefixMap = {
  SUPERADMIN: { prefix: "SA", pad: 3 },
  BP: { prefix: "BP", pad: 3 },
  FRANCHISE: { prefix: "FR", pad: 3 },
  CENTER: { prefix: "CE", pad: 3 },
  TEACHER: { prefix: "TE", pad: 3 },
  STUDENT: { prefix: "ST", pad: 4 }
};

function roleUsernameSpec(role) {
  const spec = rolePrefixMap[role];
  if (!spec) {
    const error = new Error("Unsupported role for username generation");
    error.statusCode = 400;
    error.errorCode = "ROLE_USERNAME_UNSUPPORTED";
    throw error;
  }

  return spec;
}

function formatUsername({ role, sequenceValue }) {
  const spec = roleUsernameSpec(role);
  return `${spec.prefix}${String(sequenceValue).padStart(spec.pad, "0")}`;
}

async function generateUsername({ tx, tenantId, role }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sequence = await tx.userSequence.upsert({
      where: {
        tenantId_role: {
          tenantId,
          role
        }
      },
      create: {
        tenantId,
        role,
        nextValue: 2
      },
      update: {
        nextValue: {
          increment: 1
        }
      }
    });

    const currentValue = sequence.nextValue - 1;
    const username = formatUsername({ role, sequenceValue: currentValue });

    const existing = await tx.authUser.findFirst({
      where: {
        tenantId,
        username
      },
      select: { id: true }
    });

    if (!existing) {
      return username;
    }
  }

  const error = new Error("Unable to allocate unique username");
  error.statusCode = 409;
  error.errorCode = "USERNAME_GENERATION_CONFLICT";
  throw error;
}

export { generateUsername, formatUsername };
