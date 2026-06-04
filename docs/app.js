/* CISD Performance Review — renders docs/data/outcomes.json. Vanilla JS. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pct(n) { return (n == null || isNaN(n)) ? "—" : Math.round(n) + "%"; }

  var RESULT_BADGE = {
    met:      "Met",
    missed:   "Missed",
    context:  "Has Data",
    no_data:  "No state data",
    internal: "District-measured"
  };
  // Sort order within a section: problems first, then wins, then pending
  var RESULT_RANK = { missed: 0, met: 1, context: 2, no_data: 3, internal: 4 };

  // Reader-friendly sections, in display order
  var SECTIONS = [
    { key: "standardized_testing", title: "Standardized Testing", bySubject: true,
      desc: "How students score on the state's STAAR and end-of-course exams, by subject. Note: STAAR is transitioning — this section covers testing through the current available school year." },
    { key: "attendance_graduation", title: "Attendance & Graduation",
      desc: "Whether students stay enrolled, graduate on time, and avoid dropping out." },
    { key: "postsecondary", title: "Postsecondary Readiness",
      desc: "College, career, and military readiness — including AP/IB and career & technical education programs." },
    { key: "other", title: "Other District Goals",
      desc: "Goals CISD measures with its own internal assessments. No direct state-data equivalent is available for these." }
  ];

  // Active filter state
  var activeFilter = null;

  function promisedText(p) {
    if (!p) return "—";
    if (p.type === "range" && p.target != null)
      return (p.baseline != null ? p.baseline + "% → " : "") + p.target + "%";
    if (p.type === "threshold" && p.target != null)
      return (p.threshold_dir === "max" ? "≤ " : "≥ ") + p.target + "%";
    if (p.type === "delta" && p.delta != null)
      return "+" + p.delta + "%" + (p.baseline != null ? " from " + p.baseline + "%" : "");
    if (p.type === "target_only" && p.target != null)
      return "≥ " + p.target + "%";
    return "Not quantified";
  }

  function renderStatStrip(year) {
    var objs = year.objectives || [];
    var s = year.summary || {};
    var diverge = objs.filter(function (o) { return o.divergence; }).length;
    var strip = document.getElementById("statstrip");
    strip.innerHTML = "";

    var STATS = [
      { key: "met",     cls: "stat--met",     val: s.met || 0,
        label: "Goals Met",     hint: "Click to filter" },
      { key: "missed",  cls: "stat--missed",  val: s.missed || 0,
        label: "Goals Missed",  hint: "Click to filter" },
      { key: "diverge", cls: "stat--diverge", val: diverge,
        label: "Claim vs. Data Gaps", hint: "CISD claimed progress, state data shows miss" },
      { key: "no_data", cls: "stat--nodata",  val: (s.no_data || 0),
        label: "Awaiting State Data", hint: "Click to filter" }
    ];

    STATS.forEach(function (st) {
      var btn = el("button", "stat " + st.cls);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("data-filter", st.key);
      btn.innerHTML =
        '<span class="stat__val">' + st.val + '</span>' +
        '<span class="stat__label">' + esc(st.label) + '</span>' +
        '<span class="stat__hint">' + esc(st.hint) + '</span>';
      btn.addEventListener("click", function () {
        var isActive = activeFilter === st.key;
        // toggle off if same filter clicked again
        activeFilter = isActive ? null : st.key;
        applyFilter(strip, year);
      });
      strip.appendChild(btn);
    });
  }

  function applyFilter(strip, year) {
    // Update button pressed states
    [].forEach.call(strip.querySelectorAll(".stat"), function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.filter === activeFilter ? "true" : "false");
    });

    // Show/hide objective cards based on filter
    var cards = document.querySelectorAll(".obj");
    cards.forEach(function (card) {
      var res = card.dataset.result;
      var diverges = card.dataset.diverge === "true";
      var show = true;
      if (activeFilter === "met")      show = (res === "met");
      if (activeFilter === "missed")   show = (res === "missed");
      if (activeFilter === "diverge")  show = diverges;
      if (activeFilter === "no_data")  show = (res === "no_data" || res === "context");
      card.hidden = !show;
    });

    // Show/hide empty section details
    document.querySelectorAll("details.section").forEach(function (sec) {
      var visible = sec.querySelectorAll(".obj:not([hidden])").length;
      sec.hidden = (visible === 0 && activeFilter !== null);
    });
  }

  function renderObjective(o) {
    var card = el("div", "obj");
    card.dataset.result = o.result;
    card.dataset.diverge = o.divergence ? "true" : "false";

    // Header row: label + badge
    var top = el("div", "obj__top");
    var labelWrap = el("div", "obj__label");
    labelWrap.innerHTML =
      esc(o.metric_label) +
      '<div class="obj__cat">Objective ' + esc(o.objective) +
      (o.category && o.category !== "staar" ? " · " + esc(o.category.toUpperCase()) : "") +
      '</div>';
    top.appendChild(labelWrap);
    top.appendChild(el("span", "badge badge--" + o.result, RESULT_BADGE[o.result] || o.result));
    card.appendChild(top);

    // Three-column triplet
    var trip = el("div", "triplet");

    // Promised
    var c1 = el("div", "cell");
    c1.innerHTML =
      '<div class="cell__k">CISD Goal</div>' +
      '<div class="cell__v">' + esc(promisedText(o.promised)) + '</div>';
    trip.appendChild(c1);

    // Claimed — explain the qualitative scale
    var c2 = el("div", "cell");
    c2.innerHTML =
      '<div class="cell__k">CISD Claims</div>' +
      '<div class="cell__v cell__v--muted">' + esc(o.claimed || "—") + '</div>' +
      '<div class="cell__note">CISD self-rating (qualitative — no number)</div>';
    trip.appendChild(c2);

    // Actual
    var actualStr = o.actual != null ? pct(o.actual) : (o.tapr_mappable ? "Pending" : "n/a");
    var actualCls = "cell cell--actual" +
      (o.result === "met" ? " is-met" : o.result === "missed" ? " is-missed" : "");
    var c3 = el("div", actualCls);
    c3.innerHTML =
      '<div class="cell__k">State Data (TEA)</div>' +
      '<div class="cell__v">' + esc(actualStr) + '</div>' +
      (o.result === "context" ? '<div class="cell__note">No target set — for reference</div>' : '');
    trip.appendChild(c3);

    card.appendChild(trip);

    // Divergence callout
    if (o.divergence) {
      var d = el("div", "diverge");
      d.innerHTML =
        '<span aria-hidden="true">⚠️</span><span>CISD self-reports <strong>' +
        esc(o.claimed) + '</strong>, but state data shows the goal was <strong>missed</strong>.</span>';
      card.appendChild(d);
    }

    if (o.source_pdf) {
      card.appendChild(el("div", "obj__prov",
        "Source: " + esc(o.source_pdf) + (o.source_page ? ", p. " + esc(o.source_page) : "")));
    }
    return card;
  }

  function sortObjectives(list) {
    list.sort(function (a, b) {
      var ra = RESULT_RANK[a.result] != null ? RESULT_RANK[a.result] : 99;
      var rb = RESULT_RANK[b.result] != null ? RESULT_RANK[b.result] : 99;
      if (ra !== rb) return ra - rb;
      return a.objective - b.objective;
    });
    return list;
  }

  function renderYear(year) {
    var strip = document.getElementById("statstrip");
    activeFilter = null;
    renderStatStrip(year);
    document.getElementById("legend").hidden = false;

    var container = document.getElementById("objectives");
    container.innerHTML = "";

    var bySection = {};
    (year.objectives || []).forEach(function (o) {
      var k = o.section || "other";
      (bySection[k] = bySection[k] || []).push(o);
    });

    SECTIONS.forEach(function (sec) {
      var list = bySection[sec.key];
      if (!list || !list.length) return;

      var details = document.createElement("details");
      details.className = "section";
      details.setAttribute("open", "");

      var summary = document.createElement("summary");
      summary.innerHTML =
        '<span class="section__head">' + esc(sec.title) + '</span>' +
        '<span class="section__count">' + list.length + ' goal' + (list.length !== 1 ? 's' : '') + '</span>' +
        '<span class="section__chev" aria-hidden="true">&#9660;</span>';
      details.appendChild(summary);

      // Description paragraph (outside summary, inside details)
      var desc = el("p", "section__desc", esc(sec.desc));
      details.appendChild(desc);

      if (sec.bySubject) {
        var bySubj = {}, subjOrder = [];
        sortObjectives(list).forEach(function (o) {
          var sg = o.subject_group || "Other";
          if (!bySubj[sg]) { bySubj[sg] = []; subjOrder.push(sg); }
          bySubj[sg].push(o);
        });
        subjOrder.forEach(function (sg) {
          details.appendChild(el("h3", "subject__head", esc(sg)));
          bySubj[sg].forEach(function (o) { details.appendChild(renderObjective(o)); });
        });
      } else {
        sortObjectives(list).forEach(function (o) { details.appendChild(renderObjective(o)); });
      }
      container.appendChild(details);
    });

    // Wire up filter after all cards are in the DOM
    applyFilter(strip, year);
  }

  function renderTabs(data, onPick) {
    var tabs = document.getElementById("yeartabs");
    tabs.innerHTML = "";
    data.years.forEach(function (y, i) {
      var b = el("button", "yeartab", esc(y.school_year));
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.addEventListener("click", function () {
        [].forEach.call(tabs.children, function (c) { c.setAttribute("aria-selected", "false"); });
        b.setAttribute("aria-selected", "true");
        onPick(y);
      });
      tabs.appendChild(b);
    });
  }

  fetch("data/outcomes.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data.years || !data.years.length) {
        document.getElementById("statstrip").innerHTML = '<p class="err">No outcome data available yet.</p>';
        return;
      }

      // Data freshness bar
      if (data.data_as_of) {
        document.getElementById("fresh-dip").textContent = data.data_as_of.dip || "—";
        document.getElementById("fresh-tea").textContent = data.data_as_of.tea || "—";
        document.getElementById("freshness").hidden = false;
      }

      renderTabs(data, renderYear);
      renderYear(data.years[0]);

      document.getElementById("foot-prov").textContent =
        data.provenance || "An independent project — not affiliated with Conroe ISD.";
      if (data.generated_at) {
        document.getElementById("foot-gen").textContent =
          "Last updated " + new Date(data.generated_at).toLocaleDateString("en-US",
            { year: "numeric", month: "long", day: "numeric" });
      }
    })
    .catch(function (e) {
      document.getElementById("statstrip").innerHTML =
        '<p class="err">Could not load outcomes data (' + esc(e.message) + ').</p>';
    });
})();
