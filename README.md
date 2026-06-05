# Time tree for Us

家族で予定を共有するためのWebアプリ。

詳細設計は `DESIGN.md` にまとめている。

## 現在の方針

- Webアプリとして作る
- IDとパスワードでログインする
- 家族スペースを作り、招待コードで参加できる
- 月/週/日カレンダーで家族の予定を共有する
- 最初のMVPでは、予定作成・編集・削除、担当者、カテゴリ、コメントを作る

## 実装済み

- Next.jsアプリの土台
- ユーザー登録
- ログイン/ログアウト
- 家族スペース作成
- 招待コード表示
- 月カレンダー表示
- 予定追加
- 予定削除
- 担当者、カテゴリ、場所、メモの保存

## 推奨技術

- Next.js
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma

## 起動方法

```bash
npm install
npm run db:push
npm run dev
```

ブラウザで `http://127.0.0.1:3000` を開く。

## 本番公開

GitHub private repository、Vercel Hobby、Supabase Postgresで公開する想定。

必要な環境変数:

- `DATABASE_URL`: Supabase Postgresの接続文字列

VercelのBuild Commandは標準の `npm run build` でよい。

## 次の作業

1. 予定編集画面を追加する
2. コメント機能を追加する
3. アプリ内通知を追加する
4. 週表示/日表示を追加する
