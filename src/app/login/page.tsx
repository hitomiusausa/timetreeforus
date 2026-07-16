import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/session";

const errorMessages: Record<string, string> = {
  invalid: "IDまたはパスワードが違います。",
  locked: "ログイン試行が多すぎます。15分ほど待ってから再度お試しください。",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; invite?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.memberships.some((membership) => membership.familySpace.archivedAt === null) ? "/calendar" : "/setup");
  }

  const params = await searchParams;
  const inviteCode = params.invite?.trim().toUpperCase() ?? "";
  const error = params.error ? errorMessages[params.error] : null;
  const registerHref = inviteCode ? `/register?invite=${encodeURIComponent(inviteCode)}` : "/register";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Image className="brand-logo" src="/logo.webp" alt="" width={52} height={52} priority />
          </div>
          <div>
            <p className="eyebrow">Family calendar</p>
            <h1>Time tree for Us</h1>
          </div>
        </div>

        <form action={loginAction} className="form-stack">
          {inviteCode ? <input type="hidden" name="inviteCode" value={inviteCode} /> : null}

          <div>
            <label htmlFor="loginId">ログインID</label>
            <input id="loginId" name="loginId" autoComplete="username" required />
          </div>

          <div>
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit">
            ログイン
          </button>
        </form>

        <p className="auth-link">
          はじめて使う場合は <Link href={registerHref}>新規登録</Link>
        </p>
      </section>
    </main>
  );
}
