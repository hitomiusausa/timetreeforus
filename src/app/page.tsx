import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.memberships.some((membership) => membership.familySpace.archivedAt === null)) {
    redirect("/setup");
  }

  redirect("/calendar");
}
