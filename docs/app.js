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
    partial:  "Some Progress",
    context:  "Has Data",
    no_data:  "No state data",
    internal: "District-measured"
  };

  var GRADE_SORT = {
    "3": 1, "4": 2, "5": 3, "6": 4, "7": 5, "8": 6,
    "EOC-English1": 7, "EOC-English2": 8, "EOC-Algebra": 9,
    "EOC-Biology": 10, "EOC-USHistory": 11
  };
  var GROUP_SORT = { all: 1, econ_disadv: 2, emergent_bilingual: 3, special_ed: 4, dyslexia: 5, gifted: 6 };

  // Sort order for filters: missed first
  var RESULT_RANK = { missed: 0, met: 1, partial: 2, context: 3, no_data: 4, internal: 5 };

  // SECTIONS is built dynamically from the goals metadata in outcomes.json
  // (see buildSections() below)
  var SECTIONS = [];

  var activeFilter = null;

  // ── CISD claim display ───────────────────────────────────────────────────
  var CLAIM_ICON = {
    met:        "✓",
    significant:"◑",
    some:       "◑",
    no_progress:"✕",
    not_met:    "✕",
    not_found:  "—",
    unknown:    ""
  };
  var CLAIM_CLS = {
    met:         "claim--met",
    significant: "claim--partial",
    some:        "claim--partial",
    no_progress: "claim--missed",
    not_met:     "claim--missed",
  };

  // ── Build section list from goals metadata in payload ────────────────────
  function buildSections(data) {
    var goalMeta = {};
    (data.goals || []).forEach(function(g) { goalMeta[g.goal] = g; });
    // Collect which goal numbers actually appear in the current year
    var present = {};
    ((data.years || [])[0] || { objectives: [] }).objectives.forEach(function(o) {
      if (o.goal) present[o.goal] = true;
    });
    return Object.keys(present).sort().map(function(gk) {
      var gn = parseInt(gk, 10);
      var meta = goalMeta[gn] || {};
      return {
        key:       "goal_" + gn,
        goalNum:   gn,
        title:     "Goal " + gn + ": " + (meta.title || ("Goal " + gn)),
        desc:      meta.desc || "",
        bySubject: true   // all goals use subject sub-grouping
      };
    });
  }

  // ── Plain-language summary for the row label ──────────────────────────────
  var GRADE_LABEL = {
    "3":"3rd Grade", "4":"4th Grade", "5":"5th Grade", "6":"6th Grade",
    "7":"7th Grade", "8":"8th Grade",
    "EOC-Algebra":"Algebra I (EOC)", "EOC-English1":"English I (EOC)",
    "EOC-English2":"English II (EOC)", "EOC-Biology":"Biology (EOC)",
    "EOC-USHistory":"US History (EOC)"
  };
  var GROUP_LABEL = {
    all:"All Students", econ_disadv:"Economically Disadvantaged",
    emergent_bilingual:"Emergent Bilingual / ELL", special_ed:"Special Education",
    dyslexia:"Dyslexia Services", gifted:"Gifted & Talented"
  };
  var PERF_LABEL = { Approaches:"Approaching grade level", Meets:"Meeting grade level", Masters:"Mastering grade level" };

  function plainLabel(o) {
    // For STAAR: "3rd Grade — Reading — All Students"
    if (o.category === "staar") {
      var subj = (o.subject_group || "").replace(" (English)", "");
      var parts = [];
      if (o.grade) parts.push(GRADE_LABEL[o.grade] || ("Grade " + o.grade));
      if (subj)   parts.push(subj);
      if (o.group && o.group !== "all") parts.push(GROUP_LABEL[o.group] || o.group);
      return parts.join(" — ");
    }
    if (o.category === "ccmr")       return "College, Career, or Military Readiness (CCMR)";
    if (o.category === "graduation") return "Graduation Rate";
    if (o.category === "dropout")    return "Annual Dropout Rate";
    if (o.category === "ap")         return "AP / IB Exam Participation";
    if (o.category === "cte")        return "CTE Program Completers";
    return o.metric_label || "District Goal";
  }

  // Short plain-English description of what the goal is asking
  function goalDesc(o) {
    if (o.category === "staar") {
      var perf = o.promised && o.promised.level ? PERF_LABEL[o.promised.level] || o.promised.level : "performing";
      var grp = (o.group && o.group !== "all") ? (GROUP_LABEL[o.group] || o.group) + " students" : "students";
      var subj = (o.subject_group || "").replace(" (English)", "").toLowerCase();
      var grd = o.grade ? (GRADE_LABEL[o.grade] || ("grade " + o.grade)).toLowerCase() : "";
      return "Goal: " + grp + " in " + [grd, subj].filter(Boolean).join(" ") + " should be " + perf + " on the state exam.";
    }
    return "";
  }

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

  // ── District grade widget ─────────────────────────────────────────────────
  function renderDistrictGrade(data) {
    var widget = document.getElementById("district-grade");
    if (!widget) return;
    var dg = data.district_grade;
    if (!dg || !dg.grade) { widget.hidden = true; return; }
    var g = dg.grade;
    var schoolYear = dg.year ? (parseInt(dg.year) - 1) + "–" + dg.year.slice(-2) : "";
    widget.innerHTML =
      '<div class="grade-letter grade-letter--' + esc(g) + '">' + esc(g) + '</div>' +
      '<div class="grade-info">' +
        '<div class="grade-info__label">TEA Accountability Rating</div>' +
        '<div class="grade-info__title">Conroe ISD received a <strong>' + esc(g) + '</strong> from the Texas Education Agency</div>' +
        '<div class="grade-info__note">Based on student achievement, school progress, and closing performance gaps' +
          (schoolYear ? ' · ' + schoolYear + ' school year' : '') + '</div>' +
      '</div>';
    widget.hidden = false;
  }

  // ── Stat strip / filter buttons ──────────────────────────────────────────
  function renderStatStrip(year) {
    var objs = year.objectives || [];
    // Stat strip only reflects state-verified results (tapr_mappable === true)
    var statMet    = objs.filter(function(o){ return o.result === "met"    && o.tapr_mappable; }).length;
    var statMissed = objs.filter(function(o){ return o.result === "missed" && o.tapr_mappable; }).length;
    var diverge    = objs.filter(function(o){ return o.divergence; }).length;
    var statNoData = objs.filter(function(o){ return o.result === "no_data"; }).length;
    var strip = document.getElementById("statstrip");
    strip.innerHTML = "";

    var STATS = [
      { key:"met",     cls:"stat--met",    val:statMet,
        label:"Objectives Met",      hint:"State data confirms objective was reached" },
      { key:"missed",  cls:"stat--missed", val:statMissed,
        label:"Objectives Missed",   hint:"State data shows objective was not reached" },
      { key:"diverge", cls:"stat--diverge",val:diverge,
        label:"Claim vs. Data Gaps", hint:"CISD reported progress but state data shows the objective was missed" },
      { key:"no_data", cls:"stat--nodata", val:statNoData,
        label:"Awaiting State Data", hint:"No TEA data available yet for this objective" }
    ];

    STATS.forEach(function (st) {
      var btn = el("button", "stat " + st.cls);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.filter = st.key;
      btn.innerHTML =
        '<span class="stat__val">' + st.val + '</span>' +
        '<span class="stat__label">' + esc(st.label) + '</span>' +
        '<span class="stat__hint">' + esc(st.hint) + '</span>';
      btn.addEventListener("click", function () {
        activeFilter = activeFilter === st.key ? null : st.key;
        applyFilter();
      });
      strip.appendChild(btn);
    });
  }

  function applyFilter() {
    var strip = document.getElementById("statstrip");
    [].forEach.call(strip.querySelectorAll(".stat"), function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.filter === activeFilter ? "true" : "false");
    });
    document.querySelectorAll("details.obj").forEach(function (card) {
      var res   = card.dataset.result;
      var basis = card.dataset.basis;
      var div   = card.dataset.diverge === "true";
      var show  = true;
      // Filters operate on state-verified results only
      if (activeFilter === "met")     show = res === "met"    && basis === "state";
      if (activeFilter === "missed")  show = res === "missed" && basis === "state";
      if (activeFilter === "diverge") show = div;
      if (activeFilter === "no_data") show = (res === "no_data" || res === "context");
      card.hidden = !show;
    });
    document.querySelectorAll("details.section").forEach(function (sec) {
      sec.hidden = (activeFilter !== null && !sec.querySelectorAll("details.obj:not([hidden])").length);
    });
  }

  // ── Individual objective row ──────────────────────────────────────────────
  function renderObjective(o) {
    var row = document.createElement("details");
    row.className = "obj";
    row.dataset.result  = o.result;
    row.dataset.basis   = o.result_basis || (o.tapr_mappable ? "state" : "district");
    row.dataset.diverge = o.divergence ? "true" : "false";

    var actualStr = o.actual != null ? pct(o.actual) : (o.tapr_mappable ? "—" : "N/A");
    var actualCls = "obj__actual obj__actual--" + (o.result === "met" ? "met" : o.result === "missed" ? "missed" : "context");

    // Summary row (always visible)
    // Primary label: abbreviated DIP goal text
    // Subtitles: student group (if not all) + CISD's self-reported summative result
    var rowLabel = o.short_label || plainLabel(o);
    var grpSubtitle = (o.group && o.group !== "all") ? (GROUP_LABEL[o.group] || o.group) : null;
    var claimCode = o.claimed_code || "unknown";
    var claimText = (claimCode && claimCode !== "unknown" && claimCode !== "not_found")
      ? (CLAIM_ICON[claimCode] || "") + " CISD: " + esc(o.claimed || "")
      : null;
    var claimCls = "obj__claim " + (CLAIM_CLS[claimCode] || "claim--neutral");
    var summary = document.createElement("summary");
    var objRef = 'Goal ' + (o.goal || 1) + ', Performance Objective ' + o.objective;
    summary.innerHTML =
      '<div class="obj__summary-left">' +
        '<span class="status-dot status-dot--' + esc(o.result) + '" aria-hidden="true"></span>' +
        '<div>' +
          '<div class="obj__ref">' + esc(objRef) + '</div>' +
          '<div class="obj__label">' + esc(rowLabel) + '</div>' +
          (grpSubtitle ? '<div class="obj__plain">' + esc(grpSubtitle) + '</div>' : '') +
          (claimText ? '<div class="' + claimCls + '">' + claimText + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="obj__summary-right">' +
        (o.actual != null
          ? '<span class="' + actualCls + '">' + esc(pct(o.actual)) + '</span>'
          : (!o.tapr_mappable
             ? '<span class="obj__actual obj__actual--na">N/A</span>'
             : '')) +
        '<span class="obj__chev" aria-hidden="true">&#9660;</span>' +
      '</div>';
    row.appendChild(summary);

    // Expanded body
    var body = el("div", "obj__body");

    // Triplet
    var trip = el("div", "triplet");

    var c1 = el("div", "cell");
    c1.innerHTML =
      '<div class="cell__k">CISD Goal</div>' +
      '<div class="cell__v">' + esc(promisedText(o.promised)) + '</div>';
    trip.appendChild(c1);

    var c2 = el("div", "cell");
    c2.innerHTML =
      '<div class="cell__k">CISD Claims</div>' +
      '<div class="cell__v cell__v--muted">' + esc(o.claimed || "—") + '</div>' +
      '<div class="cell__note">Self-reported by CISD at year-end (qualitative — no percentage)</div>';
    trip.appendChild(c2);

    var c3 = el("div", "cell cell--actual" + (o.result==="met"?" is-met":o.result==="missed"?" is-missed":""));
    c3.innerHTML =
      '<div class="cell__k">State Data (TEA)</div>' +
      '<div class="cell__v">' + esc(actualStr) + '</div>' +
      (o.result === "context" ? '<div class="cell__note">State data available — no numeric target was set for comparison</div>' :
       !o.tapr_mappable ? '<div class="cell__note">Not tracked by the state; CISD uses its own assessment for this goal</div>' :
       o.result === "no_data" ? '<div class="cell__note">State report for this goal not yet available</div>' : '');
    trip.appendChild(c3);
    body.appendChild(trip);

    // Divergence callout
    if (o.divergence) {
      var d = el("div", "diverge");
      d.innerHTML =
        '<span aria-hidden="true">⚠️</span>' +
        '<span>CISD self-reports <strong>' + esc(o.claimed) + '</strong> for this goal, ' +
        'but state data shows the target was <strong>missed</strong> by ' +
        (o.actual != null && o.promised && o.promised.target != null ?
          Math.abs(Math.round(o.promised.target - o.actual)) + ' percentage points' : 'a significant margin') +
        '.</span>';
      body.appendChild(d);
    }

    // ── TEA source citation ───────────────────────────────────────────────────
    if (o.tapr_source && o.tapr_source.tapr_column) {
      var src = o.tapr_source;
      var taprYr  = src.tapr_year || "2025";
      var taprUrl = "https://rptsvr1.tea.texas.gov/perfreport/tapr/" + taprYr + "/district/d170902.html";
      var mq      = src.match_quality || "";
      var mqCls   = mq === "strong" ? "match--strong" : mq === "partial" ? "match--partial" : "match--unknown";
      var mqLabel = mq.charAt(0).toUpperCase() + mq.slice(1);

      var srcDiv = el("div", "tea-source");
      srcDiv.innerHTML =
        '<div class="tea-source__head">TEA Source Data' +
          (mq ? ' <span class="tea-source__match ' + esc(mqCls) + '">' + esc(mqLabel) + ' match</span>' : '') +
        '</div>' +
        '<dl class="tea-source__dl">' +
          '<dt>Report</dt>' +
          '<dd>' + esc(src.report || "—") + '</dd>' +
          '<dt>Column</dt>' +
          '<dd class="tea-source__col">' + esc(src.tapr_column) + '</dd>' +
        '</dl>' +
        '<a class="tea-source__link" href="' + esc(taprUrl) + '" target="_blank" rel="noopener noreferrer">' +
          'View Conroe ISD on TEA TAPR (' + esc(String(taprYr)) + ') ↗' +
        '</a>';
      body.appendChild(srcDiv);
    }

    if (o.source_pdf) {
      body.appendChild(el("div", "obj__prov",
        "DIP Source: " + esc(o.source_pdf) + (o.source_page ? ", p. " + esc(o.source_page) : "")));
    }

    // ── Strategies section ────────────────────────────────────────────────────
    if (o.strategies && o.strategies.length) {
      var REVIEW_LABEL = {
        no_progress:    "No Progress",
        some_progress:  "Some Progress",
        considerable:   "Considerable",
        accomplished:   "Accomplished",
        continue_modify:"Continue/Modify",
        discontinue:    "Discontinue"
      };
      var REVIEW_CLS = {
        no_progress:    "rev--none",
        some_progress:  "rev--some",
        considerable:   "rev--considerable",
        accomplished:   "rev--accomplished",
        continue_modify:"rev--continue",
        discontinue:    "rev--discontinue"
      };

      var stratWrap = el("div", "strategies");
      stratWrap.appendChild(el("div", "strategies__head",
        "Strategies (" + o.strategies.length + ")"));

      o.strategies.forEach(function(s) {
        var sEl = el("div", "strategy");
        var periods = [
          { label:"Dec", key:"dec_review" },
          { label:"Mar", key:"mar_review" },
          { label:"Jun", key:"jun_review" }
        ];
        var reviewHtml = periods.map(function(p) {
          var val = s[p.key];
          var cls = val ? (REVIEW_CLS[val] || "rev--none") : "rev--empty";
          var disp = val ? (REVIEW_LABEL[val] || val) : "—";
          return '<div class="rev-cell">' +
            '<div class="rev-cell__period">' + esc(p.label) + '</div>' +
            '<div class="rev-cell__val ' + esc(cls) + '">' + esc(disp) + '</div>' +
          '</div>';
        }).join("");

        sEl.innerHTML =
          '<div class="strategy__hdr">Strategy ' + s.strategy + '</div>' +
          '<div class="strategy__text">' + esc(s.text || "") + '</div>' +
          (s.expected_result
            ? '<div class="strategy__impact"><span class="strategy__impact-k">Expected result: </span>' + esc(s.expected_result) + '</div>'
            : '') +
          '<div class="strategy__reviews">' + reviewHtml + '</div>';

        stratWrap.appendChild(sEl);
      });

      body.appendChild(stratWrap);
    }

    row.appendChild(body);
    return row;
  }

  // ── Sort helpers ─────────────────────────────────────────────────────────
  function getGroup(o) {
    // Try to extract from metric_label or metric data
    if (o.metric_label) {
      if (/emergent bilingual|ELL/i.test(o.metric_label)) return "emergent_bilingual";
      if (/special ed/i.test(o.metric_label)) return "special_ed";
      if (/econ/i.test(o.metric_label)) return "econ_disadv";
      if (/dyslexia/i.test(o.metric_label)) return "dyslexia";
      if (/gifted/i.test(o.metric_label)) return "gifted";
    }
    return "all";
  }
  function getGrade(o) {
    // Extract from metric_label: "Grade 3", "3rd Grade", "Algebra I (EOC)"
    var m;
    if ((m = /Grade (\d+)/i.exec(o.metric_label))) return m[1];
    if ((m = /(\d+)(?:st|nd|rd|th) Grade/i.exec(o.metric_label))) return m[1];
    if (/Algebra I/i.test(o.metric_label)) return "EOC-Algebra";
    if (/English I (?:EOC|\()/i.test(o.metric_label)) return "EOC-English1";
    if (/English II/i.test(o.metric_label)) return "EOC-English2";
    if (/Biology/i.test(o.metric_label)) return "EOC-Biology";
    if (/US History/i.test(o.metric_label)) return "EOC-USHistory";
    return null;
  }

  function sortObjectives(list) {
    // Preserve DIP order: objectives numbered within each goal as they appear in the plan
    list.sort(function (a, b) {
      return (a.objective || 0) - (b.objective || 0);
    });
    return list;
  }

  // ── TEA Metric Card ───────────────────────────────────────────────────────
  function renderMetricCard(m) {
    var card = el("div", "metric-card");
    var allVal = m.all != null ? (m.lower_is_better ? m.all + "%" : m.all + "%") : "—";

    // Colour the headline: green if high (and not lower_is_better), red if low (heuristic)
    var valCls = "metric-card__val";
    if (m.all != null) {
      if (m.lower_is_better) {
        valCls += m.all <= 1 ? " metric-val--good" : m.all <= 3 ? " metric-val--warn" : " metric-val--bad";
      } else {
        valCls += m.all >= 80 ? " metric-val--good" : m.all >= 60 ? " metric-val--warn" : " metric-val--bad";
      }
    }

    var sgHtml = "";
    if (m.subgroups && m.subgroups.length) {
      sgHtml = '<div class="metric-card__subgroups">';
      m.subgroups.forEach(function(sg) {
        if (sg.value == null) return;
        sgHtml +=
          '<div class="metric-sg">' +
            '<span class="metric-sg__label">' + esc(sg.label) + '</span>' +
            '<span class="metric-sg__val">' + sg.value + '%</span>' +
          '</div>';
      });
      sgHtml += '</div>';
    }

    card.innerHTML =
      '<div class="metric-card__title">' + esc(m.title) + '</div>' +
      '<div class="metric-card__sub">' + esc(m.subtitle || "") + '</div>' +
      '<div class="' + valCls + '">' + esc(allVal) + '</div>' +
      sgHtml +
      (m.source_file
        ? '<div class="metric-card__src">Source: ' + esc(m.source_file.replace(/\.csv$/i,"")) + '</div>'
        : '');
    return card;
  }

  // ── TEA Section renderer ──────────────────────────────────────────────────
  function renderTeaSection(schoolYear, teaMetrics) {
    var container = document.getElementById("tea-section");
    if (!container) return;
    container.innerHTML = "";

    var districtData = (teaMetrics && teaMetrics.district && teaMetrics.district[schoolYear])
      ? teaMetrics.district[schoolYear] : null;

    // Section header + scope badge
    var hdr = el("div", "page-section__hdr");
    hdr.innerHTML =
      '<div class="page-section__title-row">' +
        '<h2 class="page-section__title">Texas Education Agency Data</h2>' +
        '<span class="scope-badge">&#128205; District</span>' +
        '<span class="scope-badge scope-badge--future" title="Campus-level data coming in a future update">Campus view — coming soon</span>' +
      '</div>' +
      '<p class="page-section__desc">Official TEA accountability data for Conroe ISD as a district. ' +
        'Sub-group breakdowns are shown where available.</p>';
    container.appendChild(hdr);

    if (!districtData) {
      container.appendChild(el("p", "loading", "No TEA data available for " + esc(schoolYear) + "."));
      return;
    }

    // Accountability grade card
    if (districtData.accountability && districtData.accountability.grade) {
      var acc = districtData.accountability;
      var gradeGroup = el("div", "metric-group");
      gradeGroup.appendChild(el("div", "metric-group__label", "Accountability"));
      var accCard = el("div", "metric-card metric-card--grade");
      accCard.innerHTML =
        '<div class="metric-card__title">TEA Accountability Rating</div>' +
        '<div class="metric-card__sub">Texas Education Agency · ' + esc(acc.tapr_year) + ' rating</div>' +
        '<div class="metric-card__grade grade-letter--' + esc(acc.grade) + '">' + esc(acc.grade) + '</div>' +
        '<div class="metric-card__src">Source: ' + esc((acc.source_file||"").replace(/\.csv$/i,"")) + '</div>';
      gradeGroup.appendChild(accCard);
      container.appendChild(gradeGroup);
    }

    // Academic performance
    if (districtData.academic_performance && districtData.academic_performance.length) {
      var acGroup = el("div", "metric-group");
      acGroup.appendChild(el("div", "metric-group__label", "Student Academic Performance"));
      var grid = el("div", "metric-grid");
      districtData.academic_performance.forEach(function(m) {
        grid.appendChild(renderMetricCard(m));
      });
      acGroup.appendChild(grid);
      container.appendChild(acGroup);
    }

    // Graduation & post-secondary
    if (districtData.graduation_postsec && districtData.graduation_postsec.length) {
      var gpGroup = el("div", "metric-group");
      gpGroup.appendChild(el("div", "metric-group__label", "Graduation & Post-Secondary Readiness"));
      var grid2 = el("div", "metric-grid");
      districtData.graduation_postsec.forEach(function(m) {
        grid2.appendChild(renderMetricCard(m));
      });
      gpGroup.appendChild(grid2);
      container.appendChild(gpGroup);
    }
  }

  // ── Year renderer ─────────────────────────────────────────────────────────
  function renderYear(year, teaMetrics) {
    activeFilter = null;
    renderTeaSection(year.school_year, teaMetrics);
    renderStatStrip(year);

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
        '<span class="section__count">' + list.length + ' objective' + (list.length !== 1 ? 's' : '') + '</span>' +
        '<span class="section__chev" aria-hidden="true">&#9660;</span>';
      details.appendChild(summary);

      details.appendChild(el("p", "section__desc", esc(sec.desc)));

      // List objectives in DIP order (by objective number), no subject sub-grouping
      sortObjectives(list).forEach(function (o) { details.appendChild(renderObjective(o)); });
      container.appendChild(details);
    });

    applyFilter();
  }

  // ── Placeholder year (no data yet) ───────────────────────────────────────
  function renderPlaceholderYear(label) {
    activeFilter = null;

    // Clear TEA section
    var teaSec = document.getElementById("tea-section");
    if (teaSec) teaSec.innerHTML = "";

    // Stat strip: non-interactive dashes
    var strip = document.getElementById("statstrip");
    strip.innerHTML =
      '<div class="stat stat--future stat--met">'    + '<span class="stat__val">—</span><span class="stat__label">Objectives Met</span>'    + '</div>' +
      '<div class="stat stat--future stat--missed">' + '<span class="stat__val">—</span><span class="stat__label">Objectives Missed</span>' + '</div>' +
      '<div class="stat stat--future stat--diverge">'+ '<span class="stat__val">—</span><span class="stat__label">Claim vs. Data Gaps</span>'+ '</div>'+
      '<div class="stat stat--future stat--nodata">' + '<span class="stat__val">—</span><span class="stat__label">Awaiting State Data</span>'+ '</div>';

    // Objectives area: red "no data" banner
    var container = document.getElementById("objectives");
    container.innerHTML = "";
    var banner = el("div", "no-data-banner");
    banner.innerHTML =
      '<div class="no-data-banner__icon" aria-hidden="true">&#128203;</div>' +
      '<div class="no-data-banner__body">' +
        '<strong class="no-data-banner__title">No data available for ' + esc(label) + '</strong>' +
        '<p class="no-data-banner__msg">The ' + esc(label) + ' District Improvement Plan has not yet been published. ' +
        'This tab will be updated once CISD adopts its annual plan and TEA releases the corresponding accountability data.</p>' +
      '</div>';
    container.appendChild(banner);
  }

  // ── Year tabs ────────────────────────────────────────────────────────────
  function renderTabs(data, onPick) {
    var tabs = document.getElementById("yeartabs");
    tabs.innerHTML = "";

    // Prepend upcoming year as a placeholder (no data yet)
    var futureLabel = "2025–26";
    var futureBtn = el("button", "yeartab yeartab--future", esc(futureLabel));
    futureBtn.setAttribute("role", "tab");
    futureBtn.setAttribute("aria-selected", "false");
    futureBtn.setAttribute("title", "No data available yet for " + futureLabel);
    futureBtn.addEventListener("click", function () {
      [].forEach.call(tabs.children, function (c) { c.setAttribute("aria-selected", "false"); });
      futureBtn.setAttribute("aria-selected", "true");
      renderPlaceholderYear(futureLabel);
    });
    tabs.appendChild(futureBtn);

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

  // ── Boot ─────────────────────────────────────────────────────────────────
  fetch("data/outcomes.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data.years || !data.years.length) {
        document.getElementById("statstrip").innerHTML = '<p class="err">No outcome data available yet.</p>';
        return;
      }

      // Build section list from goals metadata (replaces hardcoded SECTIONS)
      SECTIONS = buildSections(data);

      renderDistrictGrade(data);

      if (data.data_as_of) {
        document.getElementById("fresh-dip").textContent = data.data_as_of.dip || "—";
        document.getElementById("fresh-tea").textContent = data.data_as_of.tea || "—";
        document.getElementById("freshness").hidden = false;
      }

      var teaMetrics = data.tea_metrics || null;
      renderTabs(data, function(yr) { SECTIONS = buildSections(data); renderYear(yr, teaMetrics); });
      renderYear(data.years[0], teaMetrics);

      document.getElementById("foot-prov").textContent =
        data.provenance || "An independent project — not affiliated with Conroe ISD.";
      if (data.generated_at) {
        document.getElementById("foot-gen").textContent =
          "Last updated " + new Date(data.generated_at).toLocaleDateString("en-US",
            { year:"numeric", month:"long", day:"numeric" });
      }
    })
    .catch(function (e) {
      document.getElementById("statstrip").innerHTML =
        '<p class="err">Could not load outcomes data (' + esc(e.message) + ').</p>';
    });
})();
