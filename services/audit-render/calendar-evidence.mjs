// Can a visitor actually pick a time on this page?
//
// The old answer was "does any element have the word calendar in its class",
// and openheartsopenmindscounseling.com is what that returns true for: a 0x0
// `<span class="icon-calendar-plus-o icon">`, an icon font glyph, on a page with
// no picker, no slots and no scheduling iframe. Every page of that site reported
// hasCalendar: true.
//
// It did not hurt Cynthia, whose reason was verified by eye. It matters because
// hasCalendar now has precedence in the booking detector: a real calendar
// suppresses a request-form claim. So a decorative icon could talk LTB out of a
// true finding, or into believing a business can be booked online when it
// cannot.
//
// The collection stays in the browser, where the DOM is. The judgement lives
// here, in one place, where it can be tested against the shapes real sites
// returned rather than against a mock of a browser.

// Class names that carry the word but describe a picture of a calendar rather
// than a calendar. Icon fonts are the whole family: Font Awesome, Glyphicon,
// Material, Feather, Bootstrap Icons, MDI, Ionicons and the hand-rolled
// `icon-` convention TherapySites uses.
const ICON_CLASS = /(^|\s|-)(icon|ico|fa|fas|far|fal|fab|glyphicon|material-icons|feather|bi|mdi|ion|svg-inline)([-_]|\s|$)/i;

// Tags that are never a scheduling widget, only a drawing of one.
const ICON_TAG = new Set(['i', 'svg', 'path', 'use', 'symbol', 'img', 'span-icon']);

// How many things you have to be able to choose between before a container is
// a scheduling UI rather than a decorated heading. A month grid has around
// thirty; a list of appointment times has several. Four is comfortably below
// any real widget and far above a label with an icon in it.
export const MIN_CHOICES = 4;

// Smaller than this in either direction and it is a glyph, not a widget.
export const MIN_PX = 40;

// A date control is not a calendar.
//
// `pickers > 0` used to make hasCalendar true on its own, guarded by a list of
// field names that are obviously not appointments: birth, dob, expiry,
// anniversary. That list can only ever grow, and it was already missing event
// dates, publication dates, policy dates and a field simply called `date`.
//
// The deeper problem is that the guess was the wrong shape. A date box a
// visitor types into is what a REQUEST FORM looks like — the
// achievewellnesscenters case the booking rules already describe, where
// somebody types when they would like and waits for a human to confirm.
// Counting that as a calendar would suppress `booking-is-a-form`, which is the
// claim this product actually sends. The strict reading protects the true
// finding.
//
// So a date control counts only where it sits inside recognised scheduling UI:
// a container that passes the widget test above, meaning something with real
// choices in it rather than a box to fill in. The field's name is not
// consulted at all.
export function isSchedulingPicker(picker = {}) {
  if (!picker || !picker.inWidget) return false;
  return isSchedulingWidget(picker.widget || {});
}

// One candidate, as the page reported it.
//
// `{ tag, cls, w, h, choices, inSvg, hidden }`
export function isSchedulingWidget(c = {}) {
  const cls = String(c.cls || '');
  const tag = String(c.tag || '').toLowerCase();
  if (c.inSvg) return false;
  if (ICON_TAG.has(tag)) return false;
  if (ICON_CLASS.test(cls)) return false;
  // A zero-size or hidden node is not something a visitor picks a time in. The
  // icon that started all this measures 0x0, because its glyph is drawn by a
  // ::before rule.
  if (!(Number(c.w) >= MIN_PX && Number(c.h) >= MIN_PX)) return false;
  return Number(c.choices) >= MIN_CHOICES;
}

// The whole answer for one page.
//
// `pickers` are date/time inputs the page reported, already filtered browser
// side for the ones that are obviously not appointments. `vendorFrame` is an
// iframe from a known scheduling provider, which is strong on its own.
export function judgeCalendar({ candidates = [], pickers = [], vendorFrame = false } = {}) {
  const widgets = (candidates || []).filter(isSchedulingWidget);
  // A bare number means an older collector, which counted date fields without
  // saying where they were. Unqualified, so it earns nothing: fail closed.
  const list = Array.isArray(pickers) ? pickers : [];
  const scheduling = list.filter(isSchedulingPicker);
  return {
    slotUi: widgets.length,
    pickers: Array.isArray(pickers) ? pickers.length : (Number(pickers) || 0),
    schedulingPickers: scheduling.length,
    vendorFrame: Boolean(vendorFrame),
    hasCalendar: widgets.length > 0 || scheduling.length > 0 || Boolean(vendorFrame),
  };
}

// The collector, as source, because it runs inside page.evaluate in two places
// and a closure cannot cross that boundary. Rebuilt browser-side from this one
// string so there is still a single implementation.
export const COLLECT_CALENDAR_SRC = `(bookingSrc) => {
  const RE = /calendar|timeslot|time-slot|datepicker|availabilit|time-picker/i;
  const NOT_SCHEDULING = /birth|dob|d\\.o\\.b|expir|issued|anniversar|since|founded/i;
  const clsOf = (e) => (typeof e.className === 'string' ? e.className : (e.getAttribute && e.getAttribute('class')) || '');
  const candidates = [];
  for (const e of document.querySelectorAll('*')) {
    const cls = clsOf(e);
    if (!RE.test(cls)) continue;
    let r = { width: 0, height: 0 };
    try { r = e.getBoundingClientRect(); } catch (err) {}
    candidates.push({
      tag: e.tagName ? e.tagName.toLowerCase() : '',
      cls: String(cls).slice(0, 120),
      w: Math.round(r.width), h: Math.round(r.height),
      inSvg: Boolean(e.closest && e.closest('svg')),
      choices: e.querySelectorAll('button,[role=button],[role=gridcell],[role=option],td,option,input,select,a[href]').length,
    });
    if (candidates.length >= 40) break;
  }
  // Each date control, and the scheduling container it sits in if any. What it
  // is called is deliberately not collected: a name is a guess, and a guess is
  // what this replaced.
  const describe = (e) => {
    let r = { width: 0, height: 0 };
    try { r = e.getBoundingClientRect(); } catch (err) {}
    return {
      tag: e.tagName ? e.tagName.toLowerCase() : '',
      cls: String(clsOf(e)).slice(0, 120),
      w: Math.round(r.width), h: Math.round(r.height),
      inSvg: Boolean(e.closest && e.closest('svg')),
      choices: e.querySelectorAll('button,[role=button],[role=gridcell],[role=option],td,option,input,select,a[href]').length,
    };
  };
  const pickers = [...document.querySelectorAll('input[type=date],input[type=time],input[type=datetime-local],select[name*=date i],select[name*=time i]')]
    .slice(0, 40)
    .map((el) => {
      let host = null;
      try {
        host = el.closest('[class*=calendar i],[class*=timeslot i],[class*=time-slot i],[class*=datepicker i],[class*=availabilit i],[class*=time-picker i]');
      } catch (err) {}
      return { inWidget: Boolean(host), widget: host ? describe(host) : null };
    });
  const vendorFrame = [...document.querySelectorAll('iframe[src]')].some((f) => new RegExp(bookingSrc, 'i').test(f.src));
  return { candidates, pickers, vendorFrame };
}`;
