# Iron Combat Timeline

Foundry VTT用のスタイリッシュな縦型戦闘タイムラインモジュール。

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![License](https://img.shields.io/badge/license-MIT-green)

## 概要

画面左端にサイバーパンク風デザインの戦闘タイムラインを表示します。標準のCombat Trackerを視覚的に強化し、GM・プレイヤー双方の戦闘体験を向上させます。

## 機能一覧

### 基本機能
- **2種類の表示スタイル** — コンパクト / カード重ね落ち
- **ラウンドカウンター** — 現在のラウンド数を上部に表示
- **HPバー** — ポートレート下部にHP残量をリアルタイム表示（色で段階表示）
- **状態異常アイコン** — アクティブエフェクトをポートレート上に表示
- **集中維持マーカー** — D&D 5eの集中スペルをアイコン＋名前で専用表示
- **トークン連携** — クリックでキャンバス上のトークンにパン＆選択

### 画像調整（歯車ボタン）
- **位置・ズーム調整** — スライダー / ドラッグ / ホイールで直感操作
- **ポートレート差し替え** — タイムライン専用画像をFilePickerで設定可能
- **ウィンドウ移動** — ヘッダードラッグでエディタを自由に配置
- **永続保存** — 設定はアクターflagsに保存（セッション跨ぎOK）

### GM専用機能
- **右クリックメニュー** — イニシアチブ変更 / HP編集 / シート表示 / 戦闘除外
- **ドラッグ並び替え** — グリップハンドルで手番順を直感的に変更
- **遅延・待機アクション** — 右クリック→「待機」で手番を後ろに回す
- **トークン表示/非表示** — プレイヤーから特定ユニットを隠す

### プレイヤー表示制限（World設定）
- **敵の名前** — 表示 / 「???」に置換
- **敵のHP** — 数値 / バーのみ / 色ヒントのみ / 非表示
- **敵のポートレート** — 表示 / シルエット / 非表示

### 演出・UX
- **手番通知** — 自分の手番で画面フラッシュ＋効果音（ON/OFF可能）
- **ターン切替アニメーション** — FLIP方式のスムーズなスライド演出
- **UI重なり自動回避** — サイドバー展開時にタイムラインを自動リポジション

## インストール

### マニフェストURL（推奨）

Foundry VTTの「モジュールをインストール」画面で以下のURLを入力:

```
設定しておりません
```

### 手動インストール

1. [Releases](https://github.com/<あなたのユーザー名>/iron-combat-timeline/releases) からzipをダウンロード
2. `Data/modules/` に展開
3. フォルダ名が `iron-combat-timeline` であることを確認
4. Foundry VTTを再起動し、ワールド設定でモジュールを有効化

## 対応システム

- **D&D 5e** — HP・集中維持マーカー完全対応
- **PF2e** — HP表示対応
- **その他** — Token Bar1によるHP表示フォールバック

## 設定項目

| 設定 | スコープ | 説明 |
|------|----------|------|
| Timeline Width | Client | タイムライン幅 |
| Vertical Offset | Client | 上端からの開始位置 |
| Timeline Style | Client | コンパクト / カード重ね落ち |
| Show HP Bar | Client | HPバー表示 |
| Show Status Icons | Client | 状態異常アイコン表示 |
| Show Round Counter | Client | ラウンド数表示 |
| Show Concentration | Client | 集中維持マーカー表示 |
| Turn Notification | Client | 手番通知フラッシュ |
| Auto-Avoid UI | Client | UI重なり自動回避 |
| Player HP Visibility | World | 敵HP表示制限 |
| Player Name Visibility | World | 敵名前表示制限 |
| Player Portrait Visibility | World | 敵ポートレート表示制限 |

## ライセンス

[MIT License](LICENSE)

## 制作

**鉄の翁**
