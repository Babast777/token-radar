// Fathom's board. It reads window.RADAR and renders with no network.
// impliedOf is the same arithmetic as impliedFrom in lib/model.ts: category multiples
// are keyed by the snapshot's category, never by a protocol name.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', preset: 'all', sort: 'implied', dir: -1, protocol: null };

  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function sizeMultiple(tvl, floor, model) {
    var raw = Math.pow(Math.max(tvl, 1) / floor, model.size_exponent);
    return Math.min(model.size_cap, Math.max(model.size_floor, raw));
  }
  function growthOf(change, model) {
    var raw = change === null || change === undefined ? 0 : change;
    var pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
    return 1 + (pct / 100) * model.growth_weight;
  }
  function tenureOf(age, model) {
    if (age === null || age === undefined) return model.unknown_tenure;
    var x = Math.min(Math.max(age, 0), model.tenure_cap_days) / model.tenure_peak_days;
    var up = Math.min(x, 1);
    var down = Math.max(0, x - 1);
    return Math.max(model.tenure_min, model.tenure_floor + up * model.tenure_rise - down * model.tenure_fade);
  }
  function categoryOf(category, model) {
    if (!category || model.category_multiples[category] === undefined) return model.category_default;
    return model.category_multiples[category];
  }
  function chainOf(count, model) {
    return 1 + Math.min(model.chain_extra_cap, Math.max(count, 1) - 1) * model.chain_step;
  }
  function confidenceOf(change, model) {
    if (change === null || change === undefined) return model.unreported_confidence;
    if (change <= -35) return model.drawdown_35;
    if (change <= -20) return model.drawdown_20;
    return 1;
  }
  function publicMultiplier(cls, audits, model) {
    if (cls === 'hacked') return model.hack_multiplier;
    if (cls === 'listed-stable') return model.listed_multiplier;
    if (cls === 'lookalike-honeypot') return model.honeypot_multiplier;
    if (cls === 'market-name') return model.market_multiplier;
    return audits >= 1 ? model.audit_multiplier : 1;
  }
  function impliedOf(row) {
    var model = DATA.model;
    var size = round4(sizeMultiple(row.tvl_usd, DATA.floor_usd, model));
    var growth = round4(growthOf(row.change_7d, model));
    var tenure = round4(tenureOf(row.age_days, model));
    var cat = round4(categoryOf(row.category, model));
    var chain = round4(chainOf((row.chains || []).length, model));
    var confidence = round4(confidenceOf(row.change_7d, model));
    var pub = round4(publicMultiplier(row.public_class, row.audits, model));
    var base = row.tvl_usd * model.base_multiple * size;
    return Math.max(1, Math.round(base * growth * tenure * cat * chain * confidence * pub));
  }
  window.impliedOf = impliedOf;

  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var s = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
    return s + '$' + Math.round(a);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function clsLabel(cls) {
    if (cls === 'hacked') return 'Hack on record';
    if (cls === 'listed-stable') return 'Stable already listed';
    if (cls === 'market-name') return 'Same-name pool';
    if (cls === 'lookalike-honeypot') return 'Honeypot flag';
    return 'No token on record';
  }
  function clsKind(cls) {
    if (cls === 'hacked' || cls === 'lookalike-honeypot') return 'bad';
    if (cls === 'listed-stable' || cls === 'market-name') return 'warn';
    return 'good';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, String(attrs[k]));
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('preset')) state.preset = params.get('preset');
    if (params.get('p')) state.protocol = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.preset !== 'all') params.set('preset', state.preset);
    if (state.protocol) params.set('p', state.protocol);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname);
  }

  function farmable(row) {
    var cat = categoryOf(row.category, DATA.model);
    var calm = row.change_7d === null || row.change_7d > -20;
    return row.public_class === 'unlisted' && row.hacks === 0 && calm && cat >= 0.9;
  }
  function caution(row) {
    return row.public_class !== 'unlisted' || (row.change_7d !== null && row.change_7d <= -20);
  }
  function visible() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      if (state.preset === 'watchlist' && !row.watchlist) return false;
      if (state.preset === 'farmable' && !farmable(row)) return false;
      if (state.preset === 'caution' && !caution(row)) return false;
      if (state.category !== 'all' && row.category !== state.category) return false;
      if (!q) return true;
      var hay = [row.name, row.slug, row.category, (row.chains || []).join(' '), row.public_note].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('i', { class: 'mark' }), el('div', null, el('b', { text: 'Fathom' }), el('span', { text: '  pre-token launch board' }))),
      el('div', { class: 'meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Public checks ' + DATA.fetched_at.slice(0, 10) }),
        el('span', { text: DATA.model_version })
      )
    );
  }

  function lede() {
    var c = DATA.counts;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'What a launch would be worth, and how to farm it' }),
        el('p', { text: 'Every watchlist protocol is on the board. ' + c.set_aside_child + ' child products of a token that already trades, and ' + c.set_aside_wrapper + ' bridges, staking wrappers and exchanges, are set aside. ' + c.live_on_record + ' protocols with a token on the snapshot are not ranked.' })
      ),
      el('div', { class: 'stats' },
        stat(c.watchlist + '/' + c.watchlist, 'Watchlist covered'),
        stat(String(c.board), 'Rows ranked'),
        stat(String(c.early), 'Early, below the floor'),
        stat(String(c.hacked + c.listed_stable + c.market_name), 'Public cautions')
      )
    );
  }
  function stat(value, label) {
    return el('div', { class: 'stat' }, el('b', { text: value }), el('span', { text: label }));
  }

  function formula() {
    var m = DATA.model;
    return el('div', { class: 'formula', text:
      'implied = round( TVL × ' + m.base_multiple + ' × clamp((TVL / floor) ^ ' + m.size_exponent + ') × growth × tenure × category × chains × confidence × public )'
    });
  }

  function controls(shown) {
    var search = el('input', { type: 'search', value: state.q, 'aria-label': 'Search the board', placeholder: 'Search name, chain or note' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var select = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    function preset(id, label) {
      return el('button', { type: 'button', 'aria-pressed': state.preset === id ? 'true' : 'false', text: label, onclick: function () { state.preset = id; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      search,
      select,
      el('div', { class: 'presets' }, preset('all', 'All'), preset('watchlist', 'Watchlist'), preset('farmable', 'Farmable'), preset('caution', 'Caution')),
      el('span', { class: 'count', text: shown + ' shown' + (
        state.preset === 'caution' ? ' · hack, listed stable, same-name pool, or 7d of -20% or worse' :
        state.preset === 'farmable' ? ' · unlisted, no hack, 7d above -20%, category multiple ≥ 0.9' :
        state.preset === 'watchlist' ? ' · snapshot watchlist only' : ''
      ) })
    );
  }

  function sortTh(key, label, num) {
    return el('th', { class: num ? 'num' : '', scope: 'col' },
      el('button', { type: 'button', text: label + (state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : ''), onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      } })
    );
  }

  function table(list) {
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Nothing matches' }),
        el('p', { class: 'sub', text: 'Clear the search or switch the preset.' })
      ));
    }
    var body = el('tbody');
    list.forEach(function (row) {
      var growthClass = row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg';
      body.appendChild(el('tr', {
        'data-selected': state.protocol === row.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { state.protocol = row.slug; writeHash(); render(); },
        onkeydown: function (e) { if (e.key === 'Enter') { state.protocol = row.slug; writeHash(); render(); } }
      },
        el('td', { class: 'num', text: String(row.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: row.name }), el('span', { text: (row.category || 'Other') + ' · ' + (row.chains || []).slice(0, 3).join(', ') }))),
        el('td', { class: 'num', text: money(row.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: pct(row.change_7d) }),
        el('td', { class: 'num', text: age(row.age_days) }),
        el('td', { class: 'num', text: money(row.implied_value_usd) }),
        el('td', null, el('span', { class: 'pill ' + clsKind(row.public_class), text: clsLabel(row.public_class) }))
      ));
    });
    return el('div', { class: 'panel' },
      el('table', null,
        el('thead', null, el('tr', null,
          sortTh('implied', 'Rank', true),
          sortTh('name', 'Protocol', false),
          sortTh('tvl', 'TVL', true),
          sortTh('growth', '7d', true),
          sortTh('age', 'Listed', true),
          sortTh('implied', 'Implied', true),
          el('th', { scope: 'col', text: 'Record' })
        )),
        body
      )
    );
  }

  function detail(row) {
    var again = impliedOf(row);
    var same = again === row.implied_value_usd;
    var f = row.factors;
    function cell(label, value) { return el('div', null, el('span', { text: label }), el('b', { text: value })); }
    return el('section', { class: 'detail' },
      el('div', { class: 'card' },
        el('button', { class: 'back', type: 'button', text: 'Back to the board', onclick: function () { state.protocol = null; writeHash(); render(); } }),
        el('p', { class: 'kicker', text: 'RANK ' + row.rank + ' OF ' + DATA.counts.board + (row.watchlist ? ' · WATCHLIST' : ' · EARLY') }),
        el('h1', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains && row.chains.length) ? row.chains.join(', ') : 'an unnamed chain') }),
        el('div', { class: 'factors' },
          cell('TVL', money(row.tvl_usd)),
          cell('Size multiple', String(f.size_multiple)),
          cell('Seven-day change', pct(row.change_7d)),
          cell('Growth multiple', String(f.growth_multiplier)),
          cell('Listed with no token', age(row.age_days)),
          cell('Tenure multiple', String(f.tenure_multiplier)),
          cell('Category multiple', String(f.category_multiplier)),
          cell('Chain multiple', String(f.chain_multiplier)),
          cell('Confidence', String(f.confidence_multiplier)),
          cell('Public multiple', String(f.public_multiplier)),
          cell('Implied value', money(row.implied_value_usd)),
          cell('Audits / hacks', row.audits + ' / ' + row.hacks)
        ),
        el('p', { class: 'agree', text: (same ? 'The page recomputes ' + money(again) + ', the same figure as the board.' : 'The page recomputes ' + money(again) + ', which does not match the board.') + ' ' + row.public_note })
      ),
      el('div', { class: 'card' },
        el('p', { class: 'kicker', text: 'FARM PLAN' }),
        el('h2', { text: clsLabel(row.public_class) }),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (step, i) {
          var at = step.indexOf(' Cost: ');
          var action = at >= 0 ? step.slice(0, at) : step;
          var tail = at >= 0 ? step.slice(at + 1) : '';
          return el('li', null, el('i', { text: String(i + 1) }), el('div', null, el('b', { text: action }), el('div', { class: 'sub', text: tail })));
        }))
      )
    );
  }

  function render() {
    var list = sorted(visible());
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (!state.protocol) {
      shell.appendChild(lede());
      shell.appendChild(formula());
      shell.appendChild(controls(list.length));
      shell.appendChild(table(list));
    } else {
      var row = DATA.rows.filter(function (r) { return r.slug === state.protocol; })[0];
      shell.appendChild(row ? detail(row) : table(list));
    }
    app.textContent = '';
    app.appendChild(shell);
    var panel = app.querySelector('.panel');
    var head = panel && panel.querySelector('thead');
    var row = panel && panel.querySelector('tbody tr');
    if (panel && head && row) {
      var headH = head.getBoundingClientRect().height;
      var rowH = row.getBoundingClientRect().height;
      var avail = panel.getBoundingClientRect().height;
      var nRows = Math.floor((avail - headH) / rowH);
      if (nRows >= 1 && rowH > 0) {
        panel.style.flex = '0 0 auto';
        panel.style.height = Math.floor(headH + nRows * rowH) + 'px';
      }
    }
  }

  readHash();
  render();
})();
