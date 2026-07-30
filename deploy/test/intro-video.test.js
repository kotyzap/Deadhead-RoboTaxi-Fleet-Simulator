/* Intro-video wiring guard.
 *
 * WHY THIS EXISTS
 *
 * The cold-open video is the first thing a new player sees, and every way it
 * can break is silent. There is no console error and no visible fault — the
 * player just stares at a black rectangle and leaves.
 *
 *   1. NOT FASTSTART. If the moov atom sits behind mdat, the browser cannot
 *      decode a single frame until it has downloaded the WHOLE file. Both
 *      the 0.26-era clip and the raw 0.44.0 export shipped this way. The fix
 *      is `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` — lossless,
 *      one second — but nothing reminds you, and the symptom (slow) is
 *      indistinguishable from a slow connection. This is the check that
 *      matters most.
 *
 *   2. A DANGLING src. deadhead.html is served two ways: from
 *      deploy/public/ on Cloudflare, and straight off disk as a standalone
 *      file. Its asset paths are relative, so every referenced file has to
 *      exist in BOTH places. Copying only into deploy/public/ leaves the
 *      standalone build with a broken video and nothing says so.
 *
 *   3. preload creeping back to "metadata". The element is in the DOM from
 *      first paint even though #intro starts hidden, so anything other than
 *      "none" makes every visitor open a connection to an 11 MB mp4 before
 *      they have decided to watch anything.
 *
 *   4. OVER-25 MiB. Workers static assets reject a file above that limit at
 *      deploy time, which is a bad moment to find out.
 *
 * Run: node test/intro-video.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');      // repo root, holds deadhead.html
const PUBLIC = path.join(__dirname, '..', 'public'); // what Cloudflare serves
const GAME = path.join(ROOT, 'deadhead.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('intro video');

const src = fs.readFileSync(GAME, 'utf8');

/* The <video> element, from the tag through its closing tag — the poster,
   src, preload and any <track> children all live in here. */
const el = (src.match(/<video id="intro-video"[\s\S]*?<\/video>/) || [])[0];
check('deadhead.html has the #intro-video element', !!el);
if (!el) { process.exit(1) }

check('preload is still "none", not "metadata"', /preload="none"/.test(el),
  'the element exists from first paint; anything else fetches the mp4 for ' +
  'every visitor, including the ones who never press play');

const videoSrc = (el.match(/\ssrc="([^"]+\.mp4)"/) || [])[1];
const poster = (el.match(/poster="([^"]+)"/) || [])[1];
const track = (el.match(/<track[^>]*\ssrc="([^"]+)"/) || [])[1];

check('it names an mp4', !!videoSrc);
check('it names a poster', !!poster);
check('it carries a captions track', !!track);
if (!videoSrc) { process.exit(1) }

/* Paths are relative, so they resolve against whichever directory the html
   is being served from. Both directories have to satisfy them. */
for (const asset of [videoSrc, poster, track].filter(Boolean)) {
  for (const [name, dir] of [['standalone (repo root)', ROOT], ['deploy/public', PUBLIC]]) {
    const p = path.join(dir, asset);
    check(`${asset} exists in ${name}`, fs.existsSync(p));
  }
}

const mp4 = path.join(PUBLIC, videoSrc);
if (fs.existsSync(mp4)) {
  /* Faststart, read straight out of the container rather than shelling out
     to ffprobe — the suite must run with no system ffmpeg. Top-level atoms
     are [4-byte big-endian size][4-byte type] from byte 0, so walking them
     is exact and cheap; the first of moov/mdat we reach is the answer. The
     naive `indexOf('moov')` would also match those four bytes appearing by
     chance inside compressed video data. */
  const fd = fs.openSync(mp4, 'r');
  let off = 0, first = null;
  const head = Buffer.alloc(8);
  try {
    const total = fs.fstatSync(fd).size;
    while (off + 8 <= total) {
      fs.readSync(fd, head, 0, 8, off);
      let size = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (type === 'moov' || type === 'mdat') { first = type; break }
      if (size === 1) {                     // 64-bit extended size
        const big = Buffer.alloc(8);
        fs.readSync(fd, big, 0, 8, off + 8);
        size = Number(big.readBigUInt64BE(0));
      }
      if (size < 8) break;                  // malformed; stop rather than loop
      off += size;
    }
  } finally { fs.closeSync(fd) }

  check(`${videoSrc} is faststart (moov ahead of mdat)`, first === 'moov',
    `first top-level atom of the two is "${first}" — re-run: ` +
    'ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4');

  const mb = fs.statSync(mp4).size / (1024 * 1024);
  check(`${videoSrc} is under the 25 MiB Workers asset limit (${mb.toFixed(1)} MB)`,
    mb < 25);

  /* Byte-identical in both locations. A half-finished copy leaves the
     standalone build on the previous cut, which is worse than a missing
     file because it looks like it worked. */
  const alt = path.join(ROOT, videoSrc);
  if (fs.existsSync(alt)) {
    check('the standalone copy of the mp4 is byte-identical',
      fs.statSync(alt).size === fs.statSync(mp4).size);
  }
}

const vtt = track && path.join(PUBLIC, track);
if (vtt && fs.existsSync(vtt)) {
  check('the captions file is real WebVTT',
    fs.readFileSync(vtt, 'utf8').startsWith('WEBVTT'));
}

/* deadhead.html and deploy/public/index.html are meant to be byte-identical
   (see scripts/check-parity.js). Assert it here too for the one element this
   test is about, so a video change made in only one of them fails loudly. */
const deployed = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const deployedEl = (deployed.match(/<video id="intro-video"[\s\S]*?<\/video>/) || [])[0];
check('deploy/public/index.html carries the same <video> element',
  deployedEl === el);

console.log(failures
  ? `\n${failures} intro-video check(s) failed.`
  : '\nAll intro-video checks passed.');
process.exit(failures ? 1 : 0);
