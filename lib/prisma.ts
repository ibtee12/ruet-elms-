import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

export const prisma = (
  process.env.NODE_ENV === "development"
    ? basePrisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              const start = performance.now();
              const result = await query(args);
              const duration = Math.round(performance.now() - start);
              if (duration >= 50) {
                console.warn(
                  `[SLOW QUERY] ${model}.${operation} took ${duration}ms`
                );
              } else {
                console.log(
                  `[PRISMA QUERY] ${model}.${operation} took ${duration}ms`
                );
              }
              return result;
            },
          },
        },
      })
    : basePrisma
) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;
