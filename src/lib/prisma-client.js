import dotenv from "dotenv";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

dotenv.config(
  process.env.DOTENV_CONFIG_PATH
    ? {
        path: process.env.DOTENV_CONFIG_PATH
      }
    : undefined
);

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl)
  });
}