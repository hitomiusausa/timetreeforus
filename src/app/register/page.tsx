import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/session";

const errorMessages: Record<string, string> = {
  short_password: "パスワードは8文字以上にしてください。",
  password_mismatch: "確認用パスワードが一致していません。",
  login_taken: "このログインIDはすでに使われています。",
};

type RegisterPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
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
            <Image className="brand-logo" src="/logo.webp" alt="" width={52} height={52} priority />
          </div>
          <div>
            <p className="eyebrow">Create account</p>
            <h1>家族用アカウントを作成</h1>
          </div>
        </div>

        <form action={registerAction} className="form-stack">
          <div>
            <label htmlFor="displayName">表示名</label>
            <input id="displayName" name="displayName" autoComplete="name" required />
          </div>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div>
            <label htmlFor="passwordConfirm">パスワード確認</label>
            <input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit">
            登録して始める
          </button>
        </form>

        <p className="auth-link">
          すでにアカウントがある場合は <Link href="/login">ログイン</Link>
        </p>
      </section>
    </main>
  );
}
