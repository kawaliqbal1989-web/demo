import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { generateMonthlySettlements } from "../src/services/settlement.service.js";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    args.set(key, value);
  }
  return args;
}

function previousMonthUtc() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

async function main() {
  const args = parseArgs(process.argv);

  const tenantId = args.get("tenantId") || process.env.TENANT_ID || "tenant_default";
  const yearArg = args.get("year");
  const monthArg = args.get("month");

  const fallback = previousMonthUtc();
  const year = yearArg ? Number(yearArg) : fallback.year;
  const month = monthArg ? Number(monthArg) : fallback.month;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient();

  try {
    const data = await prisma.$transaction((tx) =>
      generateMonthlySettlements({
        tx,
        tenantId,
        year,
        month,
        onlyUnsettled: true
      })
    );

    const createdCount = data.results.filter((r) => r.created).length;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tenantId, year: data.period.year, month: data.period.month, createdCount }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
});
