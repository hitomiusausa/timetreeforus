"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function readRequired(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export async function registerAction(formData: FormData) {
  const displayName = readRequired(formData, "displayName");
  const loginId = readRequired(formData, "loginId");
  const password = readRequired(formData, "password");
  const passwordConfirm = readRequired(formData, "passwordConfirm");

  if (password.length < 8) {
    redirect("/register?error=short_password");
  }

  if (password !== passwordConfirm) {
    redirect("/register?error=password_mismatch");
  }

  const exists = await prisma.user.findUnique({
    where: { loginId },
  });

  if (exists) {
    redirect("/register?error=login_taken");
  }

  const user = await prisma.user.create({
    data: {
      displayName,
      loginId,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  await createSession(user.id);
  redirect("/setup");
}

export async function loginAction(formData: FormData) {
  const loginId = readRequired(formData, "loginId");
  const password = readRequired(formData, "password");

  const user = await prisma.user.findUnique({
    where: { loginId },
  });

  if (!user) {
    redirect("/login?error=invalid");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    redirect("/login?error=invalid");
  }

  await createSession(user.id);

  const membership = await prisma.familyMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  redirect(membership ? "/calendar" : "/setup");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

