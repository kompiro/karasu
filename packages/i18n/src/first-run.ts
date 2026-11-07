/**
 * Phrases of the web app's first-run Welcome and guided tour (#3563), kept
 * apart from `types.ts` / `en.ts` / `ja.ts` so the catalog files stay inside
 * their line budget. They are spread into `en` and `ja` at one place, so the
 * key order of the two catalogs still matches (catalog.test.ts).
 */

export type FirstRunTranslations = {
  "firstRun.welcome.title": string;
  "firstRun.welcome.subtitle": string;
  "firstRun.welcome.question": string;
  "firstRun.welcome.design.title": string;
  "firstRun.welcome.design.description": string;
  "firstRun.welcome.design.badge": string;
  "firstRun.welcome.understand.title": string;
  "firstRun.welcome.understand.description": string;
  "firstRun.welcome.understand.badge": string;
  "firstRun.welcome.evolve.title": string;
  "firstRun.welcome.evolve.description": string;
  "firstRun.welcome.evolve.badge": string;
  "firstRun.welcome.openEditor": string;
  "firstRun.welcome.footnote": string;
  "firstRun.tour.ariaLabel": string;
  "firstRun.tour.progress": (params: { current: number; total: number }) => string;
  "firstRun.tour.progressLabel": string;
  "firstRun.tour.skip": string;
  "firstRun.tour.back": string;
  "firstRun.tour.next": string;
  "firstRun.tour.finish": string;
  "firstRun.tour.notice": string;
  "firstRun.tour.stepDone": string;
  "firstRun.step.current.title": string;
  "firstRun.step.current.body": string;
  "firstRun.step.current.notice": string;
  "firstRun.step.org.title": string;
  "firstRun.step.org.body": string;
  "firstRun.step.org.notice": string;
  "firstRun.step.target.title": string;
  "firstRun.step.target.body": string;
  "firstRun.step.target.notice": string;
  "firstRun.step.decision.title": string;
  "firstRun.step.decision.body": string;
  "firstRun.step.decision.questions": string;
  "firstRun.step.decision.q1": string;
  "firstRun.step.decision.q2": string;
  "firstRun.step.decision.q3": string;
  "firstRun.step.decision.q4": string;
  "firstRun.step.share.title": string;
  "firstRun.step.share.body": string;
  "firstRun.step.share.done": string;
  "firstRun.understand.system.title": string;
  "firstRun.understand.system.body": string;
  "firstRun.understand.system.notice": string;
  "firstRun.understand.deploy.title": string;
  "firstRun.understand.deploy.body": string;
  "firstRun.understand.deploy.notice": string;
  "firstRun.understand.org.title": string;
  "firstRun.understand.org.body": string;
  "firstRun.understand.org.notice": string;
  "firstRun.understand.done": string;
  "firstRun.evolve.diff.title": string;
  "firstRun.evolve.diff.body": string;
  "firstRun.evolve.diff.notice": string;
  "firstRun.evolve.marks.title": string;
  "firstRun.evolve.marks.body": string;
  "firstRun.evolve.marks.notice": string;
  "firstRun.evolve.remaining.title": string;
  "firstRun.evolve.remaining.body": string;
  "firstRun.evolve.remaining.notice": string;
  "firstRun.evolve.done": string;
};

export const firstRunEn: FirstRunTranslations = {
  "firstRun.welcome.title": "Build a shared understanding of your architecture.",
  "firstRun.welcome.subtitle":
    "Explore your system, align your team, and evolve your architecture together.",
  "firstRun.welcome.question": "What would you like to do?",
  "firstRun.welcome.design.title": "Design a service split",
  "firstRun.welcome.design.description":
    "Explore boundaries and ownership with a five-minute guide.",
  "firstRun.welcome.design.badge": "Guided · 5 min",
  "firstRun.welcome.understand.title": "Understand an existing system",
  "firstRun.welcome.understand.description":
    "Read a sample platform's structure, deployment and ownership with a three-minute guide.",
  "firstRun.welcome.understand.badge": "Guided · 3 min",
  "firstRun.welcome.evolve.title": "Track architecture evolution",
  "firstRun.welcome.evolve.description":
    "Follow a migration in progress with a three-minute guide: where it stands and what is left.",
  "firstRun.welcome.evolve.badge": "Guided · 3 min",
  "firstRun.welcome.openEditor": "✎ Open the editor",
  "firstRun.welcome.footnote":
    "No account or install needed. Samples open as new projects, and your own projects stay as they are.",
  "firstRun.tour.ariaLabel": "Guided tour",
  "firstRun.tour.progress": ({ current, total }) => `${current} / ${total}`,
  "firstRun.tour.progressLabel": "Tour progress",
  "firstRun.tour.skip": "✕ Skip tour",
  "firstRun.tour.back": "← Back",
  "firstRun.tour.next": "Next →",
  "firstRun.tour.finish": "✓ Continue to editor",
  "firstRun.tour.notice": "Notice",
  "firstRun.tour.stepDone": "✓ Done. Look around as long as you like, then move on.",
  "firstRun.step.current.title": "Explore the current architecture",
  "firstRun.step.current.body":
    "This is your current system. Click Commerce Application to open it and see the domains inside.",
  "firstRun.step.current.notice":
    "Ordering and Billing are separate domains, yet they live in one service and share one database.",
  "firstRun.step.org.title": "Discover organizational boundaries",
  "firstRun.step.org.body":
    "Architecture is not only about services. The Org view shows which team owns each part of the system. Turn on Dependencies to see which teams depend on each other.",
  "firstRun.step.org.notice":
    "The Billing Team owns the Billing domain, but the service it runs in belongs to the Commerce Team.",
  "firstRun.step.target.title": "Explore the target architecture",
  "firstRun.step.target.body":
    "What if Billing became an independent service? This is the planned architecture, compared with the current one: added parts are green, removed parts are red.",
  "firstRun.step.target.notice":
    "Splitting the service also means moving the billing data and changing who calls whom.",
  "firstRun.step.decision.title": "Make a design decision",
  "firstRun.step.decision.body":
    "Architecture decisions involve trade-offs. This is the state in between: Billing Service runs, but still uses the shared database, and its own database is only planned.",
  "firstRun.step.decision.questions": "Questions for your team",
  "firstRun.step.decision.q1": "What does an independent Billing Service improve?",
  "firstRun.step.decision.q2": "Can the shared database stay for now?",
  "firstRun.step.decision.q3": "Which team owns the migration?",
  "firstRun.step.decision.q4": "When do we call the migration done?",
  "firstRun.step.share.title": "Share your understanding",
  "firstRun.step.share.body":
    "Decisions work better when everyone shares the same context. Use Share in the toolbar to copy a link to this model, or Export SVG to put the diagram in a document.",
  "firstRun.step.share.done":
    "You have explored an architecture decision with karasu. Next, model your own system, draw its target, and compare the two.",
  "firstRun.understand.system.title": "See the whole system",
  "firstRun.understand.system.body":
    "One diagram shows who uses the system and what it is made of. Click EC Site to open it and see the domains inside.",
  "firstRun.understand.system.notice": "Product Catalog and Orders depend on each other.",
  "firstRun.understand.deploy.title": "See how it runs",
  "firstRun.understand.deploy.body":
    "The Deploy view shows the same system by how it runs: what is deployed, and on what.",
  "firstRun.understand.deploy.notice":
    "Only EC Site and Notification are run here. Payment and Inventory are external services.",
  "firstRun.understand.org.title": "See who owns what",
  "firstRun.understand.org.body": "The Org view shows the same system by who owns it.",
  "firstRun.understand.org.notice":
    "The Notification team owns nothing here: the Notification service belongs to the Commerce team.",
  "firstRun.understand.done":
    "You have read a system from three sides with karasu. Next, model your own system and see what it tells your team.",
  "firstRun.evolve.diff.title": "Compare the migration with today",
  "firstRun.evolve.diff.body":
    "This is a migration in progress, compared with today's system: added parts are green, removed parts are red.",
  "firstRun.evolve.diff.notice":
    "Billing Service has appeared, and the Billing domain has left Commerce Application.",
  "firstRun.evolve.marks.title": "Read the migration in the model",
  "firstRun.evolve.marks.body":
    "The model itself says where the migration stands: Billing Database is marked as planned. Click Commerce Database to open it and see its tables.",
  "firstRun.evolve.marks.notice":
    "The billing tables are marked deprecated, and the database they will move to is only planned.",
  "firstRun.evolve.remaining.title": "See what is left",
  "firstRun.evolve.remaining.body":
    "This compares the target with the migration: the difference is the work still to do.",
  "firstRun.evolve.remaining.notice":
    "What is left is moving the data: the billing tables go to Billing Database.",
  "firstRun.evolve.done":
    "You have followed a migration with karasu. Next, record your own as a current, an in-between and a target model, and compare them.",
};

export const firstRunJa: Partial<FirstRunTranslations> = {
  "firstRun.welcome.title": "システムの構造を共有し、チームでより良い設計判断を。",
  "firstRun.welcome.subtitle":
    "現状を理解し、将来像を描き、変化を追いながら、チームの共通理解を育てる。",
  "firstRun.welcome.question": "何から始めますか？",
  "firstRun.welcome.design.title": "サービス分割を設計する",
  "firstRun.welcome.design.description": "境界と所有を、5 分のガイドで見ていきます。",
  "firstRun.welcome.design.badge": "ガイド付き · 5 分",
  "firstRun.welcome.understand.title": "既存のシステムを理解する",
  "firstRun.welcome.understand.description":
    "サンプルのプラットフォームの構造・配置・所有を、3 分のガイドで見ていきます。",
  "firstRun.welcome.understand.badge": "ガイド付き · 3 分",
  "firstRun.welcome.evolve.title": "アーキテクチャの変化を追う",
  "firstRun.welcome.evolve.description":
    "進行中の移行の現在地と残りの仕事を、3 分のガイドで見ていきます。",
  "firstRun.welcome.evolve.badge": "ガイド付き · 3 分",
  "firstRun.welcome.openEditor": "✎ エディタを開く",
  "firstRun.welcome.footnote":
    "アカウントもインストールも不要です。サンプルは新しいプロジェクトとして開き、既存のプロジェクトはそのまま残ります。",
  "firstRun.tour.ariaLabel": "ガイドツアー",
  "firstRun.tour.progress": ({ current, total }) => `${current} / ${total}`,
  "firstRun.tour.progressLabel": "ツアーの進み具合",
  "firstRun.tour.skip": "✕ ツアーを終了",
  "firstRun.tour.back": "← 戻る",
  "firstRun.tour.next": "次へ →",
  "firstRun.tour.finish": "✓ エディタに進む",
  "firstRun.tour.notice": "気づき",
  "firstRun.tour.stepDone": "✓ できました。好きなだけ見てから、先へ進んでください。",
  "firstRun.step.current.title": "現在のアーキテクチャを見る",
  "firstRun.step.current.body":
    "これが現在のシステムです。コマースアプリケーションをクリックして、中にあるドメインを見てください。",
  "firstRun.step.current.notice":
    "注文と請求は別のドメインなのに、1 つのサービスに同居し、1 つのデータベースを共有しています。",
  "firstRun.step.org.title": "組織の境界を見る",
  "firstRun.step.org.body":
    "アーキテクチャはサービスだけではありません。Org ビューは、システムのどこをどのチームが持っているかを示します。「チーム依存」をオンにすると、チーム間の依存が見えます。",
  "firstRun.step.org.notice":
    "請求チームは請求ドメインを持っていますが、それが動くサービスはコマースチームのものです。",
  "firstRun.step.target.title": "目標のアーキテクチャを見る",
  "firstRun.step.target.body":
    "請求が独立したサービスになったら？これは計画中のアーキテクチャを現在と比べたものです。追加は緑、削除は赤で示されます。",
  "firstRun.step.target.notice":
    "サービスを分けるには、請求のデータを移し、呼び出しの向きも変える必要があります。",
  "firstRun.step.decision.title": "設計判断をする",
  "firstRun.step.decision.body":
    "設計判断にはトレードオフがあります。これは移行途中の状態です。請求サービスは動いていますが、まだ共有データベースを使っており、専用のデータベースは計画だけです。",
  "firstRun.step.decision.questions": "チームで話し合う問い",
  "firstRun.step.decision.q1": "請求サービスの独立は、何を改善するのか？",
  "firstRun.step.decision.q2": "共有データベースを当面残してよいか？",
  "firstRun.step.decision.q3": "移行はどのチームが担うのか？",
  "firstRun.step.decision.q4": "どの状態になれば移行完了と言えるか？",
  "firstRun.step.share.title": "理解を共有する",
  "firstRun.step.share.body":
    "全員が同じ前提を持つと、判断はうまくいきます。ツールバーの「Share」でこのモデルへのリンクをコピーするか、「SVG をエクスポート」で図を文書に貼れます。",
  "firstRun.step.share.done":
    "karasu で設計判断をひととおり見ました。次は、自分のシステムをモデル化し、目標を描いて、2 つを比べてみてください。",
  "firstRun.understand.system.title": "システム全体を見る",
  "firstRun.understand.system.body":
    "1 枚の図で、誰がシステムを使い、何でできているかが分かります。ECサイトをクリックして、中にあるドメインを見てください。",
  "firstRun.understand.system.notice": "商品カタログと注文は互いに依存しています。",
  "firstRun.understand.deploy.title": "どう動いているかを見る",
  "firstRun.understand.deploy.body":
    "Deploy ビューは、同じシステムを動かし方で見せます。何を、どこで動かしているかが分かります。",
  "firstRun.understand.deploy.notice":
    "ここで動かしているのは ECサイトと通知だけです。決済と在庫管理は外部のサービスです。",
  "firstRun.understand.org.title": "誰が持っているかを見る",
  "firstRun.understand.org.body": "Org ビューは、同じシステムを持ち主で見せます。",
  "firstRun.understand.org.notice":
    "通知チームはここでは何も持っておらず、通知サービスはコマースチームのものです。",
  "firstRun.understand.done":
    "karasu でシステムを 3 つの面から読みました。次は、自分のシステムをモデル化して、チームに何が見えるかを確かめてください。",
  "firstRun.evolve.diff.title": "移行を今のシステムと比べる",
  "firstRun.evolve.diff.body":
    "これは進行中の移行を、今のシステムと比べたものです。追加は緑、削除は赤で示されます。",
  "firstRun.evolve.diff.notice":
    "請求サービスができ、請求ドメインはコマースアプリケーションから出ました。",
  "firstRun.evolve.marks.title": "モデルで移行を読む",
  "firstRun.evolve.marks.body":
    "移行がどこまで進んだかは、モデル自体が語ります。請求DBには計画中の印が付いています。コマースDBをクリックして、テーブルを見てください。",
  "firstRun.evolve.marks.notice":
    "請求のテーブルには廃止予定の印が付き、移る先の DB はまだ計画だけです。",
  "firstRun.evolve.remaining.title": "残りの仕事を見る",
  "firstRun.evolve.remaining.body":
    "目標を移行途中の状態と比べたものです。この差分が、残りの仕事です。",
  "firstRun.evolve.remaining.notice":
    "残っているのはデータの移動です。請求のテーブルが請求DBへ移ります。",
  "firstRun.evolve.done":
    "karasu で移行をひととおり追いました。次は、自分の移行を現在・途中・目標のモデルに残して、比べてみてください。",
};
