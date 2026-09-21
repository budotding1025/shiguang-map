(function () {
  const DATA = window.TIMELINE_DATA;
  const STORE_KEY = "shiguang-map-v1";
  const YEAR_MIN = DATA.yearMin;
  const YEAR_MAX = DATA.yearMax;

  const $ = (id) => document.getElementById(id);
  const scroller = $("scroller");
  const stage = $("stage");
  const detail = $("detail");
  const modal = $("modal");
  const eraBar = $("era-bar");
  const dynastyBar = $("dynasty-bar");
  const zoomInput = $("zoom");
  const searchInput = $("search");

  const state = {
    mode: "timeline",
    pxPerYear: 1.1,
    selectedId: null,
    selectedDynastyId: null,
    query: "",
    era: null,
    showHelpOnce: false
  };

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveStore(partial) {
    const prev = loadStore();
    const next = {
      customEvents: prev.customEvents || [],
      notes: prev.notes || [],
      seenHelp: prev.seenHelp || false,
      musicOn: !!prev.musicOn,
      ...partial
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  }

  const bgMusic = $("bg-music");
  const musicBtn = $("btn-music");

  function syncMusicButton(on) {
    if (!musicBtn) return;
    musicBtn.textContent = on ? "音乐：开" : "音乐：关";
    musicBtn.setAttribute("aria-pressed", on ? "true" : "false");
    musicBtn.title = on ? "点击关闭背景音乐" : "点击开启背景音乐";
    musicBtn.classList.toggle("music-on", !!on);
  }

  function setMusicOn(on) {
    if (!bgMusic) return;
    bgMusic.loop = true;
    bgMusic.volume = 0.28;
    syncMusicButton(on);
    saveStore({ musicOn: !!on });
    if (on) {
      const play = bgMusic.play();
      if (play && play.catch) {
        play.catch(function () {
          syncMusicButton(false);
          saveStore({ musicOn: false });
        });
      }
    } else {
      bgMusic.pause();
    }
  }

  function initMusic() {
    if (!bgMusic || !musicBtn) return;
    const wantOn = !!loadStore().musicOn;
    syncMusicButton(wantOn);
    if (wantOn) {
      const resume = function () {
        setMusicOn(true);
        document.removeEventListener("pointerdown", resume);
      };
      document.addEventListener("pointerdown", resume, { once: true });
    }
    musicBtn.addEventListener("click", function () {
      const turningOn = bgMusic.paused;
      setMusicOn(turningOn);
    });
  }

  function allEvents() {
    const extras = loadStore().customEvents || [];
    return DATA.events.concat(extras);
  }

  function allNotes() {
    return loadStore().notes || [];
  }

  function formatYear(year, approx) {
    const n = Math.abs(year);
    const head = approx ? "约" : "";
    if (year < 0) return head + "公元前" + n + "年";
    if (year === 0) return "公元元年";
    return head + "公元" + n + "年";
  }

  function yearToX(year) {
    return 80 + (year - YEAR_MIN) * state.pxPerYear;
  }

  function stageWidth() {
    return 160 + (YEAR_MAX - YEAR_MIN) * state.pxPerYear;
  }

  function tickStep() {
    if (state.pxPerYear >= 2.4) return 50;
    if (state.pxPerYear >= 1.2) return 100;
    if (state.pxPerYear >= 0.7) return 200;
    return 500;
  }

  function matchesQuery(ev, q) {
    if (!q) return true;
    const dynasty = dynastyAt(ev.year);
    const blob = [
      ev.title,
      ev.summary,
      ev.why,
      (ev.tags || []).join(" "),
      dynasty ? dynasty.label : ""
    ].join(" ").toLowerCase();
    return blob.indexOf(q) !== -1;
  }

  function dynastyAt(year) {
    const list = DATA.dynasties || [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (year >= d.from && year <= d.to) return d;
    }
    return null;
  }

  function formatDynastySpan(d) {
    if (!d) return "";
    const a = formatYear(d.from, d.approx);
    const b = formatYear(d.to, d.to >= YEAR_MAX ? false : d.approx);
    return a + " — " + (d.to >= YEAR_MAX ? "今天" : b);
  }

  function eventsInDynasty(d) {
    return allEvents()
      .filter(function (ev) { return ev.side === "cn" && ev.year >= d.from && ev.year <= d.to; })
      .sort(function (a, b) { return a.year - b.year; });
  }

  function renderEras() {
    eraBar.innerHTML = "";
    DATA.eras.forEach(function (era) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "era-btn" + (state.era === era.id ? " active" : "");
      btn.textContent = era.label;
      btn.addEventListener("click", function () {
        state.era = era.id;
        state.selectedDynastyId = null;
        renderEras();
        renderDynastyBar();
        scrollToYear((era.from + era.to) / 2);
      });
      eraBar.appendChild(btn);
    });
  }

  function renderDynastyBar() {
    if (!dynastyBar) return;
    dynastyBar.innerHTML = "";
    (DATA.dynasties || []).forEach(function (d) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dynasty-btn" + (state.selectedDynastyId === d.id ? " active" : "");
      btn.textContent = d.label;
      btn.title = formatDynastySpan(d);
      btn.addEventListener("click", function () { selectDynasty(d.id); });
      dynastyBar.appendChild(btn);
    });
  }

  function selectDynasty(id) {
    const d = (DATA.dynasties || []).find(function (x) { return x.id === id; });
    if (!d) return;
    state.selectedDynastyId = id;
    state.selectedId = null;
    renderDynastyBar();
    renderTimeline();
    renderDynastyDetail(d);
    scrollToYear((d.from + Math.min(d.to, YEAR_MAX)) / 2);
  }

  function renderDynastyDetail(d) {
    const list = eventsInDynasty(d);
    let html = "";
    html += '<p class="kicker">中国朝代骨架</p>';
    html += "<h2>" + escapeHtml(d.label) + "</h2>";
    html += '<div class="year-line">' + formatDynastySpan(d) + "</div>";
    html += "<p>" + escapeHtml(d.blurb || "") + "</p>";
    html += '<div class="compare-box"><h3>这一朝已有的大事件</h3>';
    if (list.length) {
      html += list.map(function (ev) {
        return '<p><button class="btn ghost" data-jump="' + ev.id + '" type="button">' + escapeHtml(ev.title) + "</button> · " + formatYear(ev.year, ev.approx) + (ev.custom ? "（自己加的）" : "") + "</p>";
      }).join("");
    } else {
      html += "<p class='diff'>这一朝还很空。读到故事，就点下面按钮钉上来。</p>";
    }
    html += "</div>";
    html += '<div class="panel-actions">';
    html += '<button class="btn cinnabar" id="add-in-dynasty" type="button">在「' + escapeHtml(d.label) + '」加时间点</button>';
    html += "</div>";
    detail.className = "side-panel";
    detail.innerHTML = html;
    detail.querySelectorAll("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () { selectEvent(btn.getAttribute("data-jump")); });
    });
    const addBtn = $("add-in-dynasty");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        openEventForm({
          side: "cn",
          year: Math.round((d.from + Math.min(d.to, 2020)) / 2)
        });
      });
    }
  }

  function renderTimeline() {
    const events = allEvents()
      .filter(function (ev) { return matchesQuery(ev, state.query); })
      .sort(function (a, b) { return a.year - b.year; });
    const notes = allNotes();
    const w = stageWidth();
    stage.style.width = w + "px";
    stage.innerHTML = "";

    DATA.eras.forEach(function (era, i) {
      const band = document.createElement("div");
      band.className = "era-band";
      band.style.left = yearToX(era.from) + "px";
      band.style.width = Math.max(40, yearToX(era.to) - yearToX(era.from)) + "px";
      band.style.background = i % 2 === 0 ? "rgba(166,124,50,0.05)" : "transparent";
      const span = document.createElement("span");
      span.textContent = era.label;
      band.appendChild(span);
      stage.appendChild(band);
    });

    (DATA.dynasties || []).forEach(function (d, i) {
      const left = yearToX(d.from);
      const width = Math.max(18, yearToX(Math.min(d.to, YEAR_MAX)) - left);
      const band = document.createElement("button");
      band.type = "button";
      band.className = "dynasty-band" + (i % 2 ? " alt" : "") + (state.selectedDynastyId === d.id ? " selected" : "");
      band.style.left = left + "px";
      band.style.width = width + "px";
      band.title = d.label + " · " + formatDynastySpan(d);
      band.setAttribute("aria-label", "朝代 " + d.label);
      const name = document.createElement("span");
      name.textContent = width < 36 ? d.label.slice(0, 1) : d.label;
      band.appendChild(name);
      if (width >= 90) {
        const years = document.createElement("span");
        years.className = "dynasty-years";
        years.textContent = d.approx ? "约" : "";
        years.textContent += (d.from < 0 ? "前" + Math.abs(d.from) : d.from) + "–" + (d.to >= YEAR_MAX ? "今" : (d.to < 0 ? "前" + Math.abs(d.to) : d.to));
        band.appendChild(years);
      }
      band.addEventListener("click", function () { selectDynasty(d.id); });
      stage.appendChild(band);
    });

    const cnLabel = document.createElement("div");
    cnLabel.className = "rail-label cn";
    cnLabel.textContent = "中国";
    const westLabel = document.createElement("div");
    westLabel.className = "rail-label west";
    westLabel.textContent = "西方";
    stage.appendChild(cnLabel);
    stage.appendChild(westLabel);

    const axis = document.createElement("div");
    axis.className = "axis";
    stage.appendChild(axis);

    const step = tickStep();
    const startTick = Math.ceil(YEAR_MIN / step) * step;
    for (let y = startTick; y <= YEAR_MAX; y += step) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = yearToX(y) + "px";
      const label = document.createElement("span");
      label.textContent = y < 0 ? "前" + Math.abs(y) : String(y);
      tick.appendChild(label);
      stage.appendChild(tick);
    }

    const lastLabelX = { cn: -9999, west: -9999 };
    const labelCount = { cn: 0, west: 0 };
    events.forEach(function (ev) {
      const x = yearToX(ev.year);
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "event-dot " + ev.side
        + (ev.custom ? " custom" : "")
        + (ev.major ? " major" : "")
        + (state.selectedId === ev.id ? " selected" : "");
      dot.style.left = x + "px";
      const dyn = ev.side === "cn" ? dynastyAt(ev.year) : null;
      dot.title = (dyn ? dyn.label + " · " : "") + formatYear(ev.year, ev.approx) + " " + ev.title;
      dot.setAttribute("aria-label", ev.title);
      dot.addEventListener("click", function () { selectEvent(ev.id); });
      stage.appendChild(dot);

      const farEnough = x - lastLabelX[ev.side] > 136;
      if (state.pxPerYear >= 0.85 && (farEnough || state.selectedId === ev.id || ev.major)) {
        const lab = document.createElement("div");
        const shift = (labelCount[ev.side] % 2 === 0) ? "shift-a" : "shift-b";
        lab.className = "event-label " + ev.side + " " + shift;
        lab.style.left = x + "px";
        lab.textContent = ev.title;
        stage.appendChild(lab);
        lastLabelX[ev.side] = x;
        labelCount[ev.side] += 1;
      }
    });

    notes.forEach(function (note) {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "note-pin";
      pin.style.left = yearToX(note.year) + "px";
      pin.style.top = note.side === "west" ? "56%" : "24%";
      pin.title = "笔记 · " + note.book;
      pin.addEventListener("click", function () {
        state.mode = "notes";
        syncMode();
      });
      stage.appendChild(pin);
    });

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = '<span>上方红带=中国朝代</span><span><i class="swatch" style="background:transparent;border:2px solid #9c2b1d;box-sizing:border-box"></i>粗圈=朝代大事件</span><span><i class="swatch" style="background:#9c2b1d"></i>实心=你加的</span><span><i class="swatch" style="background:#a67c32;border-radius:1px"></i>菱形=读书笔记</span>';
    scroller.appendChild(legend);
    Array.from(scroller.querySelectorAll(".legend")).slice(0, -1).forEach(function (n) { n.remove(); });
  }

  function eventById(id) {
    return allEvents().find(function (e) { return e.id === id; });
  }

  function contemporaries(ev) {
    return allEvents().filter(function (e) {
      return e.side !== ev.side;
    }).sort(function (a, b) {
      return Math.abs(a.year - ev.year) - Math.abs(b.year - ev.year);
    }).slice(0, 3);
  }

  function pairsFor(ev) {
    return DATA.pairs.filter(function (p) { return p.cnId === ev.id || p.westId === ev.id; });
  }

  function selectEvent(id, shouldScroll) {
    state.selectedId = id;
    state.selectedDynastyId = null;
    renderDynastyBar();
    const ev = eventById(id);
    if (!ev) return;
    if (shouldScroll !== false) {
      const x = yearToX(ev.year) - scroller.clientWidth * 0.45;
      scroller.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
    }
    renderTimeline();
    renderDetail(ev);
  }

  function renderDetail(ev) {
    const otherName = ev.side === "cn" ? "西方" : "中国";
    const near = contemporaries(ev);
    const pairs = pairsFor(ev);
    const dyn = ev.side === "cn" ? dynastyAt(ev.year) : null;
    const notes = allNotes().filter(function (n) {
      return n.eventId === ev.id || (Math.abs(n.year - ev.year) <= 15 && (!n.side || n.side === ev.side || n.side === "both"));
    });

    let html = "";
    html += '<p class="kicker">' + (ev.side === "cn" ? "中国" : "西方")
      + (ev.kind === "person" ? " · 自己添加的人物" : "")
      + (ev.major ? " · 朝代大事件" : "")
      + (ev.custom && ev.kind !== "person" ? " · 自己添加" : "") + "</p>";
    html += "<h2>" + escapeHtml(ev.title) + "</h2>";
    if (ev.portrait && isSafeImage(ev.portrait.thumb)) {
      html += '<figure class="portrait"><img src="' + escapeHtml(ev.portrait.thumb) + '" alt="' + escapeHtml(ev.title) + ' 的画像" />';
      html += "<figcaption>画像来自维基共享资源";
      if (ev.portrait.license) html += " · " + escapeHtml(ev.portrait.license);
      if (ev.portrait.credit) html += " · " + escapeHtml(ev.portrait.credit);
      if (isCommonsFilePage(ev.portrait.page)) {
        html += ' · <a href="' + escapeHtml(ev.portrait.page) + '" target="_blank" rel="noopener">查看出处</a>';
      }
      html += "</figcaption></figure>";
    }
    html += '<div class="year-line">' + formatYear(ev.year, ev.approx)
      + (dyn ? " · " + escapeHtml(dyn.label) : "") + "</div>";
    if (dyn) {
      html += '<p class="diff">落在「' + escapeHtml(dyn.label) + '」色带里（' + formatDynastySpan(dyn) + "）。你可以继续在这一朝加自己的时间点。</p>";
    }
    html += "<p>" + escapeHtml(ev.summary) + "</p>";
    if (ev.why) html += "<p>" + escapeHtml(ev.why) + "</p>";
    if (ev.tags && ev.tags.length) {
      html += '<div class="tags">' + ev.tags.map(function (t) {
        return '<span class="tag">' + escapeHtml(t) + "</span>";
      }).join("") + "</div>";
    }

    html += '<div class="compare-box">';
    html += "<h3>" + otherName + "最近的事</h3>";
    if (near.length) {
      html += near.map(function (n) {
        const gap = n.year - ev.year;
        const gapText = gap === 0 ? "同一年" : (gap > 0 ? "晚 " + Math.abs(gap) + " 年" : "早 " + Math.abs(gap) + " 年");
        return '<p><button class="btn ghost" data-jump="' + n.id + '" type="button">' + escapeHtml(n.title) + "</button> · " + formatYear(n.year, n.approx) + "（" + gapText + "）</p>";
      }).join("");
    } else {
      html += "<p class='diff'>另一边还没有事件。你可以自己补一个时间点。</p>";
    }
    html += "</div>";

    pairs.forEach(function (p) {
      const otherId = p.cnId === ev.id ? p.westId : p.cnId;
      html += '<div class="compare-box">';
      html += '<div class="kind">' + (p.kind === "sync" ? "同一时期对照" : "同类对照") + "</div>";
      html += "<h3>" + escapeHtml(p.title) + "</h3>";
      html += '<p class="same">相同：' + escapeHtml(p.same) + "</p>";
      html += '<p class="diff">不同：' + escapeHtml(p.different) + "</p>";
      html += '<div class="q">想一想：' + escapeHtml(p.question) + "</div>";
      html += '<p style="margin-top:10px"><button class="btn ghost" data-jump="' + otherId + '" type="button">看另一边</button></p>';
      html += "</div>";
    });

    if (notes.length) {
      html += '<div class="compare-box"><h3>夹在这附近的笔记</h3>';
      notes.forEach(function (n) {
        html += "<p><strong>" + escapeHtml(n.book) + "</strong>：" + escapeHtml(n.excerpt || n.thought || "") + "</p>";
      });
      html += "</div>";
    }

    html += '<div class="panel-actions">';
    html += '<button class="btn indigo" id="note-here" type="button">把书钉在这一年</button>';
    if (dyn) {
      html += '<button class="btn ghost" id="see-dynasty" type="button">看「' + escapeHtml(dyn.label) + '」整朝</button>';
    }
    if (ev.custom) html += '<button class="btn ghost" id="remove-event" type="button">删除这个事件</button>';
    html += "</div>";

    detail.className = "side-panel";
    detail.innerHTML = html;
    detail.querySelectorAll("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () { selectEvent(btn.getAttribute("data-jump")); });
    });
    const noteHere = $("note-here");
    if (noteHere) noteHere.addEventListener("click", function () { openNoteForm(ev); });
    const seeDynasty = $("see-dynasty");
    if (seeDynasty && dyn) seeDynasty.addEventListener("click", function () { selectDynasty(dyn.id); });
    const removeBtn = $("remove-event");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        const store = loadStore();
        store.customEvents = (store.customEvents || []).filter(function (e) { return e.id !== ev.id; });
        saveStore(store);
        state.selectedId = null;
        detail.className = "side-panel empty";
        detail.textContent = "这个事件已删除。";
        renderTimeline();
      });
    }
  }

  function renderPairs() {
    const view = $("view-pairs");
    view.innerHTML = '<div class="card-grid"></div>';
    const grid = view.firstChild;
    DATA.pairs.forEach(function (p) {
      const cn = eventById(p.cnId);
      const west = eventById(p.westId);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pair-card";
      card.innerHTML =
        '<div class="kind">' + (p.kind === "sync" ? "同一时期" : "同类对照") + "</div>" +
        "<h3>" + escapeHtml(p.title) + "</h3>" +
        "<p>" + escapeHtml(cn.title) + " · " + formatYear(cn.year, cn.approx) + "</p>" +
        "<p>" + escapeHtml(west.title) + " · " + formatYear(west.year, west.approx) + "</p>" +
        "<p>" + escapeHtml(p.same) + "</p>";
      card.addEventListener("click", function () {
        state.mode = "timeline";
        syncMode();
        selectEvent(p.cnId);
      });
      grid.appendChild(card);
    });
  }

  function renderNotes() {
    const view = $("view-notes");
    const notes = allNotes().sort(function (a, b) { return a.year - b.year; });
    if (!notes.length) {
      view.innerHTML = '<p class="hint">还没有笔记。读到一本和历史有关的书，点「夹一页笔记」，把它钉在时间线上。</p>';
      return;
    }
    view.innerHTML = '<div class="card-grid"></div>';
    const grid = view.firstChild;
    notes.forEach(function (n) {
      const card = document.createElement("div");
      card.className = "note-card";
      card.innerHTML =
        '<div class="kind">' + formatYear(n.year) + (n.side === "west" ? " · 西方" : n.side === "cn" ? " · 中国" : "") + "</div>" +
        "<h3>" + escapeHtml(n.book) + "</h3>" +
        (n.excerpt ? "<p>读到：" + escapeHtml(n.excerpt) + "</p>" : "") +
        (n.thought ? "<p>想法：" + escapeHtml(n.thought) + "</p>" : "") +
        '<button class="btn ghost" data-del="' + n.id + '" type="button">拿掉这页</button>';
      card.querySelector("[data-del]").addEventListener("click", function () {
        const store = loadStore();
        store.notes = (store.notes || []).filter(function (x) { return x.id !== n.id; });
        saveStore(store);
        renderNotes();
        renderTimeline();
      });
      grid.appendChild(card);
    });
  }

  function syncMode() {
    document.body.setAttribute("data-mode", state.mode);
    document.querySelectorAll(".mode").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === state.mode);
    });
    if (state.mode === "pairs") renderPairs();
    if (state.mode === "notes") renderNotes();
    if (state.mode === "timeline") renderTimeline();
  }

  function openModal(html) {
    modal.innerHTML = '<div class="modal" role="dialog">' + html + "</div>";
    modal.classList.remove("hidden");
    modal.addEventListener("click", onBackdrop);
  }

  function onBackdrop(e) {
    if (e.target === modal) closeModal();
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.innerHTML = "";
    modal.removeEventListener("click", onBackdrop);
  }

  function parseYear(era, num) {
    const n = Number(num);
    if (!Number.isFinite(n) || n < 0 || n > 4000) return null;
    return era === "bce" ? -n : n === 0 ? 1 : n;
  }

  function openEventForm(preset) {
    preset = preset || {};
    const presetYear = preset.year;
    const eraVal = presetYear != null && presetYear < 0 ? "bce" : "ce";
    const yearVal = presetYear != null ? Math.abs(presetYear) : "";
    const sideVal = preset.side || "cn";
    const hintDyn = presetYear != null ? dynastyAt(presetYear) : null;
    openModal(
      "<h2>添加一个时间点</h2>" +
      '<p class="hint">书里、纪录片里看到的事，都可以钉到对应朝代上。年份大概对就行。</p>' +
      '<div class="form-row"><label>发生在哪一边</label><select id="f-side"><option value="cn">中国</option><option value="west">西方</option></select></div>' +
      '<div class="form-row"><label>年份</label><div class="era-row"><select id="f-era"><option value="bce">公元前</option><option value="ce" selected>公元</option></select><input id="f-year" type="number" min="1" max="2026" placeholder="比如 1405" /></div></div>' +
      '<p class="hint" id="f-dynasty-hint">' + (hintDyn ? "大概落在「" + escapeHtml(hintDyn.label) + "」" : "填年份后，会提示落在哪一朝") + "</p>" +
      '<div class="form-row"><label>标题（一句话）</label><input id="f-title" maxlength="40" placeholder="比如：郑和到达古里" /></div>' +
      '<div class="form-row"><label>发生了什么</label><textarea id="f-summary" placeholder="用自己的话写几句"></textarea></div>' +
      '<div class="form-row"><label>为什么有趣（选填）</label><textarea id="f-why"></textarea></div>' +
      '<div class="header-actions"><button class="btn primary" id="f-save" type="button">钉上时间线</button><button class="btn ghost" id="f-cancel" type="button">取消</button></div>'
    );
    $("f-side").value = sideVal;
    $("f-era").value = eraVal;
    if (yearVal !== "") $("f-year").value = yearVal;
    function refreshDynastyHint() {
      const y = parseYear($("f-era").value, $("f-year").value);
      const hint = $("f-dynasty-hint");
      if (!hint) return;
      if ($("f-side").value !== "cn") {
        hint.textContent = "西方一侧没有朝代色带，按年份钉即可。";
        return;
      }
      if (y == null) {
        hint.textContent = "填年份后，会提示落在哪一朝";
        return;
      }
      const d = dynastyAt(y);
      hint.textContent = d ? ("大概落在「" + d.label + "」（" + formatDynastySpan(d) + "）") : "这个年份不在已画的朝代色带里，仍然可以钉上。";
    }
    $("f-era").addEventListener("change", refreshDynastyHint);
    $("f-year").addEventListener("input", refreshDynastyHint);
    $("f-side").addEventListener("change", refreshDynastyHint);
    $("f-cancel").addEventListener("click", closeModal);
    $("f-save").addEventListener("click", function () {
      const year = parseYear($("f-era").value, $("f-year").value);
      const title = ($("f-title").value || "").trim();
      const summary = ($("f-summary").value || "").trim();
      if (year == null || year < YEAR_MIN || year > YEAR_MAX) {
        alert("请填写一个说得通的年份。");
        return;
      }
      if (!title) {
        alert("请写一个标题。");
        return;
      }
      const d = $("f-side").value === "cn" ? dynastyAt(year) : null;
      const ev = {
        id: "custom-" + Date.now(),
        year: year,
        side: $("f-side").value,
        title: title,
        summary: summary || title,
        why: ($("f-why").value || "").trim(),
        tags: ["自己添加"].concat(d ? [d.label] : []),
        custom: true
      };
      const store = loadStore();
      store.customEvents = (store.customEvents || []).concat([ev]);
      saveStore(store);
      closeModal();
      state.mode = "timeline";
      syncMode();
      selectEvent(ev.id);
    });
    $("f-year").focus();
  }

  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, "");
  }

  function parseDraftJson(text) {
    const raw = String(text || "").trim();
    const fenced = raw.match(/\{[\s\S]*\}/);
    const slice = fenced ? fenced[0] : raw;
    try {
      return JSON.parse(slice);
    } catch (e) {
      return { draft: raw, beside: "", explore: "" };
    }
  }

  function requestPersonDraft(name, yearLabel, sideLabel, dynastyLabel) {
    const prompt = [
      "你在帮一个四年级孩子认识历史人物。只输出 JSON，不要 markdown。",
      "字段：draft, beside, explore。",
      "draft：不超过90字，用孩子能懂的话，只写一两件比较确定的事；不确定就写「这一点需要你自己去书里核对」。",
      "beside：同一时期另一边（中国对西方，西方对中国）可能在发生什么，不确定就明说不确定。不超过40字。",
      "explore：一个具体的、孩子可以自己去查的问题，不要把答案写进去。",
      "人物：" + name,
      "大约时间：" + yearLabel,
      "这一边：" + sideLabel,
      dynastyLabel ? ("中国朝代：" + dynastyLabel) : "没有对应朝代色带"
    ].join("\n");
    return fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "你是谨慎的历史助教。宁可少说，不要编故事。只输出 JSON。" },
          { role: "user", content: prompt }
        ],
        model: "openai"
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("draft failed");
      return res.json();
    }).then(function (data) {
      const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
      return parseDraftJson(content);
    });
  }

  function isSafeImage(url) {
    return /^https:\/\/(upload\.wikimedia\.org|thumb\.wikimedia\.org|commons\.wikimedia\.org)\//.test(String(url || ""));
  }

  function isCommonsFilePage(url) {
    return /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(String(url || ""));
  }

  function plainMeta(html) {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }

  function licenseLabel(shortName) {
    const text = plainMeta(shortName);
    if (!text) return "许可未标明";
    if (/public domain|^pd\b|公有/i.test(text)) return "公有领域";
    return text;
  }

  function commonsFilePage(title) {
    const name = String(title || "").replace(/^File:/i, "").replace(/ /g, "_");
    return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name);
  }

  function wikiGet(base, params) {
    const query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    }).join("&");
    return fetch(base + "?" + query).then(function (res) {
      if (!res.ok) throw new Error("wiki");
      return res.json();
    });
  }

  function claimEntityId(claim) {
    try { return claim.mainsnak.datavalue.value.id || ""; } catch (e) { return ""; }
  }

  function claimText(claim) {
    try {
      const value = claim.mainsnak.datavalue.value;
      return typeof value === "string" ? value : "";
    } catch (e) { return ""; }
  }

  function entityText(entity, field) {
    const bag = (entity && entity[field]) || {};
    return (bag.zh && bag.zh.value) || (bag.en && bag.en.value) || "";
  }

  function pictureFromImageInfo(page, extra) {
    const info = (page.imageinfo || [])[0] || {};
    const mime = info.mime || "";
    if (mime.indexOf("image/") !== 0 || mime === "image/svg+xml" || mime === "image/gif") return null;
    const thumb = info.thumburl || "";
    if (!isSafeImage(thumb)) return null;
    const meta = info.extmetadata || {};
    const title = page.title || extra.fileTitle || "";
    const lowered = title.toLowerCase();
    let score = extra.score || 0;
    if (/像|画像|肖像|statue|portrait|painting/.test(lowered + title)) score += 2;
    if (/tomb|墓地|墓碑|sign|plaque/.test(lowered)) score -= 2;
    return {
      thumb: thumb,
      page: commonsFilePage(title),
      license: licenseLabel((meta.LicenseShortName || {}).value),
      credit: plainMeta((meta.Artist || {}).value).slice(0, 60),
      fileTitle: title,
      badge: extra.badge || "",
      note: extra.note || "",
      score: score
    };
  }

  function searchPersonPictures(name) {
    const wd = "https://www.wikidata.org/w/api.php";
    const commons = "https://commons.wikimedia.org/w/api.php";
    return wikiGet(wd, {
      action: "wbsearchentities",
      search: name,
      language: "zh",
      uselang: "zh",
      type: "item",
      limit: "5",
      format: "json",
      origin: "*"
    }).then(function (found) {
      const ids = (found.search || []).map(function (item) { return item.id; }).filter(Boolean);
      const entitiesPromise = ids.length ? wikiGet(wd, {
        action: "wbgetentities",
        ids: ids.join("|"),
        props: "claims|labels|descriptions",
        languages: "zh|en",
        format: "json",
        origin: "*"
      }) : Promise.resolve({ entities: {} });
      const searchPromise = wikiGet(commons, {
        action: "query",
        generator: "search",
        gsrsearch: name,
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime|extmetadata",
        iiurlwidth: "240",
        format: "json",
        origin: "*"
      }).catch(function () { return {}; });
      return Promise.all([entitiesPromise, searchPromise]);
    }).then(function (pair) {
      const entities = (pair[0].entities || {});
      const wanted = [];
      Object.keys(entities).forEach(function (id) {
        const entity = entities[id];
        if (!entity || entity.missing != null) return;
        const human = (entity.claims && entity.claims.P31 || []).some(function (claim) {
          return claimEntityId(claim) === "Q5";
        });
        const files = (entity.claims && entity.claims.P18 || []).map(claimText).filter(Boolean);
        if (!files.length) return;
        const who = entityText(entity, "label");
        const about = entityText(entity, "description");
        files.slice(0, 1).forEach(function (file) {
          wanted.push({
            fileTitle: file.indexOf("File:") === 0 ? file : ("File:" + file),
            badge: "百科选用",
            note: [who, about].filter(Boolean).join(" · "),
            score: human ? 8 : 5
          });
        });
      });
      const titles = wanted.map(function (item) { return item.fileTitle; });
      const knownPromise = titles.length ? wikiGet(commons, {
        action: "query",
        titles: titles.join("|"),
        prop: "imageinfo",
        iiprop: "url|mime|extmetadata",
        iiurlwidth: "240",
        format: "json",
        origin: "*"
      }).catch(function () { return {}; }) : Promise.resolve({});
      return knownPromise.then(function (known) {
        const pictures = [];
        const seen = {};
        function pushPicture(page, extra) {
          const picture = pictureFromImageInfo(page, extra || {});
          if (!picture || seen[picture.page]) return;
          seen[picture.page] = true;
          pictures.push(picture);
        }
        const knownPages = ((known.query || {}).pages) || {};
        Object.keys(knownPages).forEach(function (key) {
          const page = knownPages[key];
          const extra = wanted.filter(function (item) {
            return item.fileTitle === page.title || item.fileTitle.replace(/ /g, "_") === String(page.title || "").replace(/ /g, "_");
          })[0] || { score: 5, badge: "百科选用" };
          pushPicture(page, extra);
        });
        const searched = ((pair[1].query || {}).pages) || {};
        Object.keys(searched).forEach(function (key) {
          pushPicture(searched[key], { score: 1, note: "共享资源里的图，请自己看是不是这个人" });
        });
        pictures.sort(function (a, b) { return b.score - a.score; });
        return pictures.slice(0, 6);
      });
    });
  }

  function openPersonForm() {
    openModal(
      "<h2>添加一个人物</h2>" +
      '<p class="hint">先自己想一想，再请人工智能起一个很短的草稿。草稿只是参考，必须用自己的话改写，才能钉上时间线。</p>' +
      '<div class="form-row"><label>人物在哪一边</label><select id="p-side"><option value="cn">中国</option><option value="west">西方</option></select></div>' +
      '<div class="form-row"><label>大约哪一年</label><div class="era-row"><select id="p-era"><option value="bce">公元前</option><option value="ce" selected>公元</option></select><input id="p-year" type="number" min="1" max="2026" placeholder="比如 132" /></div></div>' +
      '<p class="hint" id="p-dynasty-hint">填年份后，会提示落在哪一朝</p>' +
      '<div class="form-row"><label>人物姓名</label><input id="p-name" maxlength="20" placeholder="比如：张衡" /></div>' +
      '<div class="header-actions"><button class="btn indigo" id="p-draft" type="button">请人工智能起草稿</button></div>' +
      '<p class="hint" id="p-draft-status"></p>' +
      '<div class="draft-box" id="p-draft-box" hidden></div>' +
      '<div class="form-row"><label>用我自己的话写（必填，不要照抄草稿）</label><textarea id="p-own" placeholder="比如：他做了一台能感觉地震的仪器。"></textarea></div>' +
      '<div class="form-row"><label>我还想弄清的问题（选填）</label><textarea id="p-question" placeholder="比如：地动仪到底准不准？"></textarea></div>' +
      '<div class="header-actions"><button class="btn indigo" id="p-pics" type="button">找一张可信的画像</button></div>' +
      '<p class="hint">不搜全网图片。先在百科数据里确认是哪一位，再从维基共享资源选有许可说明的图。标着「百科选用」的优先。看不清是不是这个人，就先不选。</p>' +
      '<p class="hint" id="p-pic-status"></p>' +
      '<div class="pic-grid" id="p-pic-list"></div>' +
      '<div class="header-actions"><button class="btn primary" id="p-save" type="button">钉上时间线</button><button class="btn ghost" id="p-cancel" type="button">取消</button></div>'
    );
    let lastDraft = "";
    let lastDraftCore = "";
    let pictureChoices = [];
    let selectedPicture = null;
    function refreshDynastyHint() {
      const y = parseYear($("p-era").value, $("p-year").value);
      const hint = $("p-dynasty-hint");
      if (!hint) return;
      if ($("p-side").value !== "cn") {
        hint.textContent = "西方一侧按年份钉。草稿会试着对照中国同一时期。";
        return;
      }
      if (y == null) {
        hint.textContent = "填年份后，会提示落在哪一朝";
        return;
      }
      const d = dynastyAt(y);
      hint.textContent = d ? ("大概落在「" + d.label + "」") : "这个年份不在已画的朝代色带里，仍然可以钉上。";
    }
    $("p-era").addEventListener("change", refreshDynastyHint);
    $("p-year").addEventListener("input", refreshDynastyHint);
    $("p-side").addEventListener("change", refreshDynastyHint);
    $("p-cancel").addEventListener("click", closeModal);
    $("p-pics").addEventListener("click", function () {
      const name = ($("p-name").value || "").trim();
      if (!name) { alert("先写下人物姓名。"); return; }
      const btn = $("p-pics");
      btn.disabled = true;
      selectedPicture = null;
      pictureChoices = [];
      $("p-pic-list").innerHTML = "";
      $("p-pic-status").textContent = "正在百科图库里找，请稍等…";
      searchPersonPictures(name).then(function (pictures) {
        pictureChoices = pictures;
        if (!pictures.length) {
          $("p-pic-status").textContent = "图库里还没有合适的画像。可以先不选图，用自己的话把人物钉上。";
          return;
        }
        $("p-pic-status").textContent = "点一张你确认过的。许可和出处会一起记下来。";
        $("p-pic-list").innerHTML = pictures.map(function (picture, index) {
          return '<button class="pic-card" type="button" data-pic="' + index + '">' +
            '<img src="' + escapeHtml(picture.thumb) + '" alt="" />' +
            '<span class="pic-meta">' +
            (picture.badge ? '<span class="pic-badge">' + escapeHtml(picture.badge) + "</span> " : "") +
            escapeHtml(picture.license) +
            (picture.note ? "<br>" + escapeHtml(picture.note) : "") +
            "</span></button>";
        }).join("");
      }).catch(function () {
        $("p-pic-status").textContent = "图库暂时打不开。可以先不选图，用自己的话保存。";
      }).then(function () {
        btn.disabled = false;
      });
    });
    $("p-pic-list").addEventListener("click", function (event) {
      const card = event.target.closest("[data-pic]");
      if (!card) return;
      const picture = pictureChoices[Number(card.getAttribute("data-pic"))];
      if (!picture) return;
      selectedPicture = picture;
      Array.prototype.forEach.call($("p-pic-list").children, function (node) {
        node.classList.toggle("picked", node === card);
      });
      $("p-pic-status").textContent = "已选这张。钉上时间线时会带上出处。";
    });
    $("p-draft").addEventListener("click", function () {
      const name = ($("p-name").value || "").trim();
      const year = parseYear($("p-era").value, $("p-year").value);
      if (!name) { alert("先写下人物姓名。"); return; }
      if (year == null) { alert("先填一个大概年份。"); return; }
      const side = $("p-side").value;
      const d = side === "cn" ? dynastyAt(year) : null;
      const btn = $("p-draft");
      btn.disabled = true;
      $("p-draft-status").textContent = "正在起草稿，请稍等十几秒…";
      requestPersonDraft(
        name,
        formatYear(year),
        side === "cn" ? "中国" : "西方",
        d ? d.label : ""
      ).then(function (draft) {
        const lines = [];
        if (draft.draft) lines.push(draft.draft);
        if (draft.beside) lines.push("同一时期另一边：" + draft.beside);
        if (draft.explore) lines.push("你可以自己去查：" + draft.explore);
        lastDraft = lines.join("\n");
        lastDraftCore = String(draft.draft || "").trim();
        const box = $("p-draft-box");
        box.hidden = false;
        box.textContent = lastDraft || "这次没有生成草稿，请直接用自己的话写。";
        if (draft.explore && !$("p-question").value.trim()) {
          $("p-question").value = draft.explore;
        }
        $("p-draft-status").textContent = "草稿只供参考。请用自己的话写下面一栏，照抄不能保存。";
      }).catch(function () {
        $("p-draft-status").textContent = "草稿暂时没有生成。你可以先用自己的话写，或稍后再试。";
      }).then(function () {
        btn.disabled = false;
      });
    });
    $("p-save").addEventListener("click", function () {
      const name = ($("p-name").value || "").trim();
      const year = parseYear($("p-era").value, $("p-year").value);
      const own = ($("p-own").value || "").trim();
      const question = ($("p-question").value || "").trim();
      if (!name) { alert("请写下人物姓名。"); return; }
      if (year == null || year < YEAR_MIN || year > YEAR_MAX) { alert("请填写一个说得通的年份。"); return; }
      if (normalizeText(own).length < 8) { alert("请用自己的话至少写一句。"); return; }
      if (normalizeText(own) === normalizeText(lastDraft) || (lastDraftCore && normalizeText(own) === normalizeText(lastDraftCore))) {
        alert("这和草稿一样。请改成你自己的话。");
        return;
      }
      const side = $("p-side").value;
      const d = side === "cn" ? dynastyAt(year) : null;
      const ev = {
        id: "person-" + Date.now(),
        year: year,
        side: side,
        title: name,
        summary: own,
        why: question,
        tags: ["自己添加", "人物"].concat(d ? [d.label] : []),
        custom: true,
        kind: "person"
      };
      if (selectedPicture && isSafeImage(selectedPicture.thumb) && isCommonsFilePage(selectedPicture.page)) {
        ev.portrait = {
          thumb: selectedPicture.thumb,
          page: selectedPicture.page,
          license: selectedPicture.license || "",
          credit: selectedPicture.credit || ""
        };
      }
      const store = loadStore();
      store.customEvents = (store.customEvents || []).concat([ev]);
      saveStore(store);
      closeModal();
      state.mode = "timeline";
      state.query = "";
      if (searchInput) searchInput.value = "";
      syncMode();
      selectEvent(ev.id);
    });
    $("p-name").focus();
  }

  function openNoteForm(ev) {
    const yearVal = ev ? Math.abs(ev.year) : "";
    const eraVal = ev && ev.year < 0 ? "bce" : "ce";
    const sideVal = ev ? ev.side : "cn";
    openModal(
      "<h2>夹一页读书笔记</h2>" +
      '<p class="hint">看到感兴趣的书，不必写长读后感。把「哪一年 + 读到了什么」钉住就够。</p>' +
      '<div class="form-row"><label>书名</label><input id="n-book" placeholder="比如：林汉达中国历史故事集" /></div>' +
      '<div class="form-row"><label>钉在哪一边</label><select id="n-side"><option value="cn">中国</option><option value="west">西方</option><option value="both">两边都有关</option></select></div>' +
      '<div class="form-row"><label>大约哪一年</label><div class="era-row"><select id="n-era"><option value="bce">公元前</option><option value="ce">公元</option></select><input id="n-year" type="number" min="1" max="2026" /></div></div>' +
      '<div class="form-row"><label>书里写到了什么</label><textarea id="n-excerpt" placeholder="一句原文，或你自己转述"></textarea></div>' +
      '<div class="form-row"><label>你的想法（选填）</label><textarea id="n-thought" placeholder="和地图上另一边有什么不一样？"></textarea></div>' +
      '<div class="header-actions"><button class="btn primary" id="n-save" type="button">夹上去</button><button class="btn ghost" id="n-cancel" type="button">取消</button></div>'
    );
    $("n-era").value = eraVal;
    $("n-year").value = yearVal;
    $("n-side").value = sideVal;
    $("n-cancel").addEventListener("click", closeModal);
    $("n-save").addEventListener("click", function () {
      const year = parseYear($("n-era").value, $("n-year").value);
      const book = ($("n-book").value || "").trim();
      if (!book) { alert("请写下书名。"); return; }
      if (year == null) { alert("请填年份。"); return; }
      const note = {
        id: "note-" + Date.now(),
        book: book,
        year: year,
        side: $("n-side").value,
        excerpt: ($("n-excerpt").value || "").trim(),
        thought: ($("n-thought").value || "").trim(),
        eventId: ev ? ev.id : null
      };
      const store = loadStore();
      store.notes = (store.notes || []).concat([note]);
      saveStore(store);
      closeModal();
      state.mode = "timeline";
      syncMode();
      if (ev) selectEvent(ev.id);
    });
    $("n-book").focus();
  }

  function openHelp() {
    openModal(
      '<div class="help"><h2>怎样用这张时光地图</h2>' +
      "<p>上面一条是中国，下面一条是西方。中国上方的红色色带是朝代骨架：夏商西周……一直到今天。粗圈是朝代大事件，实心圆是你自己加的，金色菱形是读书笔记。</p>" +
      "<p>点朝代色带或顶部「朝代」按钮，可以看这一朝已有哪些事，再往里加自己的时间点。</p>" +
      "<p>在时间线上滚动鼠标滚轮：向上放大、向下缩小（对准鼠标位置缩放）。按住 Shift 再滚，或左右滑动触控板，可以左右移动时间轴。</p>" +
      "<p>点「添加人物」：先请人工智能起一个很短的草稿，再用自己的话改写才能保存。草稿里会留一个你可以自己去查的问题。画像不搜全网，只从维基共享资源里选有出处的，可以不选。</p>" +
      "<p>对照卡片专门看「相同」和「不同」。有的是同一时期发生的，有的是同类事情、时间并不相同——地图会标明。</p>" +
      "<p>右上角「音乐：开/关」可播放背景曲 <em>Chinese Relaxing – Asian Meditation</em>（Pixabay / Villatic_Music，默认关闭）。</p>" +
      "<p>在线版：https://budotding1025.github.io/shiguang-map/ 。笔记存在这台电脑的浏览器里，换设备前请先「导出」。</p>" +
      '<button class="btn primary" id="help-ok" type="button">知道了</button></div>'
    );
    $("help-ok").addEventListener("click", function () {
      saveStore({ seenHelp: true });
      closeModal();
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      customEvents: loadStore().customEvents || [],
      notes: loadStore().notes || []
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "时光地图-笔记备份.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        if (!data || (data.customEvents == null && data.notes == null)) {
          alert("这个文件不像时光地图的备份。");
          return;
        }
        saveStore({
          customEvents: data.customEvents || [],
          notes: data.notes || []
        });
        renderTimeline();
        renderNotes();
        alert("已导入 " + (data.customEvents || []).length + " 个自己加的事件，" + (data.notes || []).length + " 页笔记。");
      } catch (err) {
        alert("文件打不开。");
      }
    };
    reader.readAsText(file);
  }

  function scrollToYear(year) {
    const x = yearToX(year) - scroller.clientWidth * 0.4;
    scroller.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  document.querySelectorAll(".mode").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.mode = btn.getAttribute("data-mode");
      syncMode();
    });
  });
  $("btn-add-event").addEventListener("click", function () { openEventForm(); });
  $("btn-add-person").addEventListener("click", openPersonForm);
  $("btn-add-note").addEventListener("click", function () { openNoteForm(eventById(state.selectedId)); });
  $("btn-export").addEventListener("click", exportData);
  $("btn-help").addEventListener("click", openHelp);
  $("btn-import").addEventListener("click", function () { $("import-file").click(); });
  $("import-file").addEventListener("change", function () {
    if (this.files[0]) importData(this.files[0]);
    this.value = "";
  });
  function setZoom(next, anchorClientX) {
    const prev = state.pxPerYear;
    const clamped = Math.min(4, Math.max(0.4, next));
    if (Math.abs(clamped - prev) < 0.001) return;
    const rect = scroller.getBoundingClientRect();
    const anchorX = anchorClientX != null
      ? (anchorClientX - rect.left + scroller.scrollLeft)
      : (scroller.scrollLeft + scroller.clientWidth / 2);
    const yearAtAnchor = YEAR_MIN + (anchorX - 80) / prev;
    state.pxPerYear = clamped;
    zoomInput.value = String(clamped.toFixed(1));
    renderTimeline();
    scroller.scrollLeft = yearToX(yearAtAnchor) - (anchorClientX != null
      ? (anchorClientX - rect.left)
      : scroller.clientWidth / 2);
  }

  zoomInput.addEventListener("input", function () {
    setZoom(Number(zoomInput.value));
  });
  searchInput.addEventListener("input", function () {
    state.query = (searchInput.value || "").trim().toLowerCase();
    const hits = allEvents()
      .filter(function (ev) { return matchesQuery(ev, state.query); })
      .sort(function (a, b) { return a.year - b.year; });
    if (!state.query) {
      renderTimeline();
      return;
    }
    if (!hits.length) {
      renderTimeline();
      detail.className = "side-panel empty";
      detail.textContent = "还没有记下「" + searchInput.value.trim() + "」。这张图先放朝代和大事件，你可以点「添加事件」，把书里看到的人物钉上去。";
      return;
    }
    selectEvent(hits[0].id);
  });
  scroller.addEventListener("wheel", function (e) {
    const mostlyHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (e.shiftKey || mostlyHorizontal) {
      e.preventDefault();
      scroller.scrollLeft += (mostlyHorizontal ? e.deltaX : e.deltaY);
      return;
    }
    e.preventDefault();
    const step = Math.min(0.45, Math.max(0.08, Math.abs(e.deltaY) * 0.0025));
    const next = state.pxPerYear + (e.deltaY > 0 ? -step : step);
    setZoom(next, e.clientX);
  }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
    if (state.mode !== "timeline") return;
    if (e.key === "ArrowRight") scroller.scrollLeft += 80;
    if (e.key === "ArrowLeft") scroller.scrollLeft -= 80;
    if (e.key === "=" || e.key === "+") setZoom(state.pxPerYear + 0.2);
    if (e.key === "-" || e.key === "_") setZoom(state.pxPerYear - 0.2);
  });

  renderEras();
  renderDynastyBar();
  syncMode();
  initMusic();
  scrollToYear(-100);
  if (!loadStore().seenHelp) {
    state.showHelpOnce = true;
    openHelp();
  }
})();
