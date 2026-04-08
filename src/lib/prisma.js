import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const prisma = new PrismaClient({
	adapter: new PrismaMariaDb(env.databaseUrl)
});

export { prisma };
