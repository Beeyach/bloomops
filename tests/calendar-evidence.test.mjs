// The word "calendar" is not evidence that a visitor can schedule anything.
//
// Every page of openheartsopenmindscounseling.com reported hasCalendar: true.
// The live DOM, read in a browser, returned exactly one match:
//
//   { tag: 'SPAN', cls: 'icon-calendar-plus-o icon', w: 0, h: 0, choices: 0 }
//
// pickers: 0. iframes: []. A glyph from an icon font, drawn by a ::before rule,
// measuring nothing and containing nothing.
//
// It did not hurt Cynthia, whose reason was checked by eye. It matters because
// hasCalendar has precedence in the booking detector: a real calendar suppresses
// a request-form claim. A decorative icon could talk the product out of a true
// finding, or into believing a business can be booked online when it cannot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeCalendar, isSchedulingWidget, isSchedulingPicker, MIN_CHOICES } from '../services/audit-render/calendar-evidence.mjs';

const el = (over = {}) => ({ tag: 'div', cls: 'calendar', w: 300, h: 300, choices: 30, inSvg: false, ...over });

// ── the element that started it ──────────────────────────────────────────

test('Cynthia: an icon-font span is not a calendar', () => {
  const real = { tag: 'span', cls: 'icon-calendar-plus-o icon', w: 0, h: 0, choices: 0, inSvg: false };
  assert.equal(isSchedulingWidget(real), false);
  assert.equal(judgeCalendar({ candidates: [real], pickers: 0, vendorFrame: false }).hasCalendar, false);
});

test('the whole icon-font family is excluded, not just that one class', () => {
  // A blacklist of one class name would have fixed the symptom and nothing else.
  const classes = [
    'icon-calendar-plus-o icon', 'fa fa-calendar', 'fas fa-calendar-alt',
    'far fa-calendar-check', 'glyphicon glyphicon-calendar', 'material-icons calendar',
    'feather-calendar', 'bi bi-calendar3', 'mdi mdi-calendar-clock', 'ion-calendar',
  ];
  for (const cls of classes) {
    assert.equal(isSchedulingWidget(el({ cls, w: 16, h: 16, choices: 0 })), false, cls);
  }
});

test('an svg icon with a calendar class is not a calendar', () => {
  assert.equal(isSchedulingWidget(el({ tag: 'svg', cls: 'calendar', choices: 0 })), false);
  assert.equal(isSchedulingWidget(el({ tag: 'path', cls: 'calendar-icon', choices: 0, inSvg: true })), false);
  assert.equal(isSchedulingWidget(el({ tag: 'div', cls: 'calendar', inSvg: true })), false, 'anything inside an svg');
});

test('a decorated heading is not a calendar', () => {
  // "Availability" as a section title, with a link or two under it.
  assert.equal(isSchedulingWidget(el({ tag: 'h2', cls: 'availability-heading', w: 400, h: 40, choices: 1 })), false);
});

test('something too small to pick a time in does not count', () => {
  assert.equal(isSchedulingWidget(el({ cls: 'calendar', w: 20, h: 20 })), false);
  assert.equal(isSchedulingWidget(el({ cls: 'calendar', w: 0, h: 0 })), false);
});

test('something with nothing to choose between does not count', () => {
  assert.equal(isSchedulingWidget(el({ choices: MIN_CHOICES - 1 })), false);
  assert.equal(isSchedulingWidget(el({ choices: MIN_CHOICES })), true, 'and the threshold itself passes');
});

// ── what still counts ────────────────────────────────────────────────────

test('a month grid counts', () => {
  assert.equal(isSchedulingWidget(el({ tag: 'table', cls: 'datepicker-days', w: 320, h: 300, choices: 35 })), true);
});

test('a list of appointment times counts', () => {
  assert.equal(isSchedulingWidget(el({ tag: 'ul', cls: 'timeslot-list', w: 240, h: 420, choices: 9 })), true);
});

test('an availability panel counts', () => {
  assert.equal(isSchedulingWidget(el({ tag: 'div', cls: 'availability-grid', w: 600, h: 400, choices: 20 })), true);
});

test('a scheduling iframe counts on its own', () => {
  const out = judgeCalendar({ candidates: [], pickers: 0, vendorFrame: true });
  assert.equal(out.hasCalendar, true);
  assert.equal(out.slotUi, 0, 'and it is not credited as a widget');
});

test('a date or time picker no longer counts on its own', () => {
  // It used to. A bare date box is a field somebody fills in, which is what a
  // request form looks like, not a calendar they choose a slot from.
  assert.equal(judgeCalendar({ candidates: [], pickers: [{ inWidget: false }], vendorFrame: false }).hasCalendar, false);
});


// ── the five live controls, as the crawl reported them ───────────────────

test('Sabine: a real Acuity calendar still reads true', () => {
  // Her followed pages carried an Acuity embed. A provider iframe is strong on
  // its own and must survive a change aimed at icons.
  assert.equal(judgeCalendar({ candidates: [], pickers: 0, vendorFrame: true }).hasCalendar, true);
  // And where it renders inline rather than framed, the widget itself qualifies.
  assert.equal(
    judgeCalendar({ candidates: [el({ cls: 'scheduling-calendar', w: 640, h: 520, choices: 42 })] }).hasCalendar,
    true
  );
});

test('Player One: a contact form with no calendar still reads false', () => {
  // Four fields, no date input, no scheduling class, no iframe. Its
  // request-form finding depends on this staying false.
  assert.equal(judgeCalendar({ candidates: [], pickers: 0, vendorFrame: false }).hasCalendar, false);
});

test('Cynthia: her page reads false while her finding is untouched', () => {
  const page = { candidates: [{ tag: 'span', cls: 'icon-calendar-plus-o icon', w: 0, h: 0, choices: 0 }], pickers: 0, vendorFrame: false };
  const out = judgeCalendar(page);
  assert.equal(out.hasCalendar, false);
  assert.equal(out.slotUi, 0);
  assert.equal(out.pickers, 0);
});

// ── the shape the browser returns ────────────────────────────────────────

test('missing or malformed input fails closed rather than throwing', () => {
  assert.equal(judgeCalendar().hasCalendar, false);
  assert.equal(judgeCalendar({}).hasCalendar, false);
  assert.equal(judgeCalendar({ candidates: null }).hasCalendar, false);
  assert.equal(isSchedulingWidget(), false);
  assert.equal(isSchedulingWidget({ cls: 'calendar' }), false, 'no size reported means no claim');
});

// ── a date field is not a calendar ───────────────────────────────────────
//
// `pickers > 0` used to be enough on its own, guarded by a list of field names
// that are obviously not appointments. The list could only grow, and it already
// missed most of the cases below.
//
// The field's name is no longer consulted at all. What decides it is where the
// control sits: inside real scheduling UI, or not.

const bare = (n = 1) => Array.from({ length: n }, () => ({ inWidget: false, widget: null }));
const inWidget = (widget) => [{ inWidget: true, widget }];
const REAL_WIDGET = { tag: 'div', cls: 'datepicker-calendar', w: 320, h: 300, choices: 35 };

test('none of these dates is a booking calendar', () => {
  // Every one of them is a date control on a real kind of page, and not one of
  // them means a visitor can pick an appointment.
  const cases = [
    'event date on a listing',
    'publication or archive date on a blog',
    'insurance or policy start date',
    'preferred contact date on an enquiry form',
    'a field simply called date',
    'date of an incident on a claim form',
  ];
  for (const what of cases) {
    assert.equal(judgeCalendar({ candidates: [], pickers: bare(), vendorFrame: false }).hasCalendar, false, what);
  }
});

test('several date fields are still not a calendar', () => {
  // An appointment-request form asking for a date AND a time is the request
  // form the booking rules describe, not a calendar. Counting it as one would
  // suppress `booking-is-a-form`, which is the claim actually sent.
  const out = judgeCalendar({ candidates: [], pickers: bare(2), vendorFrame: false });
  assert.equal(out.hasCalendar, false);
  assert.equal(out.pickers, 2, 'they are still reported');
  assert.equal(out.schedulingPickers, 0, 'just not credited');
});

test('a date control inside a real scheduling widget does count', () => {
  assert.equal(judgeCalendar({ candidates: [], pickers: inWidget(REAL_WIDGET), vendorFrame: false }).hasCalendar, true);
  assert.equal(isSchedulingPicker({ inWidget: true, widget: REAL_WIDGET }), true);
});

test('a date control inside a container that only looks like one does not', () => {
  // The container has to pass the same test any widget does. An icon-font span
  // wrapping a date field is not a scheduler.
  for (const widget of [
    { tag: 'span', cls: 'icon-calendar', w: 0, h: 0, choices: 0 },
    { tag: 'div', cls: 'calendar-heading', w: 400, h: 30, choices: 1 },
    { tag: 'svg', cls: 'calendar', w: 300, h: 300, choices: 9, inSvg: true },
  ]) {
    assert.equal(isSchedulingPicker({ inWidget: true, widget }), false, widget.cls);
    assert.equal(judgeCalendar({ pickers: inWidget(widget) }).hasCalendar, false, widget.cls);
  }
});

test('a claimed widget with no widget described is refused', () => {
  assert.equal(isSchedulingPicker({ inWidget: true, widget: null }), false);
  assert.equal(isSchedulingPicker({ inWidget: true }), false);
  assert.equal(isSchedulingPicker({}), false);
  assert.equal(isSchedulingPicker(), false);
});

test('an older collector sending a plain count earns nothing', () => {
  // Mid-deploy, a page may still report `pickers: 3`. Unqualified, so it fails
  // closed rather than granting the old behaviour.
  const out = judgeCalendar({ candidates: [], pickers: 3, vendorFrame: false });
  assert.equal(out.hasCalendar, false);
  assert.equal(out.pickers, 3);
  assert.equal(out.schedulingPickers, 0);
});

test('the strong signals are untouched by any of this', () => {
  assert.equal(judgeCalendar({ candidates: [], pickers: bare(), vendorFrame: true }).hasCalendar, true, 'a provider iframe');
  assert.equal(judgeCalendar({ candidates: [REAL_WIDGET], pickers: bare() }).hasCalendar, true, 'a real widget');
});

// ── the five controls, by the signal each actually uses ──────────────────

test('Sabine and Katie do not depend on the picker path', () => {
  // Measured live: both report pickers 0 and vendorFrame false on every crawled
  // page. Their calendar comes from the followed destination, so narrowing the
  // picker rule cannot touch them.
  const asMeasured = { candidates: [], pickers: [], vendorFrame: false };
  assert.equal(judgeCalendar(asMeasured).hasCalendar, false, 'the crawled page itself claims nothing');
  // And the destination, which is what actually earned it.
  assert.equal(judgeCalendar({ candidates: [REAL_WIDGET] }).hasCalendar, true);
});

test('Player One keeps its request-form result', () => {
  // pickers 0, no widget, no frame. If a date field alone counted, a form like
  // hers with one would have suppressed the true finding.
  assert.equal(judgeCalendar({ candidates: [], pickers: [], vendorFrame: false }).hasCalendar, false);
  assert.equal(judgeCalendar({ candidates: [], pickers: bare(), vendorFrame: false }).hasCalendar, false);
});

test('Cynthia stays false', () => {
  const page = { candidates: [{ tag: 'span', cls: 'icon-calendar-plus-o icon', w: 0, h: 0, choices: 0 }], pickers: [], vendorFrame: false };
  assert.equal(judgeCalendar(page).hasCalendar, false);
});
