import { PrismaClient } from "@/app/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"

function makePrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter, log: ["error"] })
}

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || makePrisma()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
