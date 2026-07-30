import type { PrismaClient } from "../generated/prisma/client.js";
import type { Role } from "../generated/prisma/enums.js";

export interface ApplicationProfile {
  id: string;
  role: Role;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
}

export type ProfileReader = (
  userId: string,
) => Promise<ApplicationProfile | null>;

export function createProfileReader(prisma: PrismaClient): ProfileReader {
  return (userId) =>
    prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
      },
    });
}
