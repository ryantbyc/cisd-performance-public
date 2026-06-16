/* CISD Performance Review — renders docs/data/outcomes.json. Vanilla JS. */
(function () {
  "use strict";

  // ── Site-nav toggle (mobile "All Sites" button) ──────────────────────────
  document.querySelectorAll(".sitenav__tog").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var nav  = btn.closest(".sitenav");
      var open = nav.hasAttribute("data-open");
      if (open) {
        nav.removeAttribute("data-open");
        btn.setAttribute("aria-expanded", "false");
        btn.innerHTML = "All Sites &#9660;";
      } else {
        nav.setAttribute("data-open", "");
        btn.setAttribute("aria-expanded", "true");
        btn.innerHTML = "All Sites &#9650;";
      }
    });
  });


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

  // Module-level refs set at boot so renderPlaceholderYear can update the CIP section
  var _appData    = null;
  var _teaMetrics = null;

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

  // renderDistrictGrade removed — accountability now shown inside the TEA Data section

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
    // Scope to DIP objectives only — avoids touching CIP objectives
    var dipContainer = document.getElementById("objectives");
    if (!dipContainer) return;
    dipContainer.querySelectorAll("details.obj").forEach(function (card) {
      var res   = card.dataset.result;
      var basis = card.dataset.basis;
      var div   = card.dataset.diverge === "true";
      var show  = true;
      if (activeFilter === "met")     show = res === "met"    && basis === "state";
      if (activeFilter === "missed")  show = res === "missed" && basis === "state";
      if (activeFilter === "diverge") show = div;
      if (activeFilter === "no_data") show = (res === "no_data" || res === "context");
      card.hidden = !show;
    });
    dipContainer.querySelectorAll("details.section").forEach(function (sec) {
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
             : '<span class="obj__actual obj__actual--missed">No data</span>')) +
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

    var c3 = el("div", "cell cell--actual" + (o.result==="met"?" is-met":(o.result==="missed"||(o.result==="no_data"&&o.tapr_mappable))?" is-missed":""));
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
      var taprUrl = "https://rptsvr1.tea.texas.gov/cgi/sas/broker?_service=marykay&_program=perfrept.perfmast.sas&_debug=0&ccyy=" + taprYr + "&lev=D&id=170902&prgopt=reports/tapr/paper_tapr.sas";
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
          'View Conroe ISD TAPR Report (' + esc(String(taprYr)) + ') PDF ↗' +
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
    var isPending = m.pending_release && m.all == null;
    var allVal = m.all != null ? m.all + "%" : (isPending ? "Pending Release" : "—");

    // Colour the headline: green if high (and not lower_is_better), red if low (heuristic)
    var valCls = "metric-card__val";
    if (m.all != null) {
      if (m.lower_is_better) {
        valCls += m.all <= 1 ? " metric-val--good" : m.all <= 3 ? " metric-val--warn" : " metric-val--bad";
      } else {
        valCls += m.all >= 80 ? " metric-val--good" : m.all >= 60 ? " metric-val--warn" : " metric-val--bad";
      }
    } else if (isPending) {
      valCls += " metric-val--pending";
    }

    var sgHtml = "";
    if (m.subgroups && m.subgroups.length) {
      var visibleSgs = m.subgroups.filter(function(sg) { return sg.value != null; });
      var pendingSgs = m.subgroups.filter(function(sg) { return sg.value == null && sg.pending_release; });
      if (visibleSgs.length) {
        sgHtml = '<div class="metric-card__subgroups">';
        visibleSgs.forEach(function(sg) {
          sgHtml +=
            '<div class="metric-sg">' +
              '<span class="metric-sg__label">' + esc(sg.label) + '</span>' +
              '<span class="metric-sg__val">' + sg.value + '%</span>' +
            '</div>';
        });
        sgHtml += '</div>';
      } else if (pendingSgs.length) {
        sgHtml = '<div class="metric-card__subgroups metric-card__subgroups--pending">' +
          '<span class="metric-sg__pending">Subgroup data pending release</span>' +
          '</div>';
      }
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

  // ── Campus selector ──────────────────────────────────────────────────────
  var CAMPUS_TYPE_LABELS = { S: "High Schools", M: "Middle Schools", E: "Elementary", B: "K-12" };
  var DIST_LABELS = {
    exceeds_growth:       "Exceeds Growth",
    exceeds_closing_gaps: "Exceeds Closing Gaps",
    reading_ela:          "Reading/ELA",
    math:                 "Math",
    science:              "Science",
    social_studies:       "Social Studies",
    post_secondary:       "Post-Secondary",
  };

  function renderCampusSelector(schoolYear, teaMetrics, onBack) {
    var container = document.getElementById("tea-section");
    if (!container) return;
    container.innerHTML = "";

    var campusList = (teaMetrics && teaMetrics.campuses && teaMetrics.campuses[schoolYear])
      ? teaMetrics.campuses[schoolYear] : null;

    if (!campusList || !campusList.length) {
      container.appendChild(el("p", "loading",
        "Campus-level TAPR data is not yet available for " + esc(schoolYear) + "."));
      // Show back button
      var backBtn = el("button", "campus-back-btn", "← Back to District view");
      backBtn.addEventListener("click", onBack);
      container.insertBefore(backBtn, container.firstChild);
      return;
    }

    var wrap = el("div", "campus-selector");

    // Type filter bar
    var typeBar = el("div", "campus-selector__type-bar");
    var allTypes = ["all", "S", "M", "E", "B"];
    var typeLabels = { all: "All Campuses", S: "High Schools", M: "Middle Schools", E: "Elementary", B: "K-12" };
    var activeType = "all";

    // Back-to-district button
    var backBtn2 = el("button", "campus-back-btn", "← District view");
    backBtn2.style.marginBottom = "var(--sp-4)";
    backBtn2.style.display = "block";
    backBtn2.addEventListener("click", onBack);
    wrap.appendChild(backBtn2);

    var campusGrid = el("div", "campus-grid");

    function renderGrid() {
      campusGrid.innerHTML = "";
      var filtered = activeType === "all"
        ? campusList
        : campusList.filter(function(c) { return c.type === activeType; });
      filtered.forEach(function(campus) {
        var grade = campus.overall_grade || "—";
        var gradeCls = (grade.length === 1 && "ABCDF".indexOf(grade) >= 0)
          ? "campus-card__grade--" + grade
          : "campus-card__grade--none";
        var distKeys = Object.keys(campus.distinctions || {}).filter(function(k) {
          return campus.distinctions[k];
        });
        var distHtml = distKeys.map(function(k) {
          return '<span class="dist-tag">' + esc(DIST_LABELS[k] || k) + '</span>';
        }).join("");

        var card = el("button", "campus-card");
        card.setAttribute("aria-selected", "false");
        card.innerHTML =
          '<div class="campus-card__grade ' + esc(gradeCls) + '">' + esc(grade) + '</div>' +
          '<div class="campus-card__info">' +
            '<div class="campus-card__name">' + esc(campus.short_name || campus.name) + '</div>' +
            '<div class="campus-card__meta">' + esc(CAMPUS_TYPE_LABELS[campus.type] || campus.type) +
              (campus.grade_span ? " · " + esc(campus.grade_span) : "") + '</div>' +
            (distHtml ? '<div class="campus-card__dists">' + distHtml + '</div>' : '') +
          '</div>';
        card.addEventListener("click", function() {
          renderCampusDetail(campus, schoolYear, teaMetrics, onBack);
        });
        campusGrid.appendChild(card);
      });
    }

    allTypes.forEach(function(type) {
      // Only show types that have campuses
      var hasType = type === "all" || campusList.some(function(c) { return c.type === type; });
      if (!hasType) return;
      var btn = el("button", "campus-type-btn", esc(typeLabels[type] || type));
      btn.setAttribute("aria-selected", type === activeType ? "true" : "false");
      btn.addEventListener("click", function() {
        activeType = type;
        [].forEach.call(typeBar.children, function(b) { b.setAttribute("aria-selected", "false"); });
        btn.setAttribute("aria-selected", "true");
        renderGrid();
      });
      typeBar.appendChild(btn);
    });

    wrap.appendChild(typeBar);
    renderGrid();
    wrap.appendChild(campusGrid);

    // Bottom back link
    var bottomBack = el("button", "campus-back-btn", "← District view");
    bottomBack.style.marginTop = "var(--sp-5)";
    bottomBack.style.display = "block";
    bottomBack.addEventListener("click", onBack);
    wrap.appendChild(bottomBack);

    container.appendChild(wrap);
  }

  function renderCampusDetail(campus, schoolYear, teaMetrics, onBack) {
    var container = document.getElementById("tea-section");
    if (!container) return;
    container.innerHTML = "";
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    var grade = campus.overall_grade || "—";
    var gradeCls = (grade.length === 1 && "ABCDF".indexOf(grade) >= 0)
      ? "campus-card__grade--" + grade : "campus-card__grade--none";

    // Header
    var hdr = el("div", "campus-detail-hdr");
    var backBtn = el("button", "campus-back-btn", "← All campuses");
    backBtn.addEventListener("click", function() {
      renderCampusSelector(schoolYear, teaMetrics, onBack);
    });
    hdr.appendChild(backBtn);

    var titleWrap = el("div", "");
    titleWrap.innerHTML =
      '<div class="campus-detail__name">' + esc(campus.short_name || campus.name) + '</div>' +
      '<div class="campus-detail__meta">' +
        esc(CAMPUS_TYPE_LABELS[campus.type] || campus.type) +
        (campus.grade_span ? " · Grades " + esc(campus.grade_span) : "") +
      '</div>';
    hdr.appendChild(titleWrap);
    container.appendChild(hdr);

    // Accountability grade card
    var gradeGroup = el("div", "metric-group");
    gradeGroup.appendChild(el("div", "metric-group__label", "Accountability"));
    var accCard = el("div", "district-grade");
    accCard.innerHTML =
      '<div class="grade-letter grade-letter--' + esc(grade) + '">' + esc(grade) + '</div>' +
      '<div class="grade-info">' +
        '<div class="grade-info__label">TEA Accountability Rating</div>' +
        '<div class="grade-info__title">' + esc(campus.short_name || campus.name) +
          ' received a <strong>' + esc(grade) + '</strong> from the Texas Education Agency</div>' +
        '<div class="grade-info__note">Based on student achievement, school progress, and closing performance gaps · 2024–25</div>' +
      '</div>';
    gradeGroup.appendChild(accCard);
    container.appendChild(gradeGroup);

    // Distinctions
    var distKeys = Object.keys(campus.distinctions || {}).filter(function(k) {
      return campus.distinctions[k];
    });
    if (distKeys.length) {
      var distWrap = el("div", "campus-detail");
      distWrap.style.marginBottom = "var(--sp-5)";
      var distLabel = el("div", "metric-group__label", "Distinctions");
      distLabel.style.marginBottom = "var(--sp-2)";
      var distTags = el("div", "campus-card__dists");
      distKeys.forEach(function(k) {
        distTags.appendChild(el("span", "dist-tag", "✓ " + esc(DIST_LABELS[k] || k)));
      });
      distWrap.appendChild(distLabel);
      distWrap.appendChild(distTags);
      container.appendChild(distWrap);
    }

    // Academic performance (STAAR + EOC)
    if (campus.academic_performance && campus.academic_performance.length) {
      var acGroup = el("div", "metric-group");
      acGroup.appendChild(el("div", "metric-group__label", "Student Academic Performance"));
      var acGrid = el("div", "metric-grid");
      campus.academic_performance.forEach(function(m) {
        acGrid.appendChild(renderMetricCard(m));
      });
      acGroup.appendChild(acGrid);
      container.appendChild(acGroup);
    }

    // Post-secondary (CCMR)
    if (campus.graduation_postsec && campus.graduation_postsec.length) {
      var psGroup = el("div", "metric-group");
      psGroup.appendChild(el("div", "metric-group__label", "Graduation & Post-Secondary Readiness"));
      var psGrid = el("div", "metric-grid");
      campus.graduation_postsec.forEach(function(m) {
        psGrid.appendChild(renderMetricCard(m));
      });
      psGroup.appendChild(psGrid);
      container.appendChild(psGroup);
    }

    // Bottom back link
    var bottomBackDetail = el("button", "campus-back-btn", "← All Campuses");
    bottomBackDetail.style.marginTop = "var(--sp-5)";
    bottomBackDetail.style.display = "block";
    bottomBackDetail.addEventListener("click", function() {
      renderCampusSelector(schoolYear, teaMetrics, onBack);
    });
    container.appendChild(bottomBackDetail);
  }

  // ── TEA Section renderer ──────────────────────────────────────────────────
  function renderTeaSection(schoolYear, teaMetrics) {
    var container = document.getElementById("tea-section");
    if (!container) return;
    container.innerHTML = "";

    var districtData = (teaMetrics && teaMetrics.district && teaMetrics.district[schoolYear])
      ? teaMetrics.district[schoolYear] : null;
    var hasCampuses  = teaMetrics && teaMetrics.campuses && !!teaMetrics.campuses[schoolYear];

    // ── Section header ──────────────────────────────────────────────────────
    var hdr = el("div", "page-section__hdr");
    var titleRow = el("div", "page-section__title-row");
    titleRow.innerHTML = '<h2 class="page-section__title">Texas Education Agency Data</h2>';

    // District scope button (always active by default)
    var distBtn = document.createElement("button");
    distBtn.className = "scope-badge";
    distBtn.setAttribute("aria-selected", "true");
    distBtn.textContent = "📍 District";
    distBtn.addEventListener("click", function() {
      renderTeaSection(schoolYear, teaMetrics);
    });
    titleRow.appendChild(distBtn);

    // Campus scope button
    var campusBtn = document.createElement("button");
    campusBtn.className = "scope-badge" + (hasCampuses ? "" : " scope-badge--future");
    campusBtn.setAttribute("aria-selected", "false");
    campusBtn.textContent = hasCampuses ? "🏫 By Campus" : "🏫 Campus — 2024–25 only";
    if (hasCampuses) {
      campusBtn.addEventListener("click", function() {
        renderCampusSelector(schoolYear, teaMetrics, function() {
          renderTeaSection(schoolYear, teaMetrics);
        });
      });
    } else {
      campusBtn.title = "Campus data is only available for 2024-25";
      campusBtn.style.cursor = "default";
    }
    titleRow.appendChild(campusBtn);

    hdr.appendChild(titleRow);
    hdr.appendChild(el("p", "page-section__desc",
      "Official TEA accountability data for Conroe ISD. " +
      "Switch to By Campus to see individual school ratings and distinctions."));
    container.appendChild(hdr);

    if (!districtData) {
      var noTea = el("div", "no-data-banner");
      noTea.innerHTML =
        '<div class="no-data-banner__icon" aria-hidden="true">&#128203;</div>' +
        '<div class="no-data-banner__body">' +
          '<strong class="no-data-banner__title">No TEA data available for ' + esc(schoolYear) + '</strong>' +
          '<p class="no-data-banner__msg">The Texas Education Agency has not yet released accountability ratings and ' +
          'performance metrics for the ' + esc(schoolYear) + ' school year. This section will be updated as soon as TEA ' +
          'publishes the corresponding TAPR data.</p>' +
        '</div>';
      container.appendChild(noTea);
      return;
    }

    // Accountability grade card — uses the district-grade widget layout
    if (districtData.accountability) {
      var acc = districtData.accountability;
      var gradeGroup = el("div", "metric-group");
      gradeGroup.appendChild(el("div", "metric-group__label", "Accountability"));
      if (acc.grade) {
        var taprYr = acc.tapr_year || "";
        var schoolYr = taprYr ? (parseInt(taprYr) - 1) + "–" + String(taprYr).slice(-2) : "";
        var accCard = el("div", "district-grade");
        accCard.innerHTML =
          '<div class="grade-letter grade-letter--' + esc(acc.grade) + '">' + esc(acc.grade) + '</div>' +
          '<div class="grade-info">' +
            '<div class="grade-info__label">TEA Accountability Rating</div>' +
            '<div class="grade-info__title">Conroe ISD received a <strong>' + esc(acc.grade) + '</strong> from the Texas Education Agency</div>' +
            '<div class="grade-info__note">Based on student achievement, school progress, and closing performance gaps' +
              (schoolYr ? ' · ' + esc(schoolYr) + ' school year' : '') + '</div>' +
          '</div>';
        gradeGroup.appendChild(accCard);
      } else if (acc.pending_release) {
        var pendCard = el("div", "metric-card");
        pendCard.innerHTML =
          '<div class="metric-card__title">Accountability Rating</div>' +
          '<div class="metric-card__sub">Overall TEA Accountability Grade</div>' +
          '<div class="metric-card__val metric-val--pending">Pending Release</div>' +
          '<div class="metric-card__src">TEA releases accountability ratings in summer/fall</div>';
        gradeGroup.appendChild(pendCard);
      }
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

    // Sync CIP section to show "no data" for this year as well
    if (_appData) renderCipForYear(label, _appData, _teaMetrics);
  }

  // ── Year tabs ────────────────────────────────────────────────────────────
  function renderTabs(data, onPick) {
    var tabs = document.getElementById("yeartabs");
    tabs.innerHTML = "";
    var select = document.getElementById("yearselect");
    if (select) select.innerHTML = "";

    // Prepend upcoming year as a placeholder (no data yet)
    var futureLabel = "2026–27";

    function markSelected(label) {
      [].forEach.call(tabs.children, function (c) {
        c.setAttribute("aria-selected", c.textContent === label ? "true" : "false");
      });
      if (select) select.value = label;
    }

    var futureBtn = el("button", "yeartab yeartab--future", esc(futureLabel));
    futureBtn.setAttribute("role", "tab");
    futureBtn.setAttribute("aria-selected", "false");
    futureBtn.setAttribute("title", "No data available yet for " + futureLabel);
    futureBtn.addEventListener("click", function () {
      markSelected(futureLabel);
      renderPlaceholderYear(futureLabel);
    });
    tabs.appendChild(futureBtn);
    if (select) {
      var futureOpt = document.createElement("option");
      futureOpt.value = futureLabel;
      futureOpt.textContent = futureLabel + " — no data yet";
      select.appendChild(futureOpt);
    }

    data.years.forEach(function (y, i) {
      var b = el("button", "yeartab", esc(y.school_year));
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.addEventListener("click", function () {
        markSelected(y.school_year);
        onPick(y);
      });
      tabs.appendChild(b);

      if (select) {
        var opt = document.createElement("option");
        opt.value = y.school_year;
        opt.textContent = y.school_year;
        if (i === 0) opt.selected = true; // default to the current school year
        select.appendChild(opt);
      }
    });

    // Mobile dropdown drives the same selection logic as the desktop tabs
    if (select) {
      select.addEventListener("change", function () {
        var val = select.value;
        if (val === futureLabel) {
          markSelected(futureLabel);
          renderPlaceholderYear(futureLabel);
          return;
        }
        var match = data.years.filter(function (y) { return y.school_year === val; })[0];
        if (match) {
          markSelected(val);
          onPick(match);
        }
      });
    }
  }

  // ── CIP Section (Campus Improvement Plans) ───────────────────────────────
  // Year selection is driven by the top-level DIP year tabs — no separate CIP
  // year tabs.  renderCipForYear() finds all campuses that have CIP data for
  // the chosen year and renders them; if none exist it shows a "no data" banner.

  var cipActiveFilter = null;

  function renderCipStatStrip(objs) {
    var statMet    = objs.filter(function(o){ return o.result === "met"    && o.tapr_mappable; }).length;
    var statMissed = objs.filter(function(o){ return o.result === "missed" && o.tapr_mappable; }).length;
    var diverge    = objs.filter(function(o){ return o.divergence; }).length;
    var statNoData = objs.filter(function(o){ return o.result === "no_data"; }).length;
    var strip = document.getElementById("cip-statstrip");
    if (!strip) return;
    strip.innerHTML = "";

    var STATS = [
      { key:"met",     cls:"stat--met",    val:statMet,    label:"Objectives Met",      hint:"State data confirms objective was reached" },
      { key:"missed",  cls:"stat--missed", val:statMissed, label:"Objectives Missed",   hint:"State data shows objective was not reached" },
      { key:"diverge", cls:"stat--diverge",val:diverge,    label:"Claim vs. Data Gaps", hint:"Campus reported progress but state data shows the objective was missed" },
      { key:"no_data", cls:"stat--nodata", val:statNoData, label:"Awaiting State Data", hint:"No TEA data available yet for this objective" }
    ];
    STATS.forEach(function(st) {
      var btn = el("button", "stat " + st.cls);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.filter = st.key;
      btn.innerHTML =
        '<span class="stat__val">' + st.val + '</span>' +
        '<span class="stat__label">' + esc(st.label) + '</span>' +
        '<span class="stat__hint">' + esc(st.hint) + '</span>';
      btn.addEventListener("click", function() {
        cipActiveFilter = cipActiveFilter === st.key ? null : st.key;
        applyCipFilter();
      });
      strip.appendChild(btn);
    });
  }

  function applyCipFilter() {
    var strip = document.getElementById("cip-statstrip");
    if (!strip) return;
    [].forEach.call(strip.querySelectorAll(".stat"), function(btn) {
      btn.setAttribute("aria-pressed", btn.dataset.filter === cipActiveFilter ? "true" : "false");
    });
    var container = document.getElementById("cip-objectives");
    if (!container) return;
    container.querySelectorAll("details.obj").forEach(function(card) {
      var res   = card.dataset.result;
      var basis = card.dataset.basis;
      var div   = card.dataset.diverge === "true";
      var show  = true;
      if (cipActiveFilter === "met")     show = res === "met"    && basis === "state";
      if (cipActiveFilter === "missed")  show = res === "missed" && basis === "state";
      if (cipActiveFilter === "diverge") show = div;
      if (cipActiveFilter === "no_data") show = (res === "no_data" || res === "context");
      card.hidden = !show;
    });
    container.querySelectorAll("details.section").forEach(function(sec) {
      sec.hidden = (cipActiveFilter !== null && !sec.querySelectorAll("details.obj:not([hidden])").length);
    });
  }

  function renderCipForYear(schoolYear, data, teaMetrics) {
    cipActiveFilter = null;

    var hdrEl  = document.getElementById("cip-campus-hdr");
    var tabsEl = document.getElementById("cip-yeartabs");
    var strip  = document.getElementById("cip-statstrip");
    var objEl  = document.getElementById("cip-objectives");

    // Top-level year tabs drive selection; clear the CIP-specific tab row
    if (tabsEl) tabsEl.innerHTML = "";

    if (!data || !data.cip || !data.cip.campuses || !data.cip.campuses.length) {
      if (hdrEl) hdrEl.innerHTML = "";
      if (strip) strip.innerHTML = '<p class="loading">Campus Improvement Plan data coming soon.</p>';
      if (objEl) objEl.innerHTML = "";
      return;
    }

    // Find every campus that has a year matching the selected school year
    var pairs = [];
    data.cip.campuses.forEach(function(campus) {
      var yr = (campus.years || []).filter(function(y) { return y.school_year === schoolYear; })[0];
      if (yr) pairs.push({ campus: campus, year: yr });
    });

    if (!pairs.length) {
      if (hdrEl) hdrEl.innerHTML = "";
      if (strip) strip.innerHTML = "";
      if (objEl) {
        objEl.innerHTML = "";
        var banner = el("div", "no-data-banner");
        banner.innerHTML =
          '<div class="no-data-banner__icon" aria-hidden="true">&#128203;</div>' +
          '<div class="no-data-banner__body">' +
            '<strong class="no-data-banner__title">No campus improvement plan data for ' + esc(schoolYear) + '</strong>' +
            '<p class="no-data-banner__msg">Campus Improvement Plans for ' + esc(schoolYear) + ' have not yet been added to this site.</p>' +
          '</div>';
        objEl.appendChild(banner);
      }
      return;
    }

    // Campus identity cards (one per matching campus)
    if (hdrEl) {
      var campusTeaList = (teaMetrics && teaMetrics.campuses && teaMetrics.campuses["2024-25"]) || [];
      hdrEl.innerHTML = pairs.map(function(p) {
        var campusTea   = campusTeaList.filter(function(c) { return c.campus_id === p.campus.campus_id; })[0];
        var grade       = (campusTea && campusTea.overall_grade) || "—";
        var gradeLetter = (grade.length === 1 && "ABCDF".indexOf(grade) >= 0) ? grade : "—";
        return '<div class="district-grade" style="margin-bottom:var(--sp-3)">' +
          '<div class="grade-letter grade-letter--' + esc(gradeLetter) + '">' + esc(gradeLetter) + '</div>' +
          '<div class="grade-info">' +
            '<div class="grade-info__label">Campus</div>' +
            '<div class="grade-info__title">' + esc(p.campus.short_name || p.campus.campus_name) + '</div>' +
            '<div class="grade-info__note">TEA 2024–25 Accountability Rating: <strong>' + esc(grade) + '</strong>' +
              (campusTea && campusTea.grade_span ? ' · Grades ' + esc(campusTea.grade_span) : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    // Aggregate stat strip across all matching campuses
    var allObjs = [];
    pairs.forEach(function(p) { allObjs = allObjs.concat(p.year.objectives || []); });
    renderCipStatStrip(allObjs);

    // Render objectives per campus
    if (objEl) {
      objEl.innerHTML = "";
      pairs.forEach(function(p) {
        // Divider heading when more than one campus is shown
        if (pairs.length > 1) {
          var div = el("div", "metric-group__label", esc(p.campus.short_name || p.campus.campus_name));
          div.style.margin = "var(--sp-5) 0 var(--sp-3)";
          objEl.appendChild(div);
        }
        var cipSections = buildSections({ goals: p.campus.goals || [], years: [p.year] });
        var bySection = {};
        (p.year.objectives || []).forEach(function(o) {
          (bySection[o.section || "other"] = bySection[o.section || "other"] || []).push(o);
        });
        cipSections.forEach(function(sec) {
          var list = bySection[sec.key];
          if (!list || !list.length) return;
          var details = document.createElement("details");
          details.className = "section";
          var summary = document.createElement("summary");
          summary.innerHTML =
            '<span class="section__head">' + esc(sec.title) + '</span>' +
            '<span class="section__count">' + list.length + ' objective' + (list.length !== 1 ? 's' : '') + '</span>' +
            '<span class="section__chev" aria-hidden="true">&#9660;</span>';
          details.appendChild(summary);
          details.appendChild(el("p", "section__desc", esc(sec.desc)));
          sortObjectives(list).forEach(function(o) { details.appendChild(renderObjective(o)); });
          objEl.appendChild(details);
        });
      });
    }

    applyCipFilter();
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

      // Store module-level refs so renderPlaceholderYear can reach them
      _appData    = data;
      _teaMetrics = data.tea_metrics || null;
      var teaMetrics = _teaMetrics;

      renderTabs(data, function(yr) {
        SECTIONS = buildSections(data);
        renderYear(yr, teaMetrics);
        renderCipForYear(yr.school_year, data, teaMetrics);
      });
      renderYear(data.years[0], teaMetrics);
      renderCipForYear(data.years[0].school_year, data, teaMetrics);

      document.getElementById("foot-prov").textContent =
        data.provenance || "An independent project — not affiliated with Conroe ISD.";
      if (data.generated_at) {
        document.getElementById("foot-gen").textContent =
          "Data refreshed " + new Date(data.generated_at).toLocaleDateString("en-US",
            { month:"short", day:"numeric", year:"numeric" });
      }
    })
    .catch(function (e) {
      document.getElementById("statstrip").innerHTML =
        '<p class="err">Could not load outcomes data (' + esc(e.message) + ').</p>';
    });
})();
