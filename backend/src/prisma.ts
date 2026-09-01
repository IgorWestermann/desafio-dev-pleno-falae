import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error("Environment variable DATABASE_URL is required");
}

const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });