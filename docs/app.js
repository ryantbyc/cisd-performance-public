/* CISD Student Performance — renders docs/data/outcomes.json. Vanilla JS. */
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
    met: "Met", missed: "Missed", no_data: "No state data", internal: "Internal"
  };
  // Order objectives within a group: problems first, then wins, then pending.
  var RESULT_RANK = { missed: 0, met: 1, no_data: 2, internal: 3 };

  // Reader-friendly top-level sections, in display order.
  var SECTIONS = [
    { key: "standardized_testing", title: "Standardized Testing", bySubject: true,
      desc: "How students score on the state's STAAR and end-of-course exams, by subject." },
    { key: "attendance_graduation", title: "Attendance & Graduation",
      desc: "Whether students stay enrolled, graduate on time, and avoid dropping out." },
    { key: "postsecondary", title: "Postsecondary Readiness",
      desc: "College, career, and military readiness — including AP/IB and career & technical programs." },
    { key: "other", title: "Other District Goals",
      desc: "Goals CISD measures with its own assessments, which have no direct state-data equivalent." }
  ];

  // Describe the "promised" target in words
  function promisedText(p) {
    if (!p) return "—";
    if (p.type === "range" && p.target != null)
      return (p.baseline != null ? p.baseline + "% → " : "") + p.target + "%";
    if (p.type === "threshold" && p.target != null)
      return (p.threshold_dir === "max" ? "≤ " : "≥ ") + p.target + "%";
    if (p.type === "delta" && p.delta != null)
      return "+" + p.delta + "%" + (p.baseline != null ? " (from " + p.baseline + "%)" : "");
    if (p.type === "target_only" && p.target != null)
      return "≥ " + p.target + "%";
    return "Not quantified";
  }

  function renderStatStrip(year) {
    var s = year.summary || {};
    var diverge = (year.objectives || []).filter(function (o) { return o.divergence; }).length;
    var strip = document.getElementById("statstrip");
    strip.innerHTML = "";
    var stats = [
      { cls: "stat--met",     val: s.met || 0,    label: "Goals met" },
      { cls: "stat--missed",  val: s.missed || 0, label: "Goals missed" },
      { cls: "stat--diverge", val: diverge,       label: "Claim vs. data gaps" },
      { cls: "stat--nodata",  val: s.no_data || 0,label: "Awaiting state data" }
    ];
    stats.forEach(function (st) {
      var d = el("div", "stat " + st.cls);
      d.appendChild(el("div", "stat__val", String(st.val)));
      d.appendChild(el("div", "stat__label", esc(st.label)));
      strip.appendChild(d);
    });
  }

  function renderObjective(o) {
    var card = el("div", "obj");
    card.setAttribute("data-result", o.result);

    var top = el("div", "obj__top");
    var labelWrap = el("div", "obj__label");
    labelWrap.innerHTML = esc(o.metric_label) +
      '<div class="obj__cat">Objective ' + esc(o.objective) +
      (o.category ? " · " + esc(o.category.toUpperCase()) : "") + '</div>';
    top.appendChild(labelWrap);
    top.appendChild(el("span", "badge badge--" + o.result, RESULT_BADGE[o.result] || o.result));
    card.appendChild(top);

    // Triplet: promised / claimed / actual
    var trip = el("div", "triplet");

    var c1 = el("div", "cell");
    c1.innerHTML = '<div class="cell__k">CISD Promised</div>' +
      '<div class="cell__v">' + esc(promisedText(o.promised)) + '</div>';
    trip.appendChild(c1);

    var c2 = el("div", "cell");
    c2.innerHTML = '<div class="cell__k">CISD Claims</div>' +
      '<div class="cell__v cell__v--muted">' + esc(o.claimed || "—") + '</div>';
    trip.appendChild(c2);

    var c3 = el("div", "cell cell--actual" +
      (o.result === "met" ? " is-met" : o.result === "missed" ? " is-missed" : ""));
    var actualStr = o.actual != null ? pct(o.actual)
      : (o.tapr_mappable ? "Pending" : "n/a");
    c3.innerHTML = '<div class="cell__k">State Data (TAPR)</div>' +
      '<div class="cell__v">' + esc(actualStr) + '</div>';
    trip.appendChild(c3);

    card.appendChild(trip);

    if (o.divergence) {
      var d = el("div", "diverge");
      d.innerHTML = '<span aria-hidden="true">⚠</span><span>CISD self-reports <strong>' +
        esc(o.claimed) + '</strong>, but state data shows this target was <strong>missed</strong>.</span>';
      card.appendChild(d);
    }

    if (o.source_pdf) {
      card.appendChild(el("div", "obj__prov",
        "Source: " + esc(o.source_pdf) + (o.source_page ? ", p. " + esc(o.source_page) : "")));
    }
    return card;
  }

  function sortObjectives(list) {
    list.sort(function (a, b) {
      var ra = RESULT_RANK[a.result], rb = RESULT_RANK[b.result];
      if (ra !== rb) return ra - rb;
      return a.objective - b.objective;
    });
    return list;
  }

  function renderYear(year) {
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

      var secEl = el("section", "section");
      secEl.appendChild(el("h2", "section__head", esc(sec.title)));
      secEl.appendChild(el("p", "section__desc", esc(sec.desc)));

      if (sec.bySubject) {
        // sub-group by subject_group, preserving a sensible subject order
        var bySubj = {};
        var order = [];
        sortObjectives(list).forEach(function (o) {
          var sg = o.subject_group || "Other";
          if (!bySubj[sg]) { bySubj[sg] = []; order.push(sg); }
          bySubj[sg].push(o);
        });
        order.forEach(function (sg) {
          secEl.appendChild(el("h3", "subject__head", esc(sg)));
          bySubj[sg].forEach(function (o) { secEl.appendChild(renderObjective(o)); });
        });
      } else {
        sortObjectives(list).forEach(function (o) { secEl.appendChild(renderObjective(o)); });
      }
      container.appendChild(secEl);
    });
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
        document.getElementById("statstrip").innerHTML =
          '<p class="err">No outcome data available yet.</p>';
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
