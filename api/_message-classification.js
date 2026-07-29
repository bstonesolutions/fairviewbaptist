/* Conservative server-side classification for individual message pages.
   The browser has a richer auto-router in assets/videos.js; this helper keeps
   crawlable server routes deliberately narrower. A video is a message only
   when it has positive sermon evidence after clips, services, and music have
   been ruled out. Studio's explicit type is always authoritative. */

const MESSAGE = 'message';
const MUSIC = 'music';
const SERVICE = 'service';
const CLIP = 'clip';
const OTHER = 'other';

const BIBLE_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua',
  'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job',
  'Psalms?', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Song of Songs',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
  'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
];
const BIBLE_RE = new RegExp('(?:^|[^a-z])(?:' + BIBLE_BOOKS.map(function (name) {
  return name.replace(/ /g, '\\s+');
}).join('|') + ')\\s+\\d{1,3}(?::\\d{1,3}(?:[\\-–—]\\d{1,3})?)?(?:[^a-z]|$)', 'i');

function text(value) { return String(value == null ? '' : value).trim(); }

function parseDuration(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const match = raw.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return null;
  const seconds = (Number(match[1] || 0) * 86400) + (Number(match[2] || 0) * 3600) +
    (Number(match[3] || 0) * 60) + Number(match[4] || 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function explicitType(override) {
  const value = text(typeof override === 'string' ? override : override && override.type).toLowerCase();
  return [MESSAGE, MUSIC, SERVICE, CLIP].indexOf(value) >= 0 ? value : '';
}

function hasScripture(value) { return BIBLE_RE.test(text(value)); }

function hasSpeaker(value) {
  const valueText = text(value);
  return /\b(?:pastor|pas\.?|rev\.?|bro\.?|brother|dr\.?)\s+[a-z]/i.test(valueText) ||
    /\bmichael\s+spurlock\b/i.test(valueText);
}

function classifyVideo(video, override) {
  const forced = explicitType(override);
  if (forced) return forced;

  video = video || {};
  const title = text(video.title || video.rawTitle);
  const description = text(video.description);
  const combined = title + '\n' + description;
  const duration = parseDuration(video.duration || video.durationSeconds || video.isoDuration);

  // Shorts and promotional reels never become crawlable message pages.
  if ((duration != null && duration > 0 && duration <= 75) ||
      (title.match(/#[\w]+/g) || []).length || /\breels?\b/i.test(title)) return CLIP;

  const hasDate = /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/.test(title) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?\b/i.test(title);
  const messageEvidenceInTitle = hasSpeaker(title) || hasScripture(title);
  const serviceTitle = /\b(?:midweek|sunday school|sunday worship|sunday service|wednesday|worship|church service|evening service|fairview)\b/i.test(title);
  const eventTitle = /\b(?:prayer meeting|revival|homecoming|vacation bible school)\b/i.test(title);
  const welcomeDescription = /\bwelcome to fairview\b/i.test(description);
  if ((hasDate && serviceTitle) || /\bwelcome to fairview\b|@\s*fairview\b/i.test(title) ||
      (hasDate && eventTitle && !messageEvidenceInTitle) ||
      (welcomeDescription && !messageEvidenceInTitle)) return SERVICE;

  // A bare quoted title is normally a song, as are explicitly musical uploads.
  if (/^\s*["“][^"”]+["”]\s*$/.test(title)) return MUSIC;
  const musicEvidence = /#worshipmusic|\bworship music\b|\bmusic video\b|\bchoir\b|\bspecial music\b|#worship\b|\bhymn sing\b|\bsing(?:s|ing)?\s+["“]/i;
  if (musicEvidence.test(combined) && !messageEvidenceInTitle &&
      !/\b(?:sermon|message|preach(?:ing|ed)?|bible study)\b/i.test(title)) return MUSIC;

  // Positive evidence is required for a crawlable sermon. Unknown channel
  // uploads remain available in the hubs but are not put in the sitemap.
  if (hasSpeaker(combined) || hasScripture(combined) ||
      /\b(?:sermon|message|preach(?:er|ing|ed)?|bible study)\b/i.test(combined)) return MESSAGE;
  return OTHER;
}

function isMessageVideo(video, override) { return classifyVideo(video, override) === MESSAGE; }

module.exports = {
  MESSAGE: MESSAGE,
  MUSIC: MUSIC,
  SERVICE: SERVICE,
  CLIP: CLIP,
  OTHER: OTHER,
  parseDuration: parseDuration,
  classifyVideo: classifyVideo,
  isMessageVideo: isMessageVideo,
};
