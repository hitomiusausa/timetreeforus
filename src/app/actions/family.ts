"use server";

import { redirect } from "next/navigation";
import { makeInviteCode } from "@/lib/families";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const memberColors = ["#52DE3F", "#6BE69A", "#6BE6D7", "#6BB7E6", "#96A0ED", "#E66B79"];

async function uniqueInviteCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = makeInviteCode();
    const exists = await prisma.familySpace.findUnique({ where: { inviteCode } });

    if (!exists) {
      return inviteCode;
    }
  }

  throw new Error("招待コードを作成できませんでした。");
}

export async function createFamilyAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect("/setup?error=family_name");
  }

  const family = await prisma.familySpace.create({
    data: {
      name,
      inviteCode: await uniqueInviteCode(),
      createdBy: user.id,
      members: {
        create: {
          userId: user.id,
          role: "admin",
          color: memberColors[0],
        },
      },
      categories: {
        create: [
          { name: "家族", color: "#6BE6D7", sortOrder: 1 },
          { name: "仕事", color: "#6BB7E6", sortOrder: 2 },
          { name: "学校", color: "#96A0ED", sortOrder: 3 },
          { name: "病院", color: "#E66B79", sortOrder: 4 },
        ],
      },
    },
  });

  redirect(`/calendar?family=${family.id}`);
}

export async function joinFamilyAction(formData: FormData) {
  const user = await requireUser();
  const inviteCode = String(formData.get("inviteCode") ?? "").trim().toUpperCase();

  if (!inviteCode) {
    redirect("/setup?error=invite_code");
  }

  const family = await prisma.familySpace.findUnique({
    where: { inviteCode },
    include: {
      members: true,
    },
  });

  if (!family) {
    redirect("/setup?error=invite_not_found");
  }

  const existing = family.members.find((member) => member.userId === user.id);

  if (!existing) {
    await prisma.familyMember.create({
      data: {
        familySpaceId: family.id,
        userId: user.id,
        role: "member",
        color: memberColors[family.members.length % memberColors.length],
      },
    });
  }

  redirect(`/calendar?family=${family.id}`);
}
