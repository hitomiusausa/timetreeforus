# Time tree for Us 設計メモ

## 目的

TimeTreeのように、家族が同じカレンダーを見ながら予定を共有できるWebアプリを作る。
iOSアプリに依存せず、スマホのブラウザからすぐ使えることを重視する。

## 参考にする体験

TimeTreeの公開情報では、次の体験が中心になっている。

- グループごとに共有カレンダーを作れる
- カレンダーへ招待して、家族やグループで予定を共有できる
- 複数カレンダーをフィルターして表示できる
- 予定にファイル添付、縦表示、重要予定のピン留めなどの拡張機能がある

このアプリでは、まず「家族で手軽に使える」ことを優先し、複雑な公開カレンダーや課金機能は入れない。

## 想定ユーザー

- 家族の代表者: 最初に家族スペースを作り、家族メンバーを招待する
- 家族メンバー: 自分や家族の予定を追加・確認する
- 子どもや高齢の家族: 予定を見るだけ、または簡単な入力だけできればよい

## MVPで作るもの

### 認証

- IDとパスワードでログイン
- ユーザー登録
- ログアウト
- パスワードはハッシュ化して保存
- ログイン後は自分が参加している家族スペースだけ見える

### 家族スペース

- 家族スペースを作成
- 家族スペースにメンバーを招待
- 招待コードで参加
- メンバーごとに表示色を設定
- 権限は最初は2種類
  - 管理者: メンバー招待、削除、家族設定変更
  - メンバー: 予定の作成、編集、閲覧

### カレンダー

- 月表示
- 週表示
- 日表示
- 今日へ戻る
- 前月・翌月、前週・翌週へ移動
- 家族全員の予定をまとめて表示
- 担当者・作成者・カテゴリでフィルター

### 予定

- 予定作成
- 予定編集
- 予定削除
- タイトル
- 開始日時
- 終了日時
- 終日予定
- 場所
- メモ
- 担当者
- 色またはカテゴリ
- 繰り返し予定はMVP後半で対応

### コメント

- 予定ごとに短いコメントを投稿
- 「了解」「行ける」「あとで確認」など、家族内の軽いやりとりに使う

### 通知

MVPではアプリ内通知から始める。

- 新しい予定が追加された
- 自分が担当者になった
- 予定にコメントがついた

メール通知、プッシュ通知、LINE連携は後続候補。

## MVPでは作らないもの

- ネイティブiOS/Androidアプリ
- 課金機能
- 公開カレンダー
- 外部カレンダー同期
- ファイル添付
- 複雑な権限管理
- 共有URLだけで誰でも見られる公開ページ

## 画面設計

### 1. ログイン画面

- アプリ名
- ID入力
- パスワード入力
- ログインボタン
- 新規登録へのリンク

### 2. 新規登録画面

- 名前
- ログインID
- パスワード
- パスワード確認
- 登録ボタン

### 3. 初回セットアップ画面

ログイン後、参加中の家族スペースがない場合に表示する。

- 家族スペースを作る
- 招待コードで参加する

### 4. メインカレンダー画面

スマホ優先で作る。

- 上部: 家族スペース名、今日ボタン、表示切替
- 中央: 月/週/日のカレンダー
- 下部または右下: 予定追加ボタン
- サイドパネルまたはメニュー: メンバー、カテゴリ、設定

### 5. 予定詳細画面

- タイトル
- 日時
- 場所
- 担当者
- メモ
- コメント一覧
- 編集ボタン
- 削除ボタン

### 6. 予定作成・編集画面

- タイトル
- 日付
- 開始時刻
- 終了時刻
- 終日
- 担当者
- カテゴリ
- 場所
- メモ
- 保存
- キャンセル

### 7. 家族設定画面

- 家族スペース名
- メンバー一覧
- 招待コード発行
- メンバー色変更
- メンバー削除

## データ設計

### users

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| login_id | text | ログイン用ID、一意 |
| password_hash | text | パスワードハッシュ |
| display_name | text | 表示名 |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |

### family_spaces

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| name | text | 家族スペース名 |
| invite_code | text | 招待コード |
| created_by | uuid | 作成者 |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |

### family_members

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| family_space_id | uuid | 家族スペース |
| user_id | uuid | ユーザー |
| role | text | admin/member |
| color | text | 表示色 |
| created_at | timestamp | 作成日時 |

### event_categories

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| family_space_id | uuid | 家族スペース |
| name | text | 例: 学校、仕事、病院、旅行 |
| color | text | 表示色 |
| sort_order | integer | 表示順 |

### events

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| family_space_id | uuid | 家族スペース |
| category_id | uuid | カテゴリ |
| title | text | 予定名 |
| starts_at | timestamp | 開始日時 |
| ends_at | timestamp | 終了日時 |
| is_all_day | boolean | 終日予定 |
| location | text | 場所 |
| note | text | メモ |
| created_by | uuid | 作成者 |
| assigned_to | uuid | 担当者、任意 |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |
| deleted_at | timestamp | 論理削除 |

### event_comments

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| event_id | uuid | 予定 |
| user_id | uuid | 投稿者 |
| body | text | コメント本文 |
| created_at | timestamp | 作成日時 |

### notifications

| column | type | note |
| --- | --- | --- |
| id | uuid | 主キー |
| user_id | uuid | 通知先 |
| family_space_id | uuid | 家族スペース |
| event_id | uuid | 関連予定、任意 |
| type | text | event_created/comment_added/assigned |
| title | text | 通知タイトル |
| read_at | timestamp | 既読日時 |
| created_at | timestamp | 作成日時 |

## 技術方針

### 推奨構成

- フロントエンド/バックエンド: Next.js
- 言語: TypeScript
- UI: Tailwind CSS
- DB: PostgreSQL
- ORM: Prisma
- 認証: Auth.js、または自前のセッション認証
- デプロイ候補: Vercel + Neon/Supabase Postgres

### 理由

- WebアプリとしてスマホとPCの両方に対応しやすい
- Next.jsなら画面とAPIを同じプロジェクトで管理できる
- PostgreSQLは家族、メンバー、予定、コメントの関係を扱いやすい
- Prismaを使うとDB設計をコード化しやすく、後から変更しやすい

### 代替案

小さく早く作る場合は Supabase を使う。

- 認証、DB、リアルタイム更新をまとめて扱える
- ただしID/パスワード認証や権限設計をどう見せるかは少し調整が必要

今回は「自由に作り込めること」と「家族向けにシンプルなログイン体験」を優先して、Next.js + PostgreSQL + Prismaを第一候補にする。

## API設計

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Family

- `GET /api/families`
- `POST /api/families`
- `GET /api/families/:familyId`
- `PATCH /api/families/:familyId`
- `POST /api/families/join`
- `POST /api/families/:familyId/invite-code`

### Members

- `GET /api/families/:familyId/members`
- `PATCH /api/families/:familyId/members/:memberId`
- `DELETE /api/families/:familyId/members/:memberId`

### Events

- `GET /api/families/:familyId/events?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/families/:familyId/events`
- `GET /api/families/:familyId/events/:eventId`
- `PATCH /api/families/:familyId/events/:eventId`
- `DELETE /api/families/:familyId/events/:eventId`

### Comments

- `GET /api/families/:familyId/events/:eventId/comments`
- `POST /api/families/:familyId/events/:eventId/comments`

### Notifications

- `GET /api/notifications`
- `POST /api/notifications/:notificationId/read`

## 権限ルール

- ログインしていないユーザーはアプリ画面/APIにアクセスできない
- 家族スペースに参加していないユーザーは、その家族スペースの予定を読めない
- メンバーは予定を作成できる
- 予定の編集は、MVPでは家族スペースの全メンバーが可能
- メンバー削除、招待コード再発行は管理者だけ可能

## UI方針

- スマホで片手操作しやすい
- 予定追加ボタンは常に見つけやすくする
- 色はメンバー色とカテゴリ色を使うが、画面全体は落ち着かせる
- 家族向けなので、エラー文言や確認文言はやわらかく短くする
- 文字サイズは小さくしすぎない
- 月表示では情報を詰め込みすぎず、タップでその日の予定一覧を見せる

## 実装フェーズ

### Phase 1: 土台

- Next.jsプロジェクト作成
- TypeScript/Tailwind/Prisma設定
- PostgreSQL接続
- 基本レイアウト

### Phase 2: 認証

- ユーザー登録
- ログイン
- ログアウト
- セッション保護

### Phase 3: 家族スペース

- 家族スペース作成
- 招待コード参加
- メンバー一覧

### Phase 4: カレンダーMVP

- 月表示
- 予定作成
- 予定編集
- 予定削除
- 日付範囲で予定取得

### Phase 5: 共有体験

- 担当者設定
- カテゴリ設定
- コメント
- アプリ内通知

### Phase 6: 使いやすさ改善

- 週表示
- 日表示
- フィルター
- レスポンシブ調整
- 入力補助

### Phase 7: 将来拡張

- 繰り返し予定
- メール通知
- PWA化
- 外部カレンダー取り込み
- ファイル添付
- 予定検索

## 最初に決めたいこと

実装に入る前に、次の方針を決めると迷いが減る。

1. ログインIDはメールアドレスにするか、任意のIDにするか
2. 最初の家族スペースは1つだけ想定するか、複数家族/グループを扱うか
3. 予定の編集は誰でも可能にするか、作成者と管理者だけにするか
4. 通知は最初はアプリ内だけでよいか
5. デプロイ先はVercel想定でよいか

## 初期判断

迷ったら、最初は次で進める。

- ログインIDは任意ID
- 家族スペースは複数対応できる設計にする
- 予定編集は家族メンバー全員が可能
- 通知はアプリ内のみ
- デプロイはVercel + PostgreSQL

