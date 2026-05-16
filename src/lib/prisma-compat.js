import prismaClientPkg from "@prisma/client";

const PrismaClient =
  prismaClientPkg?.PrismaClient ?? prismaClientPkg?.default?.PrismaClient;
const Prisma = prismaClientPkg?.Prisma ?? prismaClientPkg?.default?.Prisma;

if (!PrismaClient) {
  throw new Error("@prisma/client did not expose PrismaClient in this runtime");
}

export { PrismaClient, Prisma };
