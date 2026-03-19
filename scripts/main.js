class IronCombatTimeline {
  static ID = "iron-combat-timeline";

  static imageSettings = {};
  static editingCombatantId = null;
  static _dragState = null;

  // ターン切替アニメーション用: 前回のユニット位置を記録
  static _prevPositions = new Map();
  static _prevTurnCombatantId = null;

  // UIオーバーラップ回避用
  static _avoidanceOffset = 0;
  static _resizeObserver = null;

  static init() {
    this.registerSettings();
    Hooks.on("ready", () => this.onReady());
    Hooks.on("renderCombatTracker", () => this.updateUI());
    Hooks.on("updateCombat", (combat, change) => {
      // ターン変更を検知して通知を出す
      if (change.turn !== undefined || change.round !== undefined) {
        this._onTurnChange(combat);
      }
      this.updateUI();
    });
    Hooks.on("deleteCombat", () => this.updateUI());
    Hooks.on("createCombat", () => this.updateUI());
    Hooks.on("updateActor", () => this.updateUI());
    Hooks.on("updateToken", () => this.updateUI());
    Hooks.on("deleteCombatant", () => this.updateUI());
    Hooks.on("collapseSidebar", () => this._scheduleAvoidanceCheck());
    Hooks.on("renderSidebar", () => this._scheduleAvoidanceCheck());

    document.addEventListener("click", () => this.closeContextMenu());
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest("#iron-combat-timeline") && !e.target.closest("#ag-context-menu")) {
        this.closeContextMenu();
      }
    });
  }

  static registerSettings() {
    const s = game.settings;

    s.register(this.ID, "timelineWidth", {
      name: "Timeline Width", hint: "タイムラインの基準幅 (px)",
      scope: "client", config: true, type: Number, default: 220,
      onChange: v => { this.updateCSSVariable("--timeline-width", `${v}px`); this._scheduleAvoidanceCheck(); }
    });

    s.register(this.ID, "verticalOffset", {
      name: "Vertical Offset", hint: "画面上端からの開始位置 (px)",
      scope: "client", config: true, type: Number, default: 100,
      onChange: v => this.updateCSSVariable("--timeline-top-offset", `${v}px`)
    });

    s.register(this.ID, "activeGlowColor", {
      name: "Active Glow Color", hint: "手番ユニットの発光色 (Hex)",
      scope: "client", config: true, type: String, default: "#00ffcc",
      onChange: v => this.updateCSSVariable("--active-glow", v)
    });

    s.register(this.ID, "popoutDistanceCompact", {
      name: "Pop-out Distance (Compact)", hint: "コンパクト方式：手番時に右へせり出す距離 (px)",
      scope: "client", config: true, type: Number, default: 60,
      onChange: () => this.applySettingsToCSS()
    });

    s.register(this.ID, "popoutDistanceStack", {
      name: "Pop-out Distance (Stack)", hint: "カード重ね落ち方式：手番時に右へせり出す距離 (px)",
      scope: "client", config: true, type: Number, default: 30,
      onChange: () => this.applySettingsToCSS()
    });

    s.register(this.ID, "timelineStyle", {
      name: "Timeline Style", hint: "表示スタイルの選択",
      scope: "client", config: true, type: String,
      choices: { "compact": "コンパクト (Compact)", "stack": "カード重ね落ち (Card Stack)" },
      default: "compact",
      onChange: () => { this.applySettingsToCSS(); this.updateUI(); }
    });

    s.register(this.ID, "showHpBar", {
      name: "Show HP Bar", hint: "ポートレート下部にHPバーを表示する",
      scope: "client", config: true, type: Boolean, default: true,
      onChange: () => this.updateUI()
    });

    s.register(this.ID, "showStatusIcons", {
      name: "Show Status Icons", hint: "状態異常アイコンを表示する",
      scope: "client", config: true, type: Boolean, default: true,
      onChange: () => this.updateUI()
    });

    s.register(this.ID, "showRoundCounter", {
      name: "Show Round Counter", hint: "タイムライン上部にラウンド数を表示する",
      scope: "client", config: true, type: Boolean, default: true,
      onChange: () => this.updateUI()
    });

    s.register(this.ID, "showConcentration", {
      name: "Show Concentration Marker",
      hint: "D&D 5e: 集中維持中のスペルアイコンをポートレート上に表示する",
      scope: "client", config: true, type: Boolean, default: true,
      onChange: () => this.updateUI()
    });

    s.register(this.ID, "turnNotification", {
      name: "Turn Notification",
      hint: "自分の手番が来た時にフラッシュ演出で通知する",
      scope: "client", config: true, type: Boolean, default: true
    });

    s.register(this.ID, "turnNotificationSound", {
      name: "Turn Notification Sound",
      hint: "手番通知時の効果音パス（空欄で無音）",
      scope: "client", config: true, type: String,
      default: "sounds/notify.wav"
    });

    s.register(this.ID, "autoAvoidUI", {
      name: "Auto-Avoid UI Overlap",
      hint: "サイドバーやチャットログとの重なりを自動回避する",
      scope: "client", config: true, type: Boolean, default: true,
      onChange: () => this._scheduleAvoidanceCheck()
    });

    // プレイヤー表示制限 (world)
    s.register(this.ID, "playerHpVisibility", {
      name: "Player HP Visibility", hint: "プレイヤーに敵のHPをどう表示するか",
      scope: "world", config: true, type: String,
      choices: { "full": "数値表示 (Full)", "bar": "バーのみ (Bar Only)", "pointed": "色のみ (Color Hint)", "hidden": "非表示 (Hidden)" },
      default: "bar", onChange: () => this.updateUI()
    });

    s.register(this.ID, "playerNameVisibility", {
      name: "Player Name Visibility", hint: "プレイヤーに敵の名前をどう表示するか",
      scope: "world", config: true, type: String,
      choices: { "full": "表示 (Show)", "hidden": "「???」に置換 (Hide)" },
      default: "full", onChange: () => this.updateUI()
    });

    s.register(this.ID, "playerPortraitVisibility", {
      name: "Player Portrait Visibility", hint: "プレイヤーに敵のポートレートをどう表示するか",
      scope: "world", config: true, type: String,
      choices: { "full": "表示 (Show)", "silhouette": "シルエット (Silhouette)", "hidden": "非表示 (Hidden)" },
      default: "full", onChange: () => this.updateUI()
    });
  }

  static onReady() {
    this.applySettingsToCSS();
    this.createContainer();
    this._initAvoidanceObserver();
    this.updateUI();
  }

  static applySettingsToCSS() {
    const s = game.settings;
    this.updateCSSVariable("--timeline-width", `${s.get(this.ID, "timelineWidth")}px`);
    this.updateCSSVariable("--timeline-top-offset", `${s.get(this.ID, "verticalOffset")}px`);
    this.updateCSSVariable("--active-glow", s.get(this.ID, "activeGlowColor"));
    const style = s.get(this.ID, "timelineStyle");
    const dist = style === "stack" ? s.get(this.ID, "popoutDistanceStack") : s.get(this.ID, "popoutDistanceCompact");
    this.updateCSSVariable("--popout-distance", `${dist}px`);
  }

  static updateCSSVariable(n, v) { document.documentElement.style.setProperty(n, v); }

  static createContainer() {
    if (!document.getElementById(this.ID)) {
      const c = document.createElement("div");
      c.id = this.ID;
      document.body.appendChild(c);
    }
  }

  // ======== UIオーバーラップ自動回避 ========

  static _initAvoidanceObserver() {
    // サイドバー幅の変化を監視
    const sidebar = document.getElementById("sidebar");
    if (sidebar && typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._scheduleAvoidanceCheck());
      this._resizeObserver.observe(sidebar);
    }
    window.addEventListener("resize", () => this._scheduleAvoidanceCheck());
    this._scheduleAvoidanceCheck();
  }

  static _avoidanceTimer = null;
  static _scheduleAvoidanceCheck() {
    if (this._avoidanceTimer) clearTimeout(this._avoidanceTimer);
    this._avoidanceTimer = setTimeout(() => this._checkAvoidance(), 100);
  }

  static _checkAvoidance() {
    if (!game.settings.get(this.ID, "autoAvoidUI")) {
      this._avoidanceOffset = 0;
      this._applyAvoidance();
      return;
    }

    const container = document.getElementById(this.ID);
    if (!container) return;

    const timelineRect = container.getBoundingClientRect();
    const timelineRight = timelineRect.left + timelineRect.width + 120; // +popout余裕

    // サイドバー/チャットログなどの左端を検出
    let obstacleLeft = window.innerWidth;
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      const sr = sidebar.getBoundingClientRect();
      obstacleLeft = Math.min(obstacleLeft, sr.left);
    }

    // チャットポップアウトなど
    const chatPopout = document.querySelector(".chat-popout");
    if (chatPopout) {
      const cr = chatPopout.getBoundingClientRect();
      obstacleLeft = Math.min(obstacleLeft, cr.left);
    }

    // 重なっていたらコンテナを左に寄せる
    if (timelineRight > obstacleLeft) {
      this._avoidanceOffset = Math.min(0, obstacleLeft - timelineRight - 10);
    } else {
      this._avoidanceOffset = 0;
    }
    this._applyAvoidance();
  }

  static _applyAvoidance() {
    const container = document.getElementById(this.ID);
    if (!container) return;
    if (this._avoidanceOffset < 0) {
      container.style.transform = `translateX(${this._avoidanceOffset}px)`;
    } else {
      container.style.transform = "";
    }
  }

  // ======== 手番通知 ========

  static _onTurnChange(combat) {
    if (!combat?.started) return;
    const currentCombatant = combat.turns?.[combat.turn];
    if (!currentCombatant) return;

    // 前回と同じ手番なら無視
    if (this._prevTurnCombatantId === currentCombatant.id) return;
    this._prevTurnCombatantId = currentCombatant.id;

    // 自分の所有トークンか判定
    if (!currentCombatant.isOwner) return;
    if (!game.settings.get(this.ID, "turnNotification")) return;

    // フラッシュ演出
    this._showTurnFlash(currentCombatant);

    // 効果音
    const soundPath = game.settings.get(this.ID, "turnNotificationSound");
    if (soundPath) {
      AudioHelper.play({ src: soundPath, volume: 0.5, autoplay: true, loop: false }, false);
    }
  }

  static _showTurnFlash(combatant) {
    // 画面端にフラッシュオーバーレイ
    const existing = document.getElementById("ag-turn-flash");
    if (existing) existing.remove();

    const name = combatant.token?.name || combatant.name || "Your Turn";

    const flash = document.createElement("div");
    flash.id = "ag-turn-flash";
    flash.innerHTML = `
      <div class="ag-flash-content">
        <i class="fas fa-bolt"></i>
        <span class="ag-flash-text">YOUR TURN</span>
        <span class="ag-flash-name">${name}</span>
      </div>
    `;
    document.body.appendChild(flash);

    // アニメーション完了後に削除
    setTimeout(() => flash.remove(), 2200);
  }

  // ======== ターン切替アニメーション (FLIP方式) ========

  static _capturePositions() {
    const container = document.getElementById(this.ID);
    if (!container) return;
    this._prevPositions.clear();
    container.querySelectorAll(".ag-unit").forEach(el => {
      const id = el.dataset.combatantId;
      if (id) {
        const rect = el.getBoundingClientRect();
        this._prevPositions.set(id, { top: rect.top, left: rect.left });
      }
    });
  }

  static _animatePositions() {
    const container = document.getElementById(this.ID);
    if (!container) return;
    if (this._prevPositions.size === 0) return;

    container.querySelectorAll(".ag-unit").forEach(el => {
      const id = el.dataset.combatantId;
      if (!id) return;
      const prev = this._prevPositions.get(id);
      if (!prev) return;

      const curr = el.getBoundingClientRect();
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      // FLIP: まず前の位置に瞬間移動、そしてアニメーションで戻す
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // 強制リフロー
      el.offsetHeight;
      el.style.transition = "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.transform = "";

      // active unitは自分のtransformがあるのでそちらに戻す
      if (el.classList.contains("active")) {
        const popout = getComputedStyle(document.documentElement).getPropertyValue("--popout-distance").trim();
        el.style.transform = `translateX(${popout}) scale(1.02)`;
      }
    });

    this._prevPositions.clear();
  }

  // ======== プレイヤー表示制限ヘルパー ========

  static _isOwnedByPlayer(combatant) {
    if (game.user.isGM) return true;
    if (combatant.isOwner) return true;
    const disposition = combatant.token?.disposition;
    if (disposition === 1) return true;
    return false;
  }

  static _getDisplayName(combatant) {
    const name = combatant.token?.name || combatant.name || "Unknown";
    if (this._isOwnedByPlayer(combatant)) return name;
    return game.settings.get(this.ID, "playerNameVisibility") === "hidden" ? "???" : name;
  }

  static _shouldShowHpDetails(combatant) {
    if (this._isOwnedByPlayer(combatant)) return "full";
    return game.settings.get(this.ID, "playerHpVisibility");
  }

  static _getPortraitVisibility(combatant) {
    if (this._isOwnedByPlayer(combatant)) return "full";
    return game.settings.get(this.ID, "playerPortraitVisibility");
  }

  // ======== 画像調整設定 (actor flags) ========

  static getImageSettings(combatant) {
    const actorId = combatant.actorId || combatant.id;
    if (this.imageSettings[actorId]) return this.imageSettings[actorId];
    const actor = combatant.actor;
    if (actor) {
      const saved = actor.getFlag(this.ID, "portraitAdjust");
      if (saved) { this.imageSettings[actorId] = saved; return saved; }
    }
    return { x: 50, y: 20, zoom: 150, portraitOverride: "" };
  }

  static async saveImageSettings(combatant, settings) {
    const actorId = combatant.actorId || combatant.id;
    this.imageSettings[actorId] = settings;
    const actor = combatant.actor;
    if (actor) await actor.setFlag(this.ID, "portraitAdjust", settings);
  }

  static getPortraitSrc(combatant) {
    const settings = this.getImageSettings(combatant);
    if (settings.portraitOverride) return settings.portraitOverride;
    return combatant.token?.texture?.src || combatant.actor?.img || combatant.img || "icons/svg/mystery-man.svg";
  }

  // ======== HP / 状態異常 / 集中維持 ========

  static getHpData(combatant) {
    const actor = combatant.actor;
    if (!actor) return null;
    const hp = actor.system?.attributes?.hp;
    if (hp && hp.max > 0) return { value: hp.value ?? 0, max: hp.max, temp: hp.temp ?? 0 };
    const tokenData = combatant.token;
    if (tokenData) {
      const bar = tokenData.getBarAttribute?.("bar1");
      if (bar && bar.max > 0) return { value: bar.value ?? 0, max: bar.max, temp: 0 };
    }
    return null;
  }

  static getStatusEffects(combatant) {
    const actor = combatant.actor;
    const effects = [];
    if (actor) {
      for (const e of actor.effects) {
        if (e.disabled) continue;
        const icon = e.icon || e.img;
        const label = e.name || e.label || "";
        if (icon) effects.push({ icon, label, isConcentration: this._isConcentrationEffect(e) });
      }
    }
    return effects;
  }

  /** D&D5e 集中維持エフェクトの判定 */
  static _isConcentrationEffect(effect) {
    const name = (effect.name || effect.label || "").toLowerCase();
    // statusId / flags での判定 (D&D5e)
    if (effect.statuses?.has?.("concentrating")) return true;
    if (effect.flags?.dnd5e?.isConcentration) return true;
    if (name.includes("concentrat")) return true;
    return false;
  }

  /** 集中維持中のスペル名を取得 */
  static getConcentrationSpell(combatant) {
    if (!game.settings.get(this.ID, "showConcentration")) return null;
    const actor = combatant.actor;
    if (!actor) return null;

    for (const e of actor.effects) {
      if (e.disabled) continue;
      if (!this._isConcentrationEffect(e)) continue;

      // D&D5eの場合、originからスペル情報を引く
      const origin = e.origin;
      if (origin) {
        // "Actor.xxxxx.Item.yyyyy" 形式
        const parts = origin.split(".");
        const itemIdx = parts.indexOf("Item");
        if (itemIdx >= 0 && parts[itemIdx + 1]) {
          const item = actor.items?.get(parts[itemIdx + 1]);
          if (item) {
            return { name: item.name, icon: item.img || e.icon || e.img };
          }
        }
      }

      // フォールバック: エフェクト名そのまま
      return { name: e.name || e.label || "Concentration", icon: e.icon || e.img || "icons/svg/aura.svg" };
    }
    return null;
  }

  static buildHpBarHtml(combatant) {
    if (!game.settings.get(this.ID, "showHpBar")) return "";
    const hp = this.getHpData(combatant);
    if (!hp) return "";
    const visibility = this._shouldShowHpDetails(combatant);
    if (visibility === "hidden") return "";
    const pct = Math.max(0, Math.min(100, (hp.value / hp.max) * 100));
    let color;
    if (pct > 60) color = "#22cc66";
    else if (pct > 30) color = "#ddaa00";
    else color = "#dd3333";
    const tempHtml = hp.temp > 0 ? `<div class="ag-hp-temp" style="width: ${Math.min(100, (hp.temp / hp.max) * 100)}%;"></div>` : "";
    if (visibility === "pointed") {
      return `<div class="ag-hp-bar-wrap ag-hp-hint-only" title="HP状態"><div class="ag-hp-bar-fill" style="width: 100%; background: ${color}; opacity: 0.4;"></div></div>`;
    }
    const showText = (visibility === "full");
    const titleText = showText ? `HP: ${hp.value}${hp.temp > 0 ? ` (+${hp.temp})` : ""} / ${hp.max}` : "HP";
    return `
      <div class="ag-hp-bar-wrap" title="${titleText}">
        <div class="ag-hp-bar-fill" style="width: ${pct}%; background: ${color};"></div>
        ${tempHtml}
        ${showText ? `<span class="ag-hp-text">${hp.value}/${hp.max}</span>` : ""}
      </div>`;
  }

  static buildStatusHtml(combatant) {
    if (!game.settings.get(this.ID, "showStatusIcons")) return "";
    const effects = this.getStatusEffects(combatant);
    // 集中は別枠で表示するので除外
    const filtered = effects.filter(e => !e.isConcentration);
    if (filtered.length === 0) return "";
    const icons = filtered.slice(0, 6).map(e =>
      `<img class="ag-status-icon" src="${e.icon}" title="${e.label}" />`
    ).join("");
    return `<div class="ag-status-row">${icons}</div>`;
  }

  static buildConcentrationHtml(combatant) {
    const conc = this.getConcentrationSpell(combatant);
    if (!conc) return "";
    return `
      <div class="ag-concentration" title="集中維持: ${conc.name}">
        <img class="ag-conc-icon" src="${conc.icon}" />
        <span class="ag-conc-text">${conc.name}</span>
      </div>`;
  }

  static buildRoundHtml() {
    if (!game.settings.get(this.ID, "showRoundCounter")) return "";
    const round = game.combat?.round ?? 0;
    return `<div class="ag-round-counter"><span class="ag-round-label">ROUND</span><span class="ag-round-number">${round}</span></div>`;
  }

  // ======== 右クリックメニュー ========

  static openContextMenu(event, combatant) {
    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();

    const name = combatant.token?.name || combatant.name || "Unknown";
    const initiative = combatant.initiative ?? "";

    // 待機状態の判定
    const isDelayed = combatant.getFlag(this.ID, "delayed") ?? false;

    const menu = document.createElement("div");
    menu.id = "ag-context-menu";
    menu.innerHTML = `
      <div class="ag-ctx-header">${name}</div>
      <div class="ag-ctx-item" data-action="edit-initiative">
        <i class="fas fa-sort-numeric-up"></i> イニシアチブ変更
        <span class="ag-ctx-value">${initiative}</span>
      </div>
      <div class="ag-ctx-item" data-action="edit-hp">
        <i class="fas fa-heart"></i> HP編集
      </div>
      <div class="ag-ctx-divider"></div>
      <div class="ag-ctx-item" data-action="delay-turn">
        <i class="fas fa-hourglass-half"></i>
        ${isDelayed ? "待機解除 (元の順番に戻す)" : "待機 (手番を後ろへ)"}
      </div>
      <div class="ag-ctx-divider"></div>
      <div class="ag-ctx-item" data-action="toggle-visibility">
        <i class="fas fa-eye${combatant.hidden ? "-slash" : ""}"></i>
        ${combatant.hidden ? "プレイヤーに表示" : "プレイヤーから隠す"}
      </div>
      <div class="ag-ctx-item" data-action="open-sheet">
        <i class="fas fa-id-card"></i> キャラクターシート
      </div>
      <div class="ag-ctx-divider"></div>
      <div class="ag-ctx-item ag-ctx-danger" data-action="remove-combatant">
        <i class="fas fa-user-minus"></i> 戦闘から除外
      </div>
    `;

    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

    menu.querySelectorAll(".ag-ctx-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this._handleContextAction(item.dataset.action, combatant);
        this.closeContextMenu();
      });
    });
  }

  static closeContextMenu() {
    const menu = document.getElementById("ag-context-menu");
    if (menu) menu.remove();
  }

  static async _handleContextAction(action, combatant) {
    switch (action) {
      case "edit-initiative": {
        const current = combatant.initiative ?? 0;
        new Dialog({
          title: `イニシアチブ変更: ${combatant.name}`,
          content: `<form><div class="form-group"><label>イニシアチブ値</label><input type="number" name="initiative" value="${current}" step="any" autofocus /></div></form>`,
          buttons: {
            ok: {
              icon: '<i class="fas fa-check"></i>', label: "変更",
              callback: async (html) => {
                const val = parseFloat(html.find('[name="initiative"]').val());
                if (!isNaN(val)) await combatant.update({ initiative: val });
              }
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "キャンセル" }
          }, default: "ok"
        }).render(true);
        break;
      }

      case "edit-hp": {
        const hp = this.getHpData(combatant);
        new Dialog({
          title: `HP編集: ${combatant.name}`,
          content: `<form>
            <div class="form-group"><label>現在HP</label><input type="number" name="hp" value="${hp?.value ?? 0}" /></div>
            <div class="form-group"><label>最大HP</label><input type="number" name="maxhp" value="${hp?.max ?? 0}" /></div>
            <div class="form-group"><label>一時HP</label><input type="number" name="temphp" value="${hp?.temp ?? 0}" /></div>
          </form>`,
          buttons: {
            ok: {
              icon: '<i class="fas fa-check"></i>', label: "変更",
              callback: async (html) => {
                const actor = combatant.actor;
                if (!actor) return;
                const update = {};
                const newHp = parseInt(html.find('[name="hp"]').val());
                const newMax = parseInt(html.find('[name="maxhp"]').val());
                const newTemp = parseInt(html.find('[name="temphp"]').val());
                if (!isNaN(newHp)) update["system.attributes.hp.value"] = newHp;
                if (!isNaN(newMax)) update["system.attributes.hp.max"] = newMax;
                if (!isNaN(newTemp)) update["system.attributes.hp.temp"] = newTemp;
                if (Object.keys(update).length > 0) await actor.update(update);
              }
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "キャンセル" }
          }, default: "ok"
        }).render(true);
        break;
      }

      case "delay-turn": {
        const isDelayed = combatant.getFlag(this.ID, "delayed") ?? false;
        if (isDelayed) {
          // 待機解除: 保存しておいた元のイニシアチブに戻す
          const origInit = combatant.getFlag(this.ID, "originalInitiative");
          if (origInit !== undefined && origInit !== null) {
            await combatant.update({ initiative: origInit });
          }
          await combatant.unsetFlag(this.ID, "delayed");
          await combatant.unsetFlag(this.ID, "originalInitiative");
          ui.notifications.info(`${combatant.name} の待機を解除しました`);
        } else {
          // 待機: 現在のイニシアチブを保存し、一番低い値の下に移動
          const turns = game.combat.turns;
          const lowestInit = Math.min(...turns.map(t => t.initiative ?? 0));
          await combatant.setFlag(this.ID, "originalInitiative", combatant.initiative);
          await combatant.setFlag(this.ID, "delayed", true);
          await combatant.update({ initiative: lowestInit - 1 });
          ui.notifications.info(`${combatant.name} は待機状態になりました`);
        }
        break;
      }

      case "toggle-visibility":
        await combatant.update({ hidden: !combatant.hidden });
        break;

      case "open-sheet":
        combatant.actor?.sheet?.render(true);
        break;

      case "remove-combatant": {
        const confirm = await Dialog.confirm({
          title: "戦闘から除外",
          content: `<p><strong>${combatant.name}</strong> を戦闘から除外しますか？</p>`
        });
        if (confirm) await combatant.delete();
        break;
      }
    }
  }

  // ======== ドラッグ並び替え ========

  static _initDrag(event, unitEl, combatant) {
    if (event.button !== 0 || !game.user.isGM) return;
    const container = document.getElementById(this.ID);
    if (!container) return;

    const startY = event.clientY;
    const startX = event.clientX;
    let started = false;
    let placeholder = null;
    let ghost = null;
    let rafId = null;
    let latestE = null;

    // 元の位置・サイズを記録
    const origRect = unitEl.getBoundingClientRect();

    const doMove = () => {
      rafId = null;
      if (!latestE || !started) return;
      const e = latestE;

      // ゴーストをマウスに追従
      ghost.style.top = `${e.clientY - (startY - origRect.top)}px`;
      ghost.style.left = `${e.clientX - (startX - origRect.left)}px`;

      // ドロップ位置判定
      const ghostRect = ghost.getBoundingClientRect();
      const ghostCenter = ghostRect.top + ghostRect.height / 2;
      const units = [...container.querySelectorAll(".ag-unit:not(.ag-drag-hidden)")];
      let insertBefore = null;
      for (const u of units) {
        const r = u.getBoundingClientRect();
        if (ghostCenter < r.top + r.height / 2) { insertBefore = u; break; }
      }

      if (placeholder) {
        if (insertBefore) container.insertBefore(placeholder, insertBefore);
        else {
          const controls = container.querySelector(".ag-controls");
          if (controls) container.insertBefore(placeholder, controls);
          else container.appendChild(placeholder);
        }
      }
    };

    const onMove = (e) => {
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      if (!started && Math.abs(dy) < 5 && Math.abs(dx) < 5) return;

      if (!started) {
        started = true;
        this._dragState = { combatantId: combatant.id };

        // プレースホルダーを元の位置に挿入
        placeholder = document.createElement("div");
        placeholder.className = "ag-drag-placeholder";
        placeholder.style.height = `${origRect.height}px`;
        unitEl.parentNode.insertBefore(placeholder, unitEl);

        // 元ユニットを隠す
        unitEl.classList.add("ag-drag-hidden");

        // ゴースト（浮遊コピー）を作成
        ghost = unitEl.cloneNode(true);
        ghost.classList.remove("ag-drag-hidden");
        ghost.classList.add("ag-drag-ghost");
        ghost.style.position = "fixed";
        ghost.style.width = `${origRect.width}px`;
        ghost.style.top = `${origRect.top}px`;
        ghost.style.left = `${origRect.left}px`;
        ghost.style.zIndex = "99999";
        ghost.style.pointerEvents = "none";
        ghost.style.transition = "none";
        document.body.appendChild(ghost);
      }

      latestE = e;
      if (!rafId) rafId = requestAnimationFrame(doMove);
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (rafId) cancelAnimationFrame(rafId);

      if (!started) { this._dragState = null; return; }

      // イニシアチブ計算
      const unitsBefore = [], unitsAfter = [];
      let passedPlaceholder = false;
      for (const child of container.children) {
        if (child === placeholder) { passedPlaceholder = true; continue; }
        if (!child.classList.contains("ag-unit") || child.classList.contains("ag-drag-hidden")) continue;
        const c = game.combat.combatants.get(child.dataset.combatantId);
        if (!c) continue;
        if (!passedPlaceholder) unitsBefore.push(c);
        else unitsAfter.push(c);
      }

      const prevInit = unitsBefore.length > 0 ? unitsBefore[unitsBefore.length - 1].initiative : null;
      const nextInit = unitsAfter.length > 0 ? unitsAfter[0].initiative : null;
      let newInit;
      if (prevInit !== null && nextInit !== null) newInit = (prevInit + nextInit) / 2;
      else if (prevInit !== null) newInit = prevInit - 1;
      else if (nextInit !== null) newInit = nextInit + 1;
      else newInit = combatant.initiative ?? 0;

      // クリーンアップ
      unitEl.classList.remove("ag-drag-hidden");
      if (placeholder) placeholder.remove();
      if (ghost) ghost.remove();
      this._dragState = null;
      await combatant.update({ initiative: newInit });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ======== 画像エディタ ========

  static openImageEditor(combatant) {
    if (this.editingCombatantId === combatant.id) { this.closeImageEditor(); return; }
    this.closeImageEditor();
    this.editingCombatantId = combatant.id;

    const settings = this.getImageSettings(combatant);
    const img = this.getPortraitSrc(combatant);
    const name = combatant.token?.name || combatant.name || "Unknown";

    const editor = document.createElement("div");
    editor.id = "ag-image-editor";
    editor.innerHTML = `
      <div class="ag-editor-header">
        <span class="ag-editor-title"><i class="fas fa-crop-alt"></i> ${name}</span>
        <div class="ag-editor-close" title="閉じる"><i class="fas fa-times"></i></div>
      </div>
      <div class="ag-editor-preview-wrap">
        <div class="ag-editor-preview-clip">
          <div class="ag-editor-preview-img" style="background-image: url('${img}'); background-position: ${settings.x}% ${settings.y}%; background-size: ${settings.zoom}%;"></div>
        </div>
        <div class="ag-editor-hint">ドラッグで移動 / ホイールでズーム</div>
      </div>
      <div class="ag-editor-controls">
        <div class="ag-editor-section-label"><i class="fas fa-image"></i> ポートレート差し替え</div>
        <div class="ag-editor-portrait-row">
          <input type="text" id="ag-edit-portrait" class="ag-editor-path-input" placeholder="画像パスを入力 or ファイルピッカー →" value="${settings.portraitOverride || ""}" />
          <button class="ag-editor-btn ag-editor-pick" title="ファイルピッカー"><i class="fas fa-folder-open"></i></button>
          <button class="ag-editor-btn ag-editor-clear-portrait" title="差し替え解除"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="ag-editor-divider"></div>
        <div class="ag-editor-section-label"><i class="fas fa-arrows-alt"></i> 画像位置・ズーム</div>
        <div class="ag-editor-row"><label><i class="fas fa-arrows-alt-h"></i> 横位置</label><input type="range" id="ag-edit-x" min="0" max="100" value="${settings.x}" /><span class="ag-edit-val" id="ag-edit-x-val">${settings.x}%</span></div>
        <div class="ag-editor-row"><label><i class="fas fa-arrows-alt-v"></i> 縦位置</label><input type="range" id="ag-edit-y" min="0" max="100" value="${settings.y}" /><span class="ag-edit-val" id="ag-edit-y-val">${settings.y}%</span></div>
        <div class="ag-editor-row"><label><i class="fas fa-search-plus"></i> ズーム</label><input type="range" id="ag-edit-zoom" min="100" max="400" value="${settings.zoom}" /><span class="ag-edit-val" id="ag-edit-zoom-val">${settings.zoom}%</span></div>
        <div class="ag-editor-buttons">
          <button class="ag-editor-btn ag-editor-reset" title="リセット"><i class="fas fa-undo"></i> リセット</button>
          <button class="ag-editor-btn ag-editor-save" title="保存"><i class="fas fa-save"></i> 保存</button>
        </div>
      </div>`;
    document.body.appendChild(editor);

    // === ウィンドウドラッグ移動（ヘッダー掴み） ===
    {
      const header = editor.querySelector(".ag-editor-header");
      header.style.cursor = "move";
      let winDrag = false, winStartX = 0, winStartY = 0, editorX = 0, editorY = 0;

      header.addEventListener("mousedown", (e) => {
        // 閉じるボタン上では無視
        if (e.target.closest(".ag-editor-close")) return;
        if (e.button !== 0) return;
        winDrag = true;
        winStartX = e.clientX;
        winStartY = e.clientY;
        // 初回はtransformから現在位置を取得（中央配置 translate(-50%,-50%) を実座標に変換）
        const rect = editor.getBoundingClientRect();
        editorX = rect.left;
        editorY = rect.top;
        // 中央配置を解除して絶対位置に切り替え
        editor.style.transform = "none";
        editor.style.left = `${editorX}px`;
        editor.style.top = `${editorY}px`;
        e.preventDefault();
      });
      document.addEventListener("mousemove", this._editorWinDragHandler = (e) => {
        if (!winDrag) return;
        const dx = e.clientX - winStartX;
        const dy = e.clientY - winStartY;
        editor.style.left = `${editorX + dx}px`;
        editor.style.top = `${editorY + dy}px`;
      });
      document.addEventListener("mouseup", this._editorWinDragEndHandler = () => {
        if (winDrag) {
          winDrag = false;
          // 現在位置を記憶しておく
          const rect = editor.getBoundingClientRect();
          editorX = rect.left;
          editorY = rect.top;
        }
      });
    }

    const previewImg = editor.querySelector(".ag-editor-preview-img");
    const xSlider = editor.querySelector("#ag-edit-x");
    const ySlider = editor.querySelector("#ag-edit-y");
    const zoomSlider = editor.querySelector("#ag-edit-zoom");
    const xVal = editor.querySelector("#ag-edit-x-val");
    const yVal = editor.querySelector("#ag-edit-y-val");
    const zoomVal = editor.querySelector("#ag-edit-zoom-val");
    const portraitInput = editor.querySelector("#ag-edit-portrait");

    const updatePreview = () => {
      previewImg.style.backgroundPosition = `${xSlider.value}% ${ySlider.value}%`;
      previewImg.style.backgroundSize = `${zoomSlider.value}%`;
      xVal.textContent = `${xSlider.value}%`; yVal.textContent = `${ySlider.value}%`; zoomVal.textContent = `${zoomSlider.value}%`;
      this._applyLivePreview(combatant, xSlider.value, ySlider.value, zoomSlider.value, portraitInput.value);
    };
    const setPreviewImage = (src) => { previewImg.style.backgroundImage = `url('${src}')`; updatePreview(); };

    xSlider.addEventListener("input", updatePreview);
    ySlider.addEventListener("input", updatePreview);
    zoomSlider.addEventListener("input", updatePreview);
    portraitInput.addEventListener("change", () => { if (portraitInput.value) setPreviewImage(portraitInput.value); });

    editor.querySelector(".ag-editor-pick").addEventListener("click", () => {
      new FilePicker({ type: "image", current: portraitInput.value || "", callback: (path) => { portraitInput.value = path; setPreviewImage(path); } }).render(true);
    });
    editor.querySelector(".ag-editor-clear-portrait").addEventListener("click", () => {
      portraitInput.value = "";
      setPreviewImage(combatant.token?.texture?.src || combatant.actor?.img || combatant.img || "icons/svg/mystery-man.svg");
    });
    editor.querySelector(".ag-editor-preview-wrap").addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomSlider.value = Math.max(100, Math.min(400, parseInt(zoomSlider.value) + (e.deltaY < 0 ? 10 : -10)));
      updatePreview();
    });

    let dragging = false;
    const previewClip = editor.querySelector(".ag-editor-preview-clip");
    previewClip.style.cursor = "grab";
    previewClip.addEventListener("mousedown", (e) => { if (e.button !== 0) return; dragging = true; previewClip.style.cursor = "grabbing"; e.preventDefault(); });
    this._editorDragHandler = (e) => {
      if (!dragging) return;
      xSlider.value = Math.round(Math.max(0, Math.min(100, parseInt(xSlider.value) - e.movementX * 0.5)));
      ySlider.value = Math.round(Math.max(0, Math.min(100, parseInt(ySlider.value) - e.movementY * 0.5)));
      updatePreview();
    };
    this._editorDragEndHandler = () => { dragging = false; previewClip.style.cursor = "grab"; };
    document.addEventListener("mousemove", this._editorDragHandler);
    document.addEventListener("mouseup", this._editorDragEndHandler);

    editor.querySelector(".ag-editor-save").addEventListener("click", async () => {
      await this.saveImageSettings(combatant, { x: parseInt(xSlider.value), y: parseInt(ySlider.value), zoom: parseInt(zoomSlider.value), portraitOverride: portraitInput.value.trim() });
      this.closeImageEditor(); this.updateUI();
      ui.notifications.info(`${name} の画像設定を保存しました`);
    });
    editor.querySelector(".ag-editor-reset").addEventListener("click", () => {
      xSlider.value = 50; ySlider.value = 20; zoomSlider.value = 150; portraitInput.value = "";
      setPreviewImage(combatant.token?.texture?.src || combatant.actor?.img || combatant.img || "icons/svg/mystery-man.svg");
    });
    editor.querySelector(".ag-editor-close").addEventListener("click", () => this.closeImageEditor());
  }

  static _applyLivePreview(combatant, x, y, zoom, portraitOverride) {
    const unit = document.getElementById(this.ID)?.querySelector(`.ag-unit[data-combatant-id="${combatant.id}"]`);
    if (!unit) return;
    const img = unit.querySelector(".ag-image");
    if (!img) return;
    img.style.backgroundPosition = `${x}% ${y}%`;
    img.style.backgroundSize = `${zoom}%`;
    if (portraitOverride !== undefined) {
      img.style.backgroundImage = `url('${portraitOverride || combatant.token?.texture?.src || combatant.actor?.img || combatant.img || "icons/svg/mystery-man.svg"}')`;
    }
  }

  static closeImageEditor() {
    this.editingCombatantId = null;
    document.getElementById("ag-image-editor")?.remove();
    if (this._editorDragHandler) {
      document.removeEventListener("mousemove", this._editorDragHandler);
      document.removeEventListener("mouseup", this._editorDragEndHandler);
    }
    if (this._editorWinDragHandler) {
      document.removeEventListener("mousemove", this._editorWinDragHandler);
      document.removeEventListener("mouseup", this._editorWinDragEndHandler);
    }
  }

  // ======== メインUI ========

  static updateUI() {
    const container = document.getElementById(this.ID);
    if (!container) return;

    if (!game.combat) { container.innerHTML = ""; return; }
    const turns = game.combat.turns;
    if (!turns || turns.length === 0) { container.innerHTML = ""; return; }

    // FLIP: 更新前の位置を記録
    this._capturePositions();

    const currentTurn = game.combat.turn;
    const currentCombatantId = turns[currentTurn]?.id;
    const timelineStyle = game.settings.get(this.ID, "timelineStyle");
    container.className = timelineStyle === "stack" ? "ag-style-stack" : "ag-style-compact";

    let html = this.buildRoundHtml();
    let activeHtml = "";
    let completedHtml = "";

    turns.forEach((combatant, index) => {
      const isActive = combatant.id === currentCombatantId;
      const isCompleted = index < currentTurn;
      const activeClass = isActive ? "active" : "";
      const completedClass = isCompleted ? "completed" : "";
      const hiddenClass = combatant.hidden ? "ag-hidden-token" : "";
      const delayedClass = (combatant.getFlag(this.ID, "delayed") ?? false) ? "ag-delayed" : "";

      let zIndex = 0;
      if (timelineStyle === "stack") {
        if (isActive) zIndex = 100;
        else if (isCompleted) zIndex = index;
        else zIndex = 50 - index;
      }

      const displayName = this._getDisplayName(combatant);
      const portraitVis = this._getPortraitVisibility(combatant);
      const imgSettings = this.getImageSettings(combatant);
      const img = this.getPortraitSrc(combatant);

      let portraitStyle = "", portraitExtraClass = "";
      if (portraitVis === "hidden") {
        portraitStyle = `background-image: url('icons/svg/mystery-man.svg'); background-position: center center; background-size: 60%;`;
        portraitExtraClass = "ag-portrait-hidden";
      } else if (portraitVis === "silhouette") {
        portraitStyle = `background-image: url('${img}'); background-position: ${imgSettings.x}% ${imgSettings.y}%; background-size: ${imgSettings.zoom}%;`;
        portraitExtraClass = "ag-portrait-silhouette";
      } else {
        portraitStyle = `background-image: url('${img}'); background-position: ${imgSettings.x}% ${imgSettings.y}%; background-size: ${imgSettings.zoom}%;`;
      }

      const gearBtn = game.user.isGM ? `<div class="ag-gear-btn" data-combatant-id="${combatant.id}" title="画像位置調整"><i class="fas fa-cog"></i></div>` : "";
      const dragHandle = game.user.isGM ? `<div class="ag-drag-handle" title="ドラッグで順番変更"><i class="fas fa-grip-vertical"></i></div>` : "";

      const hpBar = this.buildHpBarHtml(combatant);
      const statusIcons = this.buildStatusHtml(combatant);
      const concentration = this.buildConcentrationHtml(combatant);

      const unitHtml = `
        <div class="ag-unit ${activeClass} ${completedClass} ${hiddenClass} ${delayedClass}" data-token-id="${combatant.tokenId}" data-combatant-id="${combatant.id}" style="z-index: ${zIndex};">
          ${dragHandle}
          ${gearBtn}
          <div class="ag-portrait-box">
            <div class="ag-image ${portraitExtraClass}" style="${portraitStyle}"></div>
            ${hpBar}
            ${statusIcons}
            ${concentration}
          </div>
          <div class="ag-name-box">
            <span class="ag-name-text">${displayName}</span>
          </div>
        </div>`;

      if (isCompleted) completedHtml += unitHtml;
      else activeHtml += unitHtml;
    });

    html += completedHtml + activeHtml;

    if (game.user.isGM) {
      const started = game.combat.started;
      const icon = started ? "fa-stop" : "fa-play";
      const action = started ? "end-combat" : "start-combat";
      const title = started ? "戦闘終了" : "戦闘開始";
      html += `
        <div class="ag-controls">
          <div class="ag-btn" data-action="prev-round" title="前のラウンド"><i class="fas fa-fast-backward"></i></div>
          <div class="ag-btn" data-action="prev-turn" title="前の手番"><i class="fas fa-step-backward"></i></div>
          <div class="ag-btn ag-btn-main" data-action="${action}" title="${title}"><i class="fas ${icon}"></i></div>
          <div class="ag-btn" data-action="next-turn" title="次の手番"><i class="fas fa-step-forward"></i></div>
          <div class="ag-btn" data-action="next-round" title="次のラウンド"><i class="fas fa-fast-forward"></i></div>
        </div>`;
    }

    container.innerHTML = html;

    // FLIP: アニメーション適用
    requestAnimationFrame(() => this._animatePositions());

    // イベント
    container.querySelectorAll(".ag-unit").forEach(u => {
      u.addEventListener("click", e => this.onUnitClick(e));
      if (game.user.isGM) {
        u.addEventListener("contextmenu", (e) => {
          e.preventDefault(); e.stopPropagation();
          const c = game.combat.combatants.get(u.dataset.combatantId);
          if (c) this.openContextMenu(e, c);
        });
      }
    });
    container.querySelectorAll(".ag-btn").forEach(b => b.addEventListener("click", e => this.onControlClick(e)));
    container.querySelectorAll(".ag-gear-btn").forEach(b => {
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const c = game.combat.combatants.get(e.currentTarget.dataset.combatantId);
        if (c) this.openImageEditor(c);
      });
    });
    if (game.user.isGM) {
      container.querySelectorAll(".ag-drag-handle").forEach(handle => {
        handle.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          const unitEl = handle.closest(".ag-unit");
          const c = game.combat.combatants.get(unitEl.dataset.combatantId);
          if (c) this._initDrag(e, unitEl, c);
        });
      });
    }

    // UI回避チェック
    this._scheduleAvoidanceCheck();
  }

  static onControlClick(event) {
    event.preventDefault(); event.stopPropagation();
    if (!game.combat) return;
    switch (event.currentTarget.dataset.action) {
      case "prev-round": game.combat.previousRound(); break;
      case "prev-turn": game.combat.previousTurn(); break;
      case "next-turn": game.combat.nextTurn(); break;
      case "next-round": game.combat.nextRound(); break;
      case "start-combat": game.combat.startCombat(); break;
      case "end-combat": game.combat.endCombat(); break;
    }
  }

  static onUnitClick(event) {
    if (event.target.closest(".ag-gear-btn") || event.target.closest(".ag-drag-handle")) return;
    const tokenId = event.currentTarget.dataset.tokenId;
    if (!tokenId || !canvas.ready) return;
    const token = canvas.tokens.get(tokenId);
    if (token) {
      canvas.animatePan({ x: token.center.x, y: token.center.y, scale: Math.max(1, canvas.stage.scale.x), duration: 500 });
      if (token.isOwner) token.control({ releaseOthers: true });
    }
  }
}

Hooks.once("init", () => { IronCombatTimeline.init(); });
