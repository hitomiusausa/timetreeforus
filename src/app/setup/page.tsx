import { redirect } from "next/navigation";
import { Home, KeyRound } from "lucide-react";
import { createFamilyAction, joinFamilyAction } from "@/app/actions/family";
import { requireUser } from "@/lib/session";

const errorMessages: Record<string, string> = {
  family_name: "家族スペース名を入力してください。",
  invite_code: "招待コードを入力してください。",
  invite_not_found: "招待コードが見つかりませんでした。",
};

type SetupPageProps = {
  searchParams: Promise<{ error?: string; invite?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const user = await requireUser();

  if (user.memberships.length > 0) {
    redirect("/calendar");
  }

  const params = await searchParams;
  const inviteCode = params.invite?.trim().toUpperCase() ?? "";
  const error = params.error ? errorMessages[params.error] : null;

  return (
    <main className="setup-shell">
      <section className="setup-header">
        <p className="eyebrow">Welcome, {user.displayName}</p>
        <h1>家族スペースを準備しましょう</h1>
      </section>

      {error ? <p className="setup-error">{error}</p> : null}

      <div className="setup-grid">
        <section className="setup-card">
          <Home aria-hidden="true" size={30} />
          <h2>新しく作る</h2>
          <form action={createFamilyAction} className="form-stack">
            <div>
              <label htmlFor="name">家族スペース名</label>
              <input id="name" name="name" placeholder="例: 佐藤家" required />
            </div>
            <button className="primary-button" type="submit">
              家族スペースを作成
            </button>
          </form>
        </section>

        <section className="setup-card">
          <KeyRound aria-hidden="true" size={30} />
          <h2>招待コードで参加</h2>
          <form action={joinFamilyAction} className="form-stack">
            <div>
              <label htmlFor="inviteCode">招待コード</label>
              <input
                id="inviteCode"
                name="inviteCode"
                placeholder="例: AB12CD34"
                autoCapitalize="characters"
                defaultValue={inviteCode}
                required
              />
            </div>
            <button className="secondary-button" type="submit">
              参加する
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
