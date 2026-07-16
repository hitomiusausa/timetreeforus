"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/session";
import { joinFamilyByInviteCode } from "@/lib/families";
import { prisma } from "@/lib/prisma";

function readRequired(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

const loginWindowMs = 15 * 60 * 1000;
const maxLoginFailures = 5;

async function isLoginLocked(loginId: string) {
  const throttle = await prisma.loginThrottle.findUnique({ where: { loginId } });
  return Boolean(throttle?.lockedUntil && throttle.lockedUntil > new Date());
}

async function recordFailedLogin(loginId: string) {
  const now = new Date();
  const existing = await prisma.loginThrottle.findUnique({ where: { loginId } });
  const windowExpired = !existing || existing.firstFailedAt.getTime() < now.getTime() - loginWindowMs;
  const failedCount = windowExpired ? 1 : existing.failedCount + 1;

  await prisma.loginThrottle.upsert({
    where: { loginId },
    create: {
      loginId,
      failedCount,
      firstFailedAt: now,
      lockedUntil: failedCount >= maxLoginFailures ? new Date(now.getTime() + loginWindowMs) : null,
    },
    update: {
      failedCount,
      firstFailedAt: windowExpired ? now : existing.firstFailedAt,
      lockedUntil: failedCount >= maxLoginFailures ? new Date(now.getTime() + loginWindowMs) : null,
    },
  });
}

export async function registerAction(formData: FormData) {
  const displayName = readRequired(formData, "displayName");
  const loginId = readRequired(formData, "loginId");
  const password = readRequired(formData, "password");
  const passwordConfirm = readRequired(formData, "passwordConfirm");
  const inviteCode = String(formData.get("inviteCode") ?? "").trim().toUpperCase();
  const inviteQuery = inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : "";

  if (password.length < 8) {
    redirect(`/register?error=short_password${inviteQuery}`);
  }

  if (password !== passwordConfirm) {
    redirect(`/register?error=password_mismatch${inviteQuery}`);
  }

  const exists = await prisma.user.findUnique({
    where: { loginId },
  });

  if (exists) {
    redirect(`/register?error=login_taken${inviteQuery}`);
  }

  const user = await prisma.user.create({
    data: {
      displayName,
      loginId,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  await createSession(user.id);

  if (inviteCode) {
    const family = await joinFamilyByInviteCode(user.id, inviteCode);

    if (!family) {
      redirect("/setup?error=invite_not_found");
    }

    redirect(`/calendar?family=${family.id}`);
  }

  redirect("/setup");
}

export async function loginAction(formData: FormData) {
  const loginId = readRequired(formData, "loginId");
  const password = readRequired(formData, "password");
  const inviteCode = String(formData.get("inviteCode") ?? "").trim().toUpperCase();
  const inviteQuery = inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : "";

  if (await isLoginLocked(loginId)) {
    redirect(`/login?error=locked${inviteQuery}`);
  }

  const user = await prisma.user.findUnique({
    where: { loginId },
  });

  if (!user) {
    await recordFailedLogin(loginId);
    redirect(`/login?error=invalid${inviteQuery}`);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    await recordFailedLogin(loginId);
    redirect(`/login?error=invalid${inviteQuery}`);
  }

  await prisma.loginThrottle.deleteMany({ where: { loginId } });

  await createSession(user.id);

  if (inviteCode) {
    const family = await joinFamilyByInviteCode(user.id, inviteCode);

    if (!family) {
      redirect("/setup?error=invite_not_found");
    }

    redirect(`/calendar?family=${family.id}`);
  }

  const membership = await prisma.familyMember.findFirst({
    where: { userId: user.id, familySpace: { archivedAt: null } },
    orderBy: { createdAt: "asc" },
  });

  redirect(membership ? "/calendar" : "/setup");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
