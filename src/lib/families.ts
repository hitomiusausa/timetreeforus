import { prisma } from "./prisma";

export async function ensureFamilyMember(userId: string, familySpaceId: string) {
  const membership = await prisma.familyMember.findUnique({
    where: {
      familySpaceId_userId: {
        familySpaceId,
        userId,
      },
    },
  });

  if (!membership) {
    throw new Error("この家族スペースに参加していません。");
  }

  return membership;
}

export function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

