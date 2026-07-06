# Time tree for Us 設計メモ

この文書は、AI・開発者が実装とデザインの判断基準にするための設計メモ。
実装中に判断へ迷ったら、まず「[初期方針（決定済み）](#初期方針決定済み)」に従う。そこにない論点は「複雑さを増やさない側」を選ぶ。

## 目的

TimeTreeのように、家族が同じカレンダーを見ながら予定を共有できるWebアプリを作る。
iOSアプリに依存せず、スマホのブラウザからすぐ使えることを重視する。

TimeTreeの中心体験のうち、このアプリが取り入れるのは次の2つだけ。

- グループ（家族スペース）ごとに共有カレンダーを作れる
- 招待によって家族で予定を共有できる

公開カレンダー・課金・ファイル添付などの拡張機能は取り入れない（→ [MVPでは作らないもの](#mvpでは作らないもの)）。

## 想定ユーザー

- 家族の代表者: 最初に家族スペースを作り、家族メンバーを招待する
- 家族メンバー: 自分や家族の予定を追加・確認する
- 子どもや高齢の家族: 予定を見るだけ、または簡単な入力だけできればよい

3人目のユーザー像が判断基準になる。**「操作に説明が必要な機能は、この時点では入れない」**。

## スコープ

### MVPで作るもの

MVP = Phase 1〜6（→ [実装フェーズ](#実装フェーズ)）。各機能の実装時期はフェーズ表を正とする。

#### 認証

- IDとパスワードでログイン / ログアウト / ユーザー登録
- パスワードはハッシュ化して保存（平文・可逆暗号は不可）
- ログイン後は自分が参加している家族スペースだけ見える

#### 家族スペース

- 家族スペースを作成
- 招待コードの発行と、コード入力による参加
- メンバーごとに表示色を設定
- 権限は admin / member の2種類のみ（→ [権限ルール](#権限ルール)）

#### カレンダー

- 月表示（Phase 4）、週表示・日表示（Phase 6）
- 今日へ戻る / 前月・翌月 / 前週・翌週へ移動
- 家族全員の予定をまとめて表示
- 担当者・作成者・カテゴリでフィルター（Phase 6）

#### 予定

予定の項目: タイトル / 開始日時 / 終了日時 / 終日フラグ / 場所 / メモ / 担当者 / カテゴリ（色）

- 作成・編集・削除ができる
- 繰り返し予定はMVPに含めない（Phase 7）

#### コメント

- 予定ごとに短いコメントを投稿できる
- 用途は「了解」「行ける」「あとで確認」など家族内の軽い返事。スレッド・返信・リアクションは作らない

#### 通知

MVPはアプリ内通知のみ。通知を発生させるイベントは次の3つ。

- 新しい予定が追加された（type: `event_created`）
- 自分が担当者になった（type: `assigned`）
- 予定にコメントがついた（type: `comment_added`）

メール通知・プッシュ通知・LINE連携はPhase 7以降の候補。

### MVPでは作らないもの

実装中に「あると便利そう」と思っても、以下は追加しない。

- ネイティブiOS/Androidアプリ
- 課金機能
- 公開カレンダー、共有URLだけで誰でも見られる公開ページ
- 外部カレンダー同期
- ファイル添付
- admin/member以外のロール、予定単位の細かい権限設定

## 画面設計

### 1. ログイン画面

- アプリ名 / ID入力 / パスワード入力 / ログインボタン / 新規登録へのリンク

### 2. 新規登録画面

- 名前 / ログインID / パスワード / パスワード確認 / 登録ボタン

### 3. 初回セットアップ画面

ログイン後、参加中の家族スペースが0件の場合にのみ表示する。

- 「家族スペースを作る」
- 「招待コードで参加する」

### 4. メインカレンダー画面

スマホ縦持ちを基準にレイアウトする（PCはその拡張として扱う）。

- 上部: 家族スペース名、今日ボタン、表示切替（月/週/日）
- 中央: カレンダー本体
- 右下: 予定追加ボタン（固定表示、→ [UI方針](#ui方針)）
- サイドパネルまたはメニュー: メンバー、カテゴリ、設定

### 5. 予定詳細画面

- タイトル / 日時 / 場所 / 担当者 / メモ / コメント一覧 / 編集ボタン / 削除ボタン

### 6. 予定作成・編集画面

- タイトル / 日付 / 開始時刻 / 終了時刻 / 終日 / 担当者 / カテゴリ / 場所 / メモ / 保存 / キャンセル

### 7. 家族設定画面

- 家族スペース名 / メンバー一覧 / 招待コード発行 / メンバー色変更 / メンバー削除

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
| role | text | admin / member |
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
| type | text | event_created / comment_added / assigned |
| title | text | 通知タイトル |
| read_at | timestamp | 既読日時 |
| created_at | timestamp | 作成日時 |

## 技術構成（決定済み）

- フロントエンド/バックエンド: Next.js（画面とAPIを同一プロジェクトで管理する）
- 言語: TypeScript
- UI: Tailwind CSS
- DB: PostgreSQL
- ORM: Prisma
- 認証: Auth.js、または自前のセッション認証
- デプロイ: Vercel + Neon/Supabase Postgres

Supabase一式（認証・DB・リアルタイムをまとめて使う構成）も検討したが、
「自由に作り込めること」「家族向けのシンプルなID/パスワードログイン」を優先して上記に決定済み。再検討はしない。

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

権限の記述はこの表を唯一の正とする（他の節で権限に触れる場合もこの表に従う）。

| 操作 | 未ログイン | 非メンバー | member | admin |
| --- | --- | --- | --- | --- |
| アプリ画面/APIへのアクセス | × | ログインのみ可 | ○ | ○ |
| 家族スペースの予定の閲覧 | × | × | ○ | ○ |
| 予定の作成・編集・削除 | × | × | ○ | ○ |
| コメント投稿 | × | × | ○ | ○ |
| メンバー招待（招待コード発行・再発行） | × | × | × | ○ |
| メンバー削除 | × | × | × | ○ |
| 家族設定の変更 | × | × | × | ○ |

- 「非メンバー」= ログイン済みだが、その家族スペースに参加していないユーザー
- MVPでは「作成者本人だけが編集できる」制限は入れない。家族の予定はお互いに直せる方が便利、という前提

## UI方針

各項目は「意図」→「判定基準」→「例」の順。迷ったら判定基準を満たす方を選ぶ。

### 片手操作

- 判定基準: タップ対象は44×44px以上。日常操作（予定追加、日付移動、今日へ戻る）は画面の下半分から親指で届く位置に置く
- 良い例: 予定追加は右下の固定ボタン
- 悪い例: 予定追加が画面最上部のメニュー内にだけある

### 予定追加ボタン

- 判定基準: 月/週/日どの表示でも、スクロール位置にかかわらず常に画面内の同じ位置に固定表示されている
- 悪い例: スクロールすると隠れる、特定の表示モードでだけ出る、表示切替でボタンの位置が変わる

### 色の使い方

- 意図: 色は「誰の予定か・何の予定か」を伝える手段。装飾には使わない
- 判定基準: 彩度の高い色を使ってよいのはメンバー色・カテゴリ色（と予定追加ボタン）だけ。背景・罫線・見出しは無彩色または低彩度でまとめる
- 悪い例: ヘッダーやナビゲーション自体をカラフルにして、予定の色と競合させる

### 文言

- 意図: 家族向けなので、エラーや確認は「何が起きたか＋次に何をすればよいか」が分かる、短く責めない文にする
- 判定基準: 1メッセージ1文。エラーコードやシステム用語（認証、不正、無効）を画面に出さない
- 良い例: 「IDかパスワードが違うようです。もう一度入力してください」
- 悪い例: 「認証に失敗しました（401 Unauthorized）。資格情報を確認してください」
- 良い例（削除確認）: 「この予定を削除しますか？」＋「削除する / やめる」
- 悪い例（削除確認）: 「本当によろしいですか？この操作は取り消すことができません。続行しますか？」

### 文字サイズ

- 判定基準: 本文は16px以上。日付ラベルなどの補助情報でも12px未満にしない

### 月表示の情報量

- 意図: 月表示は「その日に何かある」ことが分かれば十分。読むのは日別一覧で行う
- 判定基準: 1日のセルに表示する予定は上限を決め（目安3件）、超えたら「+n件」とだけ出す。セルをタップするとその日の予定一覧を表示する
- 悪い例: セル内に予定タイトルを省略なしで詰め込み、セルの高さが日によってばらばらになる

## 実装フェーズ

### Phase 1: 土台

- Next.jsプロジェクト作成
- TypeScript/Tailwind/Prisma設定
- PostgreSQL接続
- 基本レイアウト

### Phase 2: 認証

- ユーザー登録 / ログイン / ログアウト / セッション保護

### Phase 3: 家族スペース

- 家族スペース作成 / 招待コード参加 / メンバー一覧

### Phase 4: カレンダーMVP

- 月表示
- 予定の作成・編集・削除
- 日付範囲で予定取得

### Phase 5: 共有体験

- 担当者設定 / カテゴリ設定 / コメント / アプリ内通知

### Phase 6: 使いやすさ改善

- 週表示 / 日表示 / フィルター / レスポンシブ調整 / 入力補助

### Phase 7: 将来拡張（MVP対象外）

- 繰り返し予定
- メール通知
- PWA化
- 外部カレンダー取り込み
- ファイル添付
- 予定検索

## 初期方針（決定済み）

実装前に迷いやすい論点は、以下のとおり決定済み。変更する場合はこの表を書き換えてから実装する。

| 論点 | 決定 |
| --- | --- |
| ログインID | メールアドレスではなく任意ID（メールを持たない子どもや高齢の家族でも登録しやすくするため） |
| 家族スペースの数 | 1ユーザーが複数の家族スペースに参加できる設計にする |
| 予定の編集権限 | 家族メンバー全員が編集可能（作成者・管理者に限定しない） |
| 通知 | MVPではアプリ内通知のみ |
| デプロイ先 | Vercel + PostgreSQL |
