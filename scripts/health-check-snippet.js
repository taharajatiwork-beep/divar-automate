// ─── DevTools Console Snippet — Selector Health Check ─────────────────
// Paste this into the DevTools console on https://divar.ir/new (or any
// divar page) to verify that every selector used by the extension still
// matches at least one element in the current DOM.

(() => {
  'use strict';

  const SELECTORS = {
    page1: {
      title:    ['#Title', 'input[name="title"]', 'input[placeholder*="عنوان"]'],
      desc:     ['#Description', 'textarea[name="description"]', 'textarea[placeholder*="توضیح"]'],
      price:    ['#Price', 'input[name="price"]', 'input[placeholder*="قیمت"]'],
      images:   ['input[type="file"]'],
    },
    page2: {
      brand_model: ['#brand_model', '#brand_model___Input', '[id*="brand"]'],
      year:        ['#year___Input', '[id*="year"]', '[id*="model"]'],
      color:       ['#color___Input', '[id*="color"]'],
      fuel_type:   ['#fuel_type___Input', '[id*="fuel"]'],
      gearbox:     ['#gearbox___Input', '[id*="gearbox"]', '[id*="transmission"]'],
      body_status: ['#body_status___Input', '[id*="body"]'],
      usage:       ['#usage___Input', '[id*="usage"]', '[id*="mileage"]', 'input[type="number"]'],
    },
    modal: {
      singleSelect: ['.single-select-modal.kt-modal', '.kt-modal.kt-modal--scrollable', '.kt-modal'],
      optionRow:    ['.kt-base-row', '[role="button"]'],
      optionTitle:  ['.start__title-_UBPtX', 'p[class*="title"]', '.kt-base-row__start p', '.kt-base-row p', 'p'],
      showAllBtn:   ['.rawButton-W5tTZw', '[role="button"]'],
      searchInput:  ['#brand_model-search-input', 'input[type="text"]', 'input[placeholder*="جستجو"]'],
    },
  };

  let pass = 0, fail = 0, skip = 0;
  const results = [];

  for (const [group, fields] of Object.entries(SELECTORS)) {
    for (const [field, sels] of Object.entries(fields)) {
      let found = false;
      let matchedSel = null;
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            found = true;
            matchedSel = sel;
            break;
          }
        } catch {}
      }
      if (found) {
        pass++;
        results.push({ group, field, status: '✅', sel: matchedSel });
      } else {
        // Check if any selector exists but is hidden (page-level skip)
        const anyExists = sels.some(sel => { try { return !!document.querySelector(sel); } catch { return false; } });
        if (anyExists) {
          skip++;
          results.push({ group, field, status: '⏭️ hidden', sel: '(element exists but not visible — likely on another page)' });
        } else {
          fail++;
          results.push({ group, field, status: '❌', sel: sels[0] });
        }
      }
    }
  }

  console.log('═══════════════════════════════════════════════');
  console.log(` Divar Selector Health Check`);
  console.log(` ✅ ${pass} found  ❌ ${fail} broken  ⏭️ ${skip} hidden`);
  console.log('═══════════════════════════════════════════════');
  console.table(results.map(r => ({
    Group: r.group, Field: r.field, Status: r.status, 'Matched Selector': r.sel
  })));
  console.log('═══════════════════════════════════════════════');
})();
