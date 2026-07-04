import { redirect } from "next/navigation";
import { joinFamilyByInviteCode } from "@/lib/families";
import { getCurrentUser } from "@/lib/session";

type JoinPageProps = {
  searchParams: Promise<{ invite?: string }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const inviteCode = params.invite?.trim().toUpperCase() ?? "";

  if (!inviteCode) {
    redirect("/setup?error=invite_code");
  }

  const user = await getCurrentUser();
  const inviteQuery = encodeURIComponent(inviteCode);

  if (!user) {
    redirect(`/register?invite=${inviteQuery}`);
  }

  const family = await joinFamilyByInviteCode(user.id, inviteCode);

  if (!family) {
    redirect("/setup?error=invite_not_found");
  }

  redirect(`/calendar?family=${family.id}`);
}
