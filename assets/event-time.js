// Studio records church wall times. Compare every event in Clay's time zone.
(function (root) {
  'use strict';
  var clock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function localISO(ms) {
    var parts = {};
    clock.formatToParts(ms).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute + ':' + parts.second;
  }
  function instant(value) {
    if (!value) return NaN;
    var s = String(value).trim();
    if (/T.*(?:Z|[+-]\d\d:?\d\d)$/i.test(s)) return Date.parse(s);
    if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?)?$/.test(s)) return NaN;
    var wall = Date.parse((s.length === 10 ? s + 'T00:00' : s.replace(' ', 'T')) + 'Z');
    if (!Number.isFinite(wall)) return NaN;
    // Test the two Eastern offsets. At a fall-back overlap use the first
    // occurrence. In the spring gap move forward by the skipped hour.
    var daylight = wall + 4 * 3600000;
    return localISO(daylight) === new Date(wall).toISOString().slice(0, 19) ? daylight : wall + 5 * 3600000;
  }
  function nextMidnight(ms) {
    var day = localISO(ms).slice(0, 10);
    var tomorrow = new Date(Date.parse(day + 'T00:00Z') + 86400000).toISOString().slice(0, 10);
    return instant(tomorrow);
  }
  function validEnd(start, end, allDay) {
    var endMs = instant(end);
    if (!Number.isFinite(endMs)) return null;
    var endOfDay = allDay || end.length === 10;
    var cutoff = endOfDay ? nextMidnight(endMs) : endMs;
    var startMs = instant(start);
    if (endOfDay ? cutoff <= startMs : cutoff < startMs) return null;
    return cutoff;
  }
  function endsAt(event) {
    if (event.recurring) return Infinity;
    var start = event.start_at || event.start;
    var end = validEnd(start, event.end_at || event.end, event.allDay);
    if (end !== null) return end;
    var ms = instant(start);
    return Number.isFinite(ms) ? nextMidnight(ms) : NaN;
  }
  function onNextEnd(events, refresh) {
    var now = Date.now(), next = Infinity;
    events.forEach(function (event) {
      var cutoff = endsAt(event);
      if (cutoff > now && cutoff < next) next = cutoff;
    });
    if (next === Infinity) return;
    // Long delays overflow browser timers. Rearm without rerendering early.
    var timer;
    function wait() {
      var delay = next - Date.now();
      if (delay <= 0) refresh();
      else timer = setTimeout(wait, Math.min(delay, 2147483647));
    }
    wait();
    return function cancel() { clearTimeout(timer); };
  }
  var api = { instant: instant, localISO: localISO, endsAt: endsAt, validEnd: validEnd, onNextEnd: onNextEnd };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBTEventTime = api;
})(typeof window === 'undefined' ? null : window);
