"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureFamilyMember, makeInviteCode } from "@/lib/families";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const memberColors = ["#52DE3F", "#6BE69A", "#6BE6D7", "#6BB7E6", "#96A0ED", "#E66B79"];
const defaultCategories = [
  { name: "家族", color: "#6BE6D7", sortOrder: 1 },
  { name: "仕事", color: "#6BB7E6", sortOrder: 2 },
  { name: "学校", color: "#96A0ED", sortOrder: 3 },
  { name: "病院", color: "#E66B79", sortOrder: 4 },
  { name: "友達", color: "#52DE3F", sortOrder: 5 },
  { name: "趣味仲間", color: "#96A0ED", sortOrder: 6 },
];

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
        create: defaultCategories,
      },
    },
  });

  redirect(`/calendar?family=${family.id}`);
}

export async function createCalendarAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const currentFamilySpaceId = String(formData.get("currentFamilySpaceId") ?? "");

  if (!name) {
    redirect(`/calendar${currentFamilySpaceId ? `?family=${currentFamilySpaceId}` : ""}`);
  }

  const existingMemberships = await prisma.familyMember.count({
    where: {
      userId: user.id,
    },
  });

  const family = await prisma.familySpace.create({
    data: {
      name,
      inviteCode: await uniqueInviteCode(),
      createdBy: user.id,
      members: {
        create: {
          userId: user.id,
          role: "admin",
          color: memberColors[existingMemberships % memberColors.length],
        },
      },
      categories: {
        create: defaultCategories,
      },
    },
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${family.id}`);
}

export async function updateCalendarNameAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const currentFamilySpaceId = String(formData.get("currentFamilySpaceId") ?? familySpaceId);
  const name = String(formData.get("name") ?? "").trim();
  const redirectFamilyId = currentFamilySpaceId || familySpaceId;

  if (!familySpaceId || !name) {
    redirect(`/calendar${redirectFamilyId ? `?family=${redirectFamilyId}` : ""}`);
  }

  const adminMembership = await prisma.familyMember.findFirst({
    where: {
      familySpaceId,
      userId: user.id,
      role: "admin",
    },
  });

  if (!adminMembership) {
    redirect(`/calendar?family=${redirectFamilyId}`);
  }

  await prisma.familySpace.update({
    where: {
      id: familySpaceId,
    },
    data: {
      name,
    },
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${redirectFamilyId}`);
}

export async function deleteCalendarAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const currentFamilySpaceId = String(formData.get("currentFamilySpaceId") ?? familySpaceId);
  const confirm = String(formData.get("confirmDelete") ?? "").trim();
  const redirectFamilyId = currentFamilySpaceId || familySpaceId;

  if (!familySpaceId || confirm !== "削除") {
    redirect(`/calendar${redirectFamilyId ? `?family=${redirectFamilyId}` : ""}`);
  }

  const adminMembership = await prisma.familyMember.findFirst({
    where: {
      familySpaceId,
      userId: user.id,
      role: "admin",
    },
  });

  if (!adminMembership) {
    redirect(`/calendar?family=${redirectFamilyId}`);
  }

  const nextMembership = await prisma.familyMember.findFirst({
    where: {
      userId: user.id,
      familySpaceId: {
        not: familySpaceId,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  await prisma.familySpace.delete({
    where: {
      id: familySpaceId,
    },
  });

  revalidatePath("/calendar");
  redirect(nextMembership ? `/calendar?family=${nextMembership.familySpaceId}` : "/setup");
}

export async function createTitlePresetAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!familySpaceId || !name) {
    redirect(`/calendar${familySpaceId ? `?family=${familySpaceId}` : ""}`);
  }

  await ensureFamilyMember(user.id, familySpaceId);

  const existingPreset = await prisma.eventTitlePreset.findFirst({
    where: {
      familySpaceId,
      name,
    },
    select: {
      id: true,
    },
  });

  if (!existingPreset) {
    const maxSortOrder = await prisma.eventTitlePreset.aggregate({
      where: {
        familySpaceId,
      },
      _max: {
        sortOrder: true,
      },
    });

    await prisma.eventTitlePreset.create({
      data: {
        familySpaceId,
        name,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
        createdBy: user.id,
      },
    });
  }

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}`);
}

export async function deleteTitlePresetAction(formData: FormData) {
  const user = await requireUser();
  const familySpaceId = String(formData.get("familySpaceId") ?? "");
  const titlePresetId = String(formData.get("titlePresetId") ?? "");

  if (!familySpaceId || !titlePresetId) {
    redirect(`/calendar${familySpaceId ? `?family=${familySpaceId}` : ""}`);
  }

  await ensureFamilyMember(user.id, familySpaceId);

  await prisma.eventTitlePreset.deleteMany({
    where: {
      id: titlePresetId,
      familySpaceId,
    },
  });

  revalidatePath("/calendar");
  redirect(`/calendar?family=${familySpaceId}`);
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
