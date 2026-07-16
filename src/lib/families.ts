import { prisma } from "./prisma";

export const memberColors = ["#52DE3F", "#6BE69A", "#6BE6D7", "#6BB7E6", "#96A0ED", "#E66B79"];

export async function ensureFamilyMember(userId: string, familySpaceId: string) {
  const membership = await prisma.familyMember.findFirst({
    where: {
      familySpaceId,
      userId,
      familySpace: {
        archivedAt: null,
      },
    },
  });

  if (!membership) {
    throw new Error("この家族スペースに参加していません。");
  }

  return membership;
}

export async function joinFamilyByInviteCode(userId: string, inviteCode: string) {
  const normalizedInviteCode = inviteCode.trim().toUpperCase();

  if (!normalizedInviteCode) {
    return null;
  }

  const family = await prisma.familySpace.findUnique({
    where: { inviteCode: normalizedInviteCode, archivedAt: null },
    include: {
      members: true,
    },
  });

  if (!family) {
    return null;
  }

  const existing = family.members.find((member) => member.userId === userId);

  if (!existing) {
    await prisma.familyMember.create({
      data: {
        familySpaceId: family.id,
        userId,
        role: "member",
        color: memberColors[family.members.length % memberColors.length],
      },
    });
  }

  return family;
}

export function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}
