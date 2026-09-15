// Public, invented business case. These quantities are examples, not customer data.
export const data = Object.freeze({ stores: 10, annualSavings: 120000, annualCost: 40000, annualNet: 80000, downsideSavings: 30000, downsideNet: -10000, currency: 'USD', period: 'year', pilotWeeks: 2 });
export const inventory = [
  { id: 'savings', address: 'claim/business/savings', text: 'Expected annual savings: $120,000 for 10 stores.', concepts: [], defines: [] },
  { id: 'cost', address: 'claim/business/cost', text: 'All-in annual cost: $40,000, including support.', concepts: [], defines: [] },
  { id: 'net', address: 'claim/business/net', text: 'Expected net benefit: $80,000 per year.', concepts: [], defines: [] },
  { id: 'condition', address: 'claim/business/condition', text: 'Proceed only after the inventory join (matching product records) passes a 2-week pilot.', concepts: ['inventory-join'], defines: ['inventory-join'] },
  { id: 'downside', address: 'claim/business/downside', text: 'If savings fall to $30,000, the annual net loss is $10,000.', concepts: [], defines: [] },
  { id: 'approve', address: 'component/decision/request-review', text: 'Request pilot review', concepts: [], defines: [] },
  { id: 'disclosure', address: 'component/decision/calculations', text: 'How the estimates work', concepts: [], defines: [] },
  { id: 'calculation', address: 'claim/calculation/net', text: '$120,000 expected annual savings − $40,000 all-in annual cost = $80,000 expected annual net benefit.', concepts: [], defines: [] },
  { id: 'denominator', address: 'claim/calculation/denominator', text: '10 stores × $12,000 expected savings per store per year = $120,000 expected savings per year.', concepts: [], defines: [] },
  { id: 'forecast', address: 'claim/calculation/uncertainty', text: 'Expected savings are a forecast, not measured results.', concepts: [], defines: [] },
  { id: 'sensitivity', address: 'claim/calculation/sensitivity', text: 'A sensitivity case checks how the decision changes when savings differ.', concepts: ['sensitivity-case'], defines: ['sensitivity-case'] },
  { id: 'downside-calculation', address: 'claim/calculation/downside', text: '$30,000 downside annual savings − $40,000 all-in annual cost = a $10,000 annual net loss.', concepts: [], defines: [] },
];
export const approvedLabels = ['Decision lab', 'A bounded test before rollout', 'Annual business case', 'Estimate details', 'Review requested'];
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const item = (id, tag = 'p') => `<${tag} data-qg-id="${id}">${escape(inventory.find(value => value.id === id).text)}</${tag}>`;
export const variants = ['baseline', 'improved', 'padding', 'boundary', 'candidate-caps', 'diagram', 'small-text', 'hidden-cost', 'removed-downside', 'filler', 'overlap', 'clipping', 'overflow', 'bad-focus', 'bad-keyboard', 'bad-touch'];

export function fixtureHtml(variant = 'improved') {
  if (!variants.includes(variant)) throw new Error(`Unknown public fixture: ${variant}`);
  const overloaded = ['baseline', 'boundary', 'candidate-caps', 'diagram', 'small-text'].includes(variant);
  const rules = {
    padding: '[data-qg-id="cost"]{margin-top:950px!important}',
    boundary: 'main{padding-top:400px!important}',
    'small-text': '[data-qg-id]{font-size:9px!important;line-height:1.1!important}',
    'hidden-cost': '[data-qg-id="cost"]{display:none}',
    'removed-downside': '[data-qg-id="downside"]{display:none}',
    overlap: '[data-qg-id="net"]{position:absolute;top:142px;left:32px;background:#fff}',
    clipping: '[data-qg-id="cost"]{height:8px;overflow:hidden}',
    overflow: 'main{min-width:1200px}',
    'bad-focus': '*:focus-visible{outline:none!important;box-shadow:none!important}',
    'bad-touch': 'button{min-height:20px!important;height:20px!important;padding:0!important;font-size:10px!important}',
  }[variant] ?? '';
  const support = `<section id="estimates"><h2>Estimate details</h2>${['calculation', 'denominator', 'forecast', 'sensitivity', 'downside-calculation'].map(id => item(id)).join('')}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Decision lab fixture</title><style>
*{box-sizing:border-box}html{font-family:Arial,sans-serif;color:#142d3a;background:#edf3f5}body{margin:0;font-size:18px;line-height:1.5}header{height:56px;position:sticky;top:0;z-index:10;display:flex;align-items:center;padding:0 24px;background:#142d3a;color:white;font-weight:700;box-shadow:0 1px 4px #0003}main{position:relative;max-width:760px;margin:24px auto 48px;padding:20px 32px;background:white;border:1px solid #cbd7dc;border-radius:16px;box-shadow:0 8px 24px #18323c0a}h1{font-size:28px;line-height:1.25;margin:4px 0 22px}h2{font-size:22px;line-height:1.3;margin:0 0 20px}.eyebrow{color:#426573;font-size:16px;margin:0 0 4px}p[data-qg-id]{margin:0;padding:17px 0;border-bottom:1px solid #e6edef}[data-qg-id="net"]{font-weight:700;color:#065c4f}[data-qg-id="downside"]{color:#844713}button,summary{font:inherit;min-height:48px;border-radius:8px;cursor:pointer}button{display:block;margin-top:24px;padding:11px 20px;background:#075f54;color:white;border:0;font-weight:700}summary{margin-top:20px;padding:12px 0;color:#135f7a;list-style-position:inside;text-decoration:underline;text-underline-offset:3px}*:focus-visible{outline:3px solid #d17700;outline-offset:4px}details section{padding-top:24px}#estimates p[data-qg-id]{padding:26px 0}#confirmation:empty{display:none}#confirmation{font-size:16px;color:#075f54;padding-top:8px}.dense p[data-qg-id]{padding:3px 0}.dense h1{margin-bottom:8px}.dense button{margin-top:8px}.dense summary{margin-top:8px}.dense #estimates{padding-top:8px}.dense #estimates p[data-qg-id]{padding:3px 0}.dense #estimates h2{margin:4px 0}.dense main{margin-top:8px;padding-top:12px}
@media(max-width:600px){body{font-size:17px}header{padding:0 18px}main{margin:12px 12px 32px;padding:20px 18px;border-radius:12px}h1{font-size:25px;margin-bottom:12px}p[data-qg-id]{padding:12px 0}button{margin-top:18px}summary{margin-top:12px}details section{padding-top:24px}}
${rules}</style></head><body class="${overloaded ? 'dense' : ''}" ${variant === 'candidate-caps' ? 'data-max-total="999" data-max-novel="999"' : ''}><header>Decision lab</header><main ${variant === 'diagram' ? 'data-qg-group="one-magical-diagram"' : ''}><p class="eyebrow">A bounded test before rollout</p><h1>Annual business case</h1><section id="decision">${['savings', 'cost', 'net', 'condition', 'downside'].map(id => item(id)).join('')}${item('approve', 'button').replace('<button ', `<button ${variant === 'bad-keyboard' ? 'tabindex="-1" ' : ''}`)}<div id="confirmation" role="status"></div></section><details id="calculations">${item('disclosure', 'summary')}${overloaded ? '' : support}</details>${overloaded ? support : ''}${variant === 'filler' ? '<p>Synergistic opportunity unlocks transformative enterprise value.</p>' : ''}</main><script id="quality-data" type="application/json">${JSON.stringify(data)}</script><script>document.querySelector('[data-qg-id="approve"]').addEventListener('click',()=>{document.querySelector('#confirmation').textContent='Review requested'});if(new URL(location.href).searchParams.get('disclosure')==='calculations')document.querySelector('#calculations').open=true;</script></body></html>`;
}

/** Fixed before rendering candidates. Provisional design budgets, not population capacity estimates. */
export function fixturePolicy(collectorDigest) {
  const main = ['savings', 'cost', 'net', 'condition', 'downside', 'approve', 'disclosure'];
  const states = [
    ['wide/closed/keyboard', '/decision', 1100, 760, 'keyboard', 'closed'],
    ['wide/open/keyboard', '/decision', 1100, 760, 'keyboard', 'open'],
    ['narrow/closed/touch', '/decision', 390, 844, 'touch', 'closed'],
    ['narrow/open/touch', '/decision', 390, 844, 'touch', 'open'],
    ['wide/entry/keyboard', '/decision?disclosure=calculations', 1100, 760, 'keyboard', 'open'],
    ['narrow/entry/touch', '/decision?disclosure=calculations', 390, 844, 'touch', 'open'],
  ].map(([id, route, width, height, input, interaction]) => ({
    id, route, viewport: { width, height }, input, interaction,
    requiredElements: interaction === 'open' ? inventory.map(value => value.id) : main,
    entryElements: main, actions: ['approve', 'disclosure'], maxTotal: interaction === 'open' ? 9 : 7, maxNovel: 2,
    minFontPx: 16, minTargetPx: 44, maxBlankGapPx: 150, maxScrollScreens: interaction === 'open' ? 2.2 : 1.2,
  }));
  return { version: 'business-fixture-provisional-1', collectorDigest, scrollModel: 'integer-css-pixels', knownConcepts: [], elements: structuredClone(inventory), states };
}
