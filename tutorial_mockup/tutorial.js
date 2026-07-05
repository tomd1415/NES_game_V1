(function () {
  "use strict";

  var quests = window.TUTORIAL_QUESTS || [];
  var state = {
    mode: "world",
    tool: "ground",
    comfort: false,
    playerRole: "none",
    cells: {},
    played: false,
    jumpChanged: false,
    currentQuest: 0,
    failedChecks: 0
  };

  var grid = document.getElementById("game-grid");
  var dockTitle = document.getElementById("dock-title");
  var dockHelp = document.getElementById("dock-help");
  var dockBody = document.getElementById("dock-body");
  var toolLabel = document.getElementById("tool-label");
  var tvStatus = document.getElementById("tv-status");
  var hero = document.getElementById("hero");
  var progressFill = document.getElementById("progress-fill");
  var progressText = document.getElementById("progress-text");
  var questMeta = document.getElementById("quest-meta");
  var questTitle = document.getElementById("quest-title");
  var questInstruction = document.getElementById("quest-instruction");
  var questWhy = document.getElementById("quest-why");
  var questImage = document.getElementById("quest-image");
  var questFeedback = document.getElementById("quest-feedback");
  var attentionList = document.getElementById("attention-list");
  var autoHelp = document.getElementById("auto-help");

  function key(row, col) {
    return row + "," + col;
  }

  function getCell(row, col) {
    var k = key(row, col);
    if (!state.cells[k]) state.cells[k] = { ground: false, solid: false };
    return state.cells[k];
  }

  function countGround() {
    return Object.keys(state.cells).filter(function (k) {
      return state.cells[k].ground;
    }).length;
  }

  function countSolidGround() {
    return Object.keys(state.cells).filter(function (k) {
      return state.cells[k].ground && state.cells[k].solid;
    }).length;
  }

  function buildGrid() {
    grid.innerHTML = "";
    for (var r = 0; r < 12; r++) {
      for (var c = 0; c < 16; c++) {
        var cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute("aria-label", "Tile row " + (r + 1) + ", column " + (c + 1));
        cell.addEventListener("click", paintCell);
        grid.appendChild(cell);
      }
    }
    renderGrid();
  }

  function renderGrid() {
    Array.prototype.forEach.call(grid.children, function (el) {
      var c = getCell(Number(el.dataset.row), Number(el.dataset.col));
      el.className = "cell" + (c.ground ? " ground" : "") + (c.solid ? " solid" : "");
      var label = "Tile row " + (Number(el.dataset.row) + 1) + ", column " + (Number(el.dataset.col) + 1);
      if (c.ground && c.solid) label += ", ground and solid";
      else if (c.ground) label += ", ground picture";
      else if (c.solid) label += ", solid type";
      el.setAttribute("aria-label", label);
    });
    hero.classList.toggle("has-role", state.playerRole === "player");
  }

  function paintCell(ev) {
    if (state.mode !== "world") {
      setFeedback("Open WORLD to paint the game world.", "wait");
      return;
    }
    var row = Number(ev.currentTarget.dataset.row);
    var col = Number(ev.currentTarget.dataset.col);
    var c = getCell(row, col);
    if (state.tool === "solid") {
      if (!c.ground) {
        setFeedback("Nearly. Paint a ground block first, then make it solid.", "wait");
      }
      c.solid = true;
      tvStatus.textContent = "Solid type set on this tile.";
    } else {
      c.ground = true;
      tvStatus.textContent = "Ground painted.";
    }
    renderGrid();
    updateAttention();
  }

  function selectMode(mode) {
    state.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll(".mode"), function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    renderDock();
    updateAttention();
  }

  function setTool(tool) {
    state.tool = tool;
    renderDock();
  }

  function renderDock() {
    dockBody.innerHTML = "";
    if (state.mode === "world") {
      dockTitle.textContent = "WORLD";
      dockHelp.textContent = "Paint the world and choose what tiles do.";
      toolLabel.textContent = "Tool: " + (state.tool === "solid" ? "Set solid type" : "Stamp ground");
      var stack = div("tool-stack");
      stack.appendChild(toolButton("Stamp ground", "ground"));
      stack.appendChild(toolButton("Set solid type", "solid"));
      stack.appendChild(statusBox("Ground blocks: " + countGround() + "\nSolid ground: " + countSolidGround()));
      dockBody.appendChild(stack);
    } else if (state.mode === "chars") {
      dockTitle.textContent = "CHARS";
      dockHelp.textContent = "Choose what each character does.";
      toolLabel.textContent = "Tool: Choose role";
      var setPlayer = document.createElement("button");
      setPlayer.className = "primary";
      setPlayer.textContent = "Set Hero as Player";
      setPlayer.addEventListener("click", function () {
        state.playerRole = "player";
        tvStatus.textContent = "Hero role set to Player.";
        renderGrid();
        updateAttention();
      });
      dockBody.appendChild(setPlayer);
      dockBody.appendChild(statusBox("Hero role: " + (state.playerRole === "player" ? "Player" : "not chosen yet")));
    } else if (state.mode === "rules") {
      dockTitle.textContent = "RULES";
      dockHelp.textContent = "Change how the game feels.";
      toolLabel.textContent = "Tool: Change rules";
      var label = document.createElement("label");
      label.textContent = "Jump height ";
      var slider = document.createElement("input");
      slider.type = "range";
      slider.min = "1";
      slider.max = "5";
      slider.value = state.jumpChanged ? "4" : "2";
      slider.addEventListener("input", function () {
        state.jumpChanged = true;
        tvStatus.textContent = "Jump height changed.";
        updateAttention();
      });
      label.appendChild(slider);
      dockBody.appendChild(label);
      dockBody.appendChild(statusBox("Start with a small change. Big jumps can make a game harder to test."));
    } else {
      dockTitle.textContent = "PLAY";
      dockHelp.textContent = "Build and test the game.";
      toolLabel.textContent = "Tool: Run test";
      var play = document.createElement("button");
      play.className = "primary";
      play.textContent = "Run test";
      play.addEventListener("click", function () {
        state.played = true;
        if (countSolidGround() >= 8 && state.playerRole === "player") {
          tvStatus.textContent = "Test ran. The hero has a solid floor.";
        } else {
          tvStatus.textContent = "Test ran. Something needs attention.";
        }
        updateAttention();
      });
      dockBody.appendChild(play);
      dockBody.appendChild(statusBox("This mockup simulates Play. The real Studio would compile a NES ROM."));
    }
  }

  function toolButton(label, tool) {
    var btn = document.createElement("button");
    btn.className = "tool-button" + (state.tool === tool ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", function () { setTool(tool); });
    return btn;
  }

  function div(cls) {
    var el = document.createElement("div");
    el.className = cls;
    return el;
  }

  function statusBox(text) {
    var box = div("status-box");
    box.textContent = text;
    return box;
  }

  function renderQuest() {
    var q = quests[state.currentQuest];
    if (!q) return;
    questMeta.textContent = q.chapter;
    questTitle.textContent = q.title;
    questInstruction.textContent = q.instruction;
    questWhy.textContent = q.why;
    questImage.src = q.image;
    questImage.alt = q.title;
    progressText.textContent = "Step " + (state.currentQuest + 1) + " of " + quests.length;
    progressFill.style.width = Math.round((state.currentQuest) / quests.length * 100) + "%";
    autoHelp.hidden = true;
    setFeedback("", "");
  }

  function checkCurrentQuest() {
    var q = quests[state.currentQuest];
    var result = check(q.check);
    if (result.ok) {
      setFeedback(result.message, "ok");
      state.failedChecks = 0;
      state.currentQuest = Math.min(state.currentQuest + 1, quests.length - 1);
      setTimeout(function () {
        renderQuest();
        updateAttention();
        if (state.currentQuest === quests.length - 1 && check(quests[state.currentQuest].check).ok) {
          progressFill.style.width = "100%";
        }
      }, 650);
    } else {
      state.failedChecks += 1;
      setFeedback(result.message, "wait");
      autoHelp.hidden = state.failedChecks < 2 || !canAutoHelp(q.check);
    }
  }

  function check(type) {
    if (type === "comfort") {
      return state.comfort
        ? ok("Good. The Studio is ready for you.")
        : wait("Not yet. Choose a text option, contrast option, or press This feels OK.");
    }
    if (type === "hero") {
      return state.playerRole === "player"
        ? ok("Good. The game knows who the player is.")
        : wait("Not yet. Open CHARS and set the hero role to Player.");
    }
    if (type === "ground") {
      var n = countGround();
      return n >= 8
        ? ok("Good. Your hero has a floor picture.")
        : wait(n > 0 ? "Nearly. Paint " + (8 - n) + " more ground blocks." : "Not yet. Paint ground blocks under the hero.");
    }
    if (type === "solid") {
      var s = countSolidGround();
      if (s >= 8) return ok("Good. The floor is solid now.");
      if (countGround() >= 8) return wait("Nearly. The floor is drawn. Now choose Set solid type and click it.");
      return wait("Not yet. Paint ground first, then make it solid.");
    }
    if (type === "play") {
      if (!state.played) return wait("Not yet. Open PLAY and press Run test.");
      if (state.playerRole !== "player") return wait("The test ran, but the hero still needs the Player role.");
      if (countSolidGround() < 8) return wait("The test ran, but the hero needs more solid ground.");
      return ok("Good. Your first test is working.");
    }
    if (type === "jump") {
      return state.jumpChanged
        ? ok("Good. You changed how the game feels.")
        : wait("Optional challenge. Open RULES and move the jump height slider once.");
    }
    return wait("This quest has no check yet.");
  }

  function ok(message) {
    return { ok: true, message: message };
  }

  function wait(message) {
    return { ok: false, message: message };
  }

  function setFeedback(message, kind) {
    questFeedback.textContent = message || "";
    questFeedback.className = "feedback" + (kind ? " " + kind : "");
  }

  function updateAttention() {
    attentionList.innerHTML = "";
    var items = [];
    if (state.playerRole !== "player") {
      items.push({ type: "warn", text: "Choose a Player role so the game knows who you control." });
    }
    if (countGround() > 0 && countSolidGround() < countGround()) {
      items.push({ type: "warn", text: "Some ground is only a picture. Use Set solid type so the hero can stand on it." });
    }
    if (state.played && (state.playerRole !== "player" || countSolidGround() < 8)) {
      items.push({ type: "error", text: "The test ran, but the game is not ready yet. Fix the Player role and solid ground." });
    }
    if (!items.length) {
      var okEl = div("attention-empty");
      okEl.textContent = "Nothing urgent. Keep going one step at a time.";
      attentionList.appendChild(okEl);
      return;
    }
    items.forEach(function (item) {
      var el = div("attention-item " + item.type);
      el.textContent = item.text;
      attentionList.appendChild(el);
    });
  }

  function showMe() {
    var q = quests[state.currentQuest];
    var target = document.querySelector(q.target);
    clearHighlights();
    if (target) {
      target.classList.add("highlight");
      target.scrollIntoView({ block: "center", inline: "center", behavior: document.body.classList.contains("reduced-motion") ? "auto" : "smooth" });
      setTimeout(clearHighlights, 2600);
    }
    if (q.check === "hero") selectMode("chars");
    if (q.check === "ground" || q.check === "solid") selectMode("world");
    if (q.check === "play") selectMode("play");
    if (q.check === "jump") selectMode("rules");
  }

  function clearHighlights() {
    Array.prototype.forEach.call(document.querySelectorAll(".highlight"), function (el) {
      el.classList.remove("highlight");
    });
  }

  function speakCurrent() {
    var q = quests[state.currentQuest];
    var text = q.title + ". " + q.instruction;
    if (!("speechSynthesis" in window)) {
      setFeedback("Read aloud is not available in this browser.", "wait");
      return;
    }
    window.speechSynthesis.cancel();
    var msg = new SpeechSynthesisUtterance(text);
    msg.rate = 0.85;
    window.speechSynthesis.speak(msg);
  }

  function canAutoHelp(type) {
    return ["hero", "ground", "solid"].indexOf(type) >= 0;
  }

  function autoFix() {
    var q = quests[state.currentQuest];
    if (q.check === "hero") {
      state.playerRole = "player";
      selectMode("chars");
    } else if (q.check === "ground") {
      for (var c = 3; c < 11; c++) getCell(9, c).ground = true;
      selectMode("world");
    } else if (q.check === "solid") {
      for (var c2 = 3; c2 < 11; c2++) {
        getCell(9, c2).ground = true;
        getCell(9, c2).solid = true;
      }
      selectMode("world");
    }
    state.failedChecks = 0;
    renderGrid();
    renderDock();
    updateAttention();
    setFeedback("I placed a small example. You can change it now.", "ok");
    autoHelp.hidden = true;
  }

  function initControls() {
    Array.prototype.forEach.call(document.querySelectorAll(".mode"), function (btn) {
      btn.addEventListener("click", function () { selectMode(btn.dataset.mode); });
    });
    document.getElementById("show-me").addEventListener("click", showMe);
    document.getElementById("check-work").addEventListener("click", checkCurrentQuest);
    document.getElementById("read-step").addEventListener("click", speakCurrent);
    document.getElementById("hint-step").addEventListener("click", function () {
      setFeedback(quests[state.currentQuest].hint, "wait");
    });
    autoHelp.addEventListener("click", autoFix);
    document.getElementById("comfort-ok").addEventListener("click", function () {
      state.comfort = true;
      setFeedback("Good. Use the settings any time.", "ok");
    });
    document.getElementById("text-size").addEventListener("change", function (ev) {
      document.body.classList.toggle("text-large", ev.target.value === "large");
      document.body.classList.toggle("text-huge", ev.target.value === "huge");
      state.comfort = true;
    });
    document.getElementById("contrast").addEventListener("change", function (ev) {
      document.body.classList.toggle("high-contrast", ev.target.checked);
      state.comfort = true;
    });
    document.getElementById("reduced-motion").addEventListener("change", function (ev) {
      document.body.classList.toggle("reduced-motion", ev.target.checked);
      state.comfort = true;
    });
  }

  buildGrid();
  initControls();
  renderDock();
  renderQuest();
  updateAttention();
})();

