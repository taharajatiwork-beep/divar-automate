// ─── Selector Config — Single Source of Truth ─────────────────────────
// All Divar DOM selectors used by the extension.
// If a selector breaks, update it here (not scattered across content.js).
// Note: content.js inlines these because MV3 content scripts can't use require()/import.

export default {
  // Page 1 selectors
  page1: {
    title:    { primary: '#Title',            fallbacks: ['input[name="title"]', 'input[placeholder*="عنوان"]'] },
    desc:     { primary: '#Description',      fallbacks: ['textarea[name="description"]', 'textarea[placeholder*="توضیح"]'] },
    price:    { primary: '#Price',            fallbacks: ['input[name="price"]', 'input[placeholder*="قیمت"]'] },
    images:   { primary: 'input[type="file"]', fallbacks: [] },
    submitBtn:{ primary: 'button:contains("بعدی")', fallbacks: ['button.kt-button--primary'] },
  },

  // Page 2 selectors — car fields
  page2: {
    brand_model: { primary: '#brand_model',           fallbacks: ['#brand_model___Input', '[id*="brand"]'] },
    year:        { primary: '#year___Input',           fallbacks: ['[id*="year"]', '[id*="model"]'] },
    color:       { primary: '#color___Input',          fallbacks: ['[id*="color"]'] },
    fuel_type:   { primary: '#fuel_type___Input',      fallbacks: ['[id*="fuel"]'] },
    gearbox:     { primary: '#gearbox___Input',        fallbacks: ['[id*="gearbox"]', '[id*="transmission"]'] },
    body_status: { primary: '#body_status___Input',    fallbacks: ['[id*="body"]'] },
    usage:       { primary: '#usage___Input',          fallbacks: ['[id*="usage"]', '[id*="mileage"]', 'input[type="number"]'] },
  },

  // Modal selectors
  modal: {
    singleSelect: { primary: '.single-select-modal.kt-modal', fallbacks: ['.kt-modal.kt-modal--scrollable', '.kt-modal'] },
    optionRow:    { primary: '.kt-base-row',                  fallbacks: ['[role="button"]'] },
    optionTitle:  { primary: '.start__title-_UBPtX',          fallbacks: ['p[class*="title"]', '.kt-base-row__start p', '.kt-base-row p', 'p'] },
    showAllBtn:   { primary: '.rawButton-W5tTZw',             fallbacks: ['[role="button"]'] },
    searchInput:  { primary: '#brand_model-search-input',     fallbacks: ['input[type="text"]', 'input[placeholder*="جستجو"]'] },
  },

  // Universal
  universal: {
    nextBtn:   { primary: 'button:contains("بعدی")', fallbacks: [] },
    submitBtn: { primary: 'button:contains("ثبت")',  fallbacks: [] },
  },
};
