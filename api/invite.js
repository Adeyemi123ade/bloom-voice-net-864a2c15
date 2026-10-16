// Invite page for personal links like https://www.chichatapp.com/i/Sulaimon
// (vercel.json sends /i/<name> here).
//
// Chat apps (WhatsApp, Telegram, Messenger, SMS) read the og: tags below and
// show the link as a ChiChat card: "Sulaimon invited you to ChiChat". People
// who tap the card see this page, with the download button.
//
// When ChiChat is live on Google Play, set PLAY_STORE_LIVE to true: the main
// button then says "Download for Android" and opens the Play listing. Until
// then it opens sign up on the website, so the button never leads nowhere.

export const config = { runtime: "edge" };

const PLAY_STORE_LIVE = false;
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.bloomvoicenet.chat";
const SITE = "https://www.chichatapp.com";
const LOGO = `${SITE}/chichat-logo.png`;
// The link card in chat apps shows the big ChiChat logo (owner's choice).
const CARD_IMAGE = `${SITE}/chichat-logo.png?v=20261013`;

/** Letters only (any language), apostrophes, dots and hyphens, up to 30. */
function cleanName(raw) {
  let name = "";
  try {
    name = decodeURIComponent(raw || "");
  } catch {
    name = "";
  }
  name = name.trim().split(/\s+/)[0] || "";
  return /^[\p{L}\p{M}'.-]{1,30}$/u.test(name) ? name : null;
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const icons = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  device: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
};
const icon = (name, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

function page(name, path) {
  const who = name ? esc(name) : "A friend";
  const title = `${who} invited you to ChiChat`;
  const description = "Chichat Connect is a mobile-first secondary telecommunication app for audio and video calls.";
  const findStep = name ? `Find ${who} and say hi` : "Find your friend and say hi";
  const mainButton = PLAY_STORE_LIVE
    ? `<a class="btn primary" href="${PLAY_STORE_URL}">${icon("download", 20)}Download for Android</a>
       <a class="btn secondary" href="${SITE}/register">${icon("globe", 19)}Open in your browser</a>`
    : `<a class="btn primary" href="${SITE}/register">${icon("download", 20)}Join ChiChat</a>`;
  const firstStep = PLAY_STORE_LIVE ? "Download the app or open it in your browser" : "Tap Join ChiChat";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ChiChat">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE}${esc(path)}">
<meta property="og:image" content="${CARD_IMAGE}">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:image:alt" content="ChiChat logo">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${CARD_IMAGE}">
<meta name="theme-color" content="#0F7F5C">
<link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700;9..40,800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#F4F7F6;color:#10201A;font-family:'DM Sans',system-ui,-apple-system,sans-serif}
.wrap{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;background:#F4F7F6}
header{height:60px;padding:0 20px;display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid #E3EAE7}
header img{width:32px;height:32px;object-fit:contain}
header span{font-size:19px;font-weight:800;color:#0E5A40;letter-spacing:-.3px}
.hero{position:relative;height:230px;background:#18A874;overflow:hidden}
.ring{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%)}
.r1{width:260px;height:260px;border:1.5px solid rgba(255,255,255,.15)}
.r2{width:400px;height:400px;border:1.5px solid rgba(255,255,255,.09)}
.r3{width:160px;height:160px;background:rgba(255,255,255,.1)}
.logo{position:absolute;left:50%;top:50%;width:104px;height:104px;transform:translate(-50%,-50%);border-radius:28px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 14px 30px rgba(0,0,0,.22)}
.logo img{width:78px;height:78px;object-fit:contain}
.bub{position:absolute;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.b1{left:calc(50% - 133px);top:52px;background:#fff;color:#0F7F5C}
.b2{right:calc(50% - 137px);top:140px;background:#FFD45C;color:#0B2E22}
.dots{position:absolute;right:calc(50% - 147px);top:48px;padding:9px 12px;background:#fff;border-radius:16px 16px 16px 4px;display:flex;gap:4px}
.dots i{width:7px;height:7px;border-radius:50%;background:#0F7F5C}
.dots i:nth-child(2){opacity:.6}.dots i:nth-child(3){opacity:.3}
main{padding:28px 20px 0;text-align:center}
h1{margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.7px}
main p{margin:12px 0 0;font-size:16px;line-height:1.5;color:#3F504A}
.btn{margin-top:12px;width:100%;min-height:54px;border-radius:29px;text-decoration:none;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px}
.primary{margin-top:24px;min-height:58px;background:#0F7F5C;color:#fff;box-shadow:0 8px 20px rgba(15,127,92,.28)}
.secondary{background:#fff;border:1.5px solid #CFDCD6;color:#10201A;font-size:16px}
section{margin:16px 20px 0;padding:22px 20px;border-radius:20px;background:#fff;display:flex;flex-direction:column;gap:16px}
section:first-of-type{margin-top:30px}
h2{margin:0;font-size:17px;font-weight:800}
.feat{display:flex;gap:14px;align-items:flex-start}
.feat .ic{flex:none;width:42px;height:42px;border-radius:13px;background:#E3F4EC;color:#0F7F5C;display:flex;align-items:center;justify-content:center}
.feat b{display:block;font-size:15px}
.feat span{display:block;margin-top:2px;font-size:14px;line-height:1.45;color:#5E6F68}
.step{display:flex;gap:12px;align-items:center;font-size:15px}
.step i{flex:none;width:28px;height:28px;border-radius:50%;background:#0F7F5C;color:#fff;font-size:13px;font-weight:700;font-style:normal;display:flex;align-items:center;justify-content:center}
footer{margin-top:auto;padding:24px 20px 28px;display:flex;justify-content:center;gap:16px;font-size:13px}
footer a{color:#0F7F5C}
</style>
</head>
<body>
<div class="wrap">
  <header><img src="${LOGO}" alt=""><span>ChiChat</span></header>
  <div class="hero" aria-hidden="true">
    <div class="ring r2"></div><div class="ring r1"></div><div class="ring r3"></div>
    <div class="logo"><img src="${LOGO}" alt=""></div>
    <div class="bub b1">${icon("phone", 21)}</div>
    <div class="bub b2">${icon("video", 21)}</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <main>
    <h1>${title}</h1>
    <p>I've been using ChiChat for high-quality calls and messages. Join me so we can call for free.</p>
    ${mainButton}
  </main>
  <section>
    <h2>What you get on ChiChat</h2>
    <div class="feat"><div class="ic">${icon("video", 19)}</div><div><b>Free voice &amp; video calls</b><span>Call friends and family in clear sound and video.</span></div></div>
    <div class="feat"><div class="ic">${icon("chat", 19)}</div><div><b>Messages, voice notes, transcription and attachments</b><span>Chat and send voice notes, pictures, videos and documents.</span></div></div>
    <div class="feat"><div class="ic">${icon("device", 19)}</div><div><b>On your phone and computer</b><span>Use the Android app, or chichatapp.com in any browser.</span></div></div>
  </section>
  <section>
    <h2>Join in 3 steps</h2>
    <div class="step"><i>1</i>${firstStep}</div>
    <div class="step"><i>2</i>Create your account</div>
    <div class="step"><i>3</i>${findStep}</div>
  </section>
  <footer><a href="${SITE}/privacy">Privacy Policy</a><a href="${SITE}/terms">Terms of Service</a></footer>
</div>
</body>
</html>`;
}

export default function handler(request) {
  const url = new URL(request.url);
  const name = cleanName(url.searchParams.get("name"));
  const path = name ? `/i/${encodeURIComponent(name)}` : "/i";
  return new Response(page(name, path), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=86400",
    },
  });
}
