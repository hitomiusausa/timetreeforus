import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/session";

const errorMessages: Record<string, string> = {
  invalid: "IDまたはパスワードが違います。",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.memberships.length > 0 ? "/calendar" : "/setup");
  }

  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : null;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <CalendarDays aria-hidden="true" size={28} />
          </div>
          <div>
            <p className="eyebrow">Family calendar</p>
            <h1>Time tree for Us</h1>
          </div>
        </div>

        <form action={loginAction} className="form-stack">
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
          はじめて使う場合は <Link href="/register">新規登録</Link>
        </p>
      </section>
    </main>
  );
}

