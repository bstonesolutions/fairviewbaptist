/* ============================================================
   Fairview Baptist Temple — shared media appearance settings.

   Studio stores one small JSON object beside each media URL in site_content.
   Public pages and Studio both use this file so framing, color, and overlay
   previews cannot drift apart.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTMediaStyles = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  var STYLE_PREFIX = 'media_style_';
  var OVERLAYS = ['none', 'brand', 'solid', 'left', 'bottom', 'vignette'];
  var BACKGROUNDS = ['theme', 'fbt-gradient', 'deep', 'navy', 'fbt', 'light', 'custom'];
  var FITS = ['cover', 'contain'];
  var SOURCES = ['auto', 'video', 'image', 'background'];

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback;
    return Math.min(max, Math.max(min, n));
  }

  function color(value, fallback) {
    var v = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : fallback;
  }

  function choice(value, allowed, fallback) {
    value = String(value || '').toLowerCase();
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function point(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      x: Math.round(clamp(raw.x, 0, 100, 50)),
      y: Math.round(clamp(raw.y, 0, 100, 50)),
      zoom: Math.round(clamp(raw.zoom, 100, 200, 100))
    };
  }

  function defaults(kind) {
    var background = kind === 'background';
    return {
      v: 1,
      source: 'auto',
      fit: 'cover',
      background: 'theme',
      backgroundColor: '#123B42',
      imageOpacity: 100,
      overlay: background ? 'brand' : 'none',
      overlayColor: '#0A252C',
      overlayOpacity: background ? 82 : 0,
      desktop: { x: 50, y: 50, zoom: 100 },
      mobile: { x: 50, y: 50, zoom: 100 }
    };
  }

  function normalize(raw, kind) {
    kind = kind === 'background' ? 'background' : 'photo';
    var base = defaults(kind);
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      v: 1,
      source: choice(raw.source, kind === 'background' ? SOURCES : ['auto', 'image', 'background'], base.source),
      fit: choice(raw.fit, FITS, base.fit),
      background: choice(raw.background, BACKGROUNDS, base.background),
      backgroundColor: color(raw.backgroundColor, base.backgroundColor),
      imageOpacity: Math.round(clamp(raw.imageOpacity, 0, 100, base.imageOpacity)),
      overlay: choice(raw.overlay, OVERLAYS, base.overlay),
      overlayColor: color(raw.overlayColor, base.overlayColor),
      overlayOpacity: Math.round(clamp(raw.overlayOpacity, 0, 100, base.overlayOpacity)),
      desktop: point(raw.desktop || base.desktop),
      mobile: point(raw.mobile || base.mobile)
    };
  }

  function parse(value, kind) {
    var raw = value;
    if (typeof value === 'string') {
      if (!value.trim() || value.length > 12000) return null;
      try { raw = JSON.parse(value); } catch (e) { return null; }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return normalize(raw, kind);
  }

  function serialize(style, kind) {
    return JSON.stringify(normalize(style, kind));
  }

  function styleKey(mediaKey) {
    mediaKey = String(mediaKey || '');
    return /^[a-z0-9_:-]{1,80}$/i.test(mediaKey) ? STYLE_PREFIX + mediaKey : '';
  }

  function hexRgb(hex) {
    hex = color(hex, '#0A252C').slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function rgba(hex, opacity) {
    var rgb = hexRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + clamp(opacity, 0, 1, 0) + ')';
  }

  function backgroundValue(style, kind) {
    style = normalize(style, kind);
    switch (style.background) {
      case 'fbt-gradient':
        return 'radial-gradient(90% 80% at 78% 4%,rgba(23,126,121,.52),transparent 57%),linear-gradient(155deg,#20706B 0%,#123B42 55%,#0A252C 100%)';
      case 'deep': return '#123B42';
      case 'navy': return '#223A5E';
      case 'fbt': return '#177E79';
      case 'light': return '#DCEEF6';
      case 'custom': return style.backgroundColor;
      default: return '';
    }
  }

  function overlayValue(style, kind) {
    style = normalize(style, kind);
    var strength = style.overlayOpacity / 100;
    var strong = rgba(style.overlayColor, strength);
    var medium = rgba(style.overlayColor, strength * 0.64);
    var faint = rgba(style.overlayColor, strength * 0.12);
    switch (style.overlay) {
      case 'none': return 'transparent';
      case 'solid': return 'linear-gradient(' + strong + ',' + strong + ')';
      case 'left': return 'linear-gradient(90deg,' + strong + ' 0%,' + medium + ' 46%,' + faint + ' 100%)';
      case 'bottom': return 'linear-gradient(0deg,' + strong + ' 0%,' + medium + ' 38%,' + rgba(style.overlayColor, 0) + ' 86%)';
      case 'vignette': return 'radial-gradient(ellipse at center,' + rgba(style.overlayColor, 0) + ' 30%,' + medium + ' 72%,' + strong + ' 100%)';
      default:
        return 'linear-gradient(145deg,' + medium + ' 0%,' + strong + ' 100%)';
    }
  }

  function presentation(style, kind, viewport) {
    style = normalize(style, kind);
    var p = viewport === 'mobile' ? style.mobile : style.desktop;
    return {
      fit: style.fit,
      background: backgroundValue(style, kind),
      imageOpacity: style.imageOpacity / 100,
      overlay: overlayValue(style, kind),
      x: p.x,
      y: p.y,
      zoom: p.zoom / 100
    };
  }

  return {
    STYLE_PREFIX: STYLE_PREFIX,
    OVERLAYS: OVERLAYS.slice(),
    BACKGROUNDS: BACKGROUNDS.slice(),
    FITS: FITS.slice(),
    SOURCES: SOURCES.slice(),
    defaults: defaults,
    normalize: normalize,
    parse: parse,
    serialize: serialize,
    styleKey: styleKey,
    backgroundValue: backgroundValue,
    overlayValue: overlayValue,
    presentation: presentation,
    color: color,
    clamp: clamp
  };
});
