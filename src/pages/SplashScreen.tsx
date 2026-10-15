import { useEffect } from "react";
import chichatLogo from "@/assets/chichat-logo.png";

const IMAGES = [
  "/assets/splash/splash-1.jpg",
  "/assets/splash/splash-2.jpg",
  "/assets/splash/splash-3.jpg",
  "/assets/splash/splash-4.jpg",
  "/assets/splash/splash-5.jpg",
  "/assets/splash/splash-6.jpg",
];

const STYLE_ID = "chichat-splash-styles";
const CSS = `
.chichat-splash, .chichat-splash *, .chichat-splash *::before, .chichat-splash *::after {
  box-sizing: border-box; margin: 0; padding: 0;
}
.chichat-splash {
  position: fixed; inset: 0;
  width: 100%; height: 100%;
  overflow: hidden;
  background: #07090C;
  font-family: 'DM Sans', sans-serif;
}
.chichat-splash .carousel { position: absolute; inset: 0; z-index: 0; }
/* Photos blend into each other: each one's left and right edges fade out
   and neighbours overlap by --overlap, so one photo dissolves into the next
   instead of meeting it at a hard line. Every tile has the same width and
   overlap, so two copies of the set still loop seamlessly at -50%. */
.chichat-splash {
  --tile: 100vw;
  --overlap: calc(var(--tile) * 0.22);
}
.chichat-splash .track {
  display: flex; height: 100%; width: max-content;
  /* Start one fade-width to the left so the first photo's faded edge is
     off screen (the loop still lines up, since every tile shifts equally). */
  margin-left: calc(var(--overlap) * -1);
  animation: chichat-slide 48s linear infinite;
}
.chichat-splash .track img {
  width: var(--tile); height: 100%;
  margin-right: calc(var(--overlap) * -1);
  object-fit: cover; object-position: center 8%;
  flex-shrink: 0; opacity: 0.42;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%);
  mask-image: linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%);
}
@keyframes chichat-slide {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.chichat-splash .tint {
  position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(
    to bottom,
    rgba(7,9,12,0.45) 0%,
    rgba(7,9,12,0.15) 30%,
    rgba(7,9,12,0.15) 55%,
    rgba(7,9,12,0.78) 78%,
    rgba(7,9,12,0.97) 100%
  );
}
.chichat-splash .frame-outer,
.chichat-splash .frame-inner {
  position: absolute; z-index: 2;
  pointer-events: none;
  border-radius: 52px;
}
.chichat-splash .frame-outer {
  top: max(env(safe-area-inset-top), 18px);
  bottom: max(env(safe-area-inset-bottom), 18px);
  left: max(env(safe-area-inset-left), 18px);
  right: max(env(safe-area-inset-right), 18px);
  border: 1.2px solid rgba(255,255,255,0.28);
  opacity: 0;
  animation: chichat-fadein 1.6s ease 0.2s forwards;
}
.chichat-splash .frame-inner {
  top: max(env(safe-area-inset-top), 30px);
  bottom: max(env(safe-area-inset-bottom), 30px);
  left: max(env(safe-area-inset-left), 30px);
  right: max(env(safe-area-inset-right), 30px);
  border-radius: 44px;
  border: 0.9px solid rgba(255,255,255,0.14);
  opacity: 0;
  animation: chichat-fadein 1.6s ease 0.5s forwards;
}
@keyframes chichat-fadein { to { opacity: 1; } }
.chichat-splash .content {
  position: absolute;
  top: max(env(safe-area-inset-top), 28px);
  bottom: max(env(safe-area-inset-bottom), 28px);
  left: max(env(safe-area-inset-left), 28px);
  right: max(env(safe-area-inset-right), 28px);
  z-index: 3;
  display: flex; flex-direction: column;
  align-items: center; justify-content: space-between;
  padding: 24px 16px;
}
.chichat-splash .brand {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; width: 100%; min-height: 0;
  padding: 12px 0;
}
.chichat-splash .logo-icon {
  margin-bottom: 14px;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.2s both;
}
.chichat-splash .logo-icon img {
  width: clamp(76px, 15vh, 124px);
  height: clamp(76px, 15vh, 124px);
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.35));
}
.chichat-splash .wordmark {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(28px, 6vh, 44px);
  font-weight: 500;
  color: #fff; letter-spacing: 2.5px; line-height: 1.15;
  margin-bottom: 10px;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.35s both;
}
.chichat-splash .wordmark em { color: hsl(var(--accent)); font-style: normal; }
.chichat-splash .tagline {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(10px, 1.6vh, 12px);
  font-weight: 700;
  color: rgba(255,255,255,0.60);
  letter-spacing: 0.10em;
  text-align: center;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(255,255,255,0.22);
  white-space: nowrap;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.50s both;
}
.chichat-splash .cta-wrap {
  display: flex; justify-content: center; width: 100%;
  flex-shrink: 0;
  /* Keep the buttons clear of the bottom of the decorative phone frame and
     the device gesture area. */
  margin-bottom: 22px;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.70s both;
}

.chichat-splash .cta-group {
  display: flex; flex-direction: column; align-items: center;
  width: 100%;
}
.chichat-splash .cta {
  width: min(220px, 100%); height: 48px; border-radius: 999px; border: none;
  background: linear-gradient(120deg, hsl(var(--accent)) 0%, hsl(var(--primary)) 100%);
  color: #fff;
  font-family: 'Syne', sans-serif;
  font-size: 15px; font-weight: 700; letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 6px 20px hsl(var(--accent) / 0.38), inset 0 1px 0 rgba(255,255,255,0.18);
  position: relative; overflow: hidden;
  transition: transform 0.13s;
}
.chichat-splash .cta::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 55%);
}
.chichat-splash .cta:active { transform: scale(0.97); }
/* Sign in prompt: its own row under the button. The Sign in link has
   padding so it's a full-size tap target, not just the height of its text. */
.chichat-splash .signin {
  margin-top: 14px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  font-family: 'DM Sans', sans-serif;
  font-size: 15px; font-weight: 500; line-height: 1.3;
  color: rgba(255,255,255,0.82);
  text-align: center;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.chichat-splash .signin button {
  background: none; border: none;
  min-height: 44px; padding: 0 8px; margin-left: -2px;
  color: hsl(var(--accent)); font-weight: 700; cursor: pointer;
  font-family: inherit; font-size: inherit;
  text-decoration: underline; text-underline-offset: 3px;
  border-radius: 8px;
}
/* Terms and Privacy: a separate, quieter row below the sign in prompt. */
.chichat-splash .legal {
  margin-top: 4px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  column-gap: 6px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px; line-height: 1.3; color: rgba(255,255,255,0.5);
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.chichat-splash .legal a {
  display: inline-flex; align-items: center;
  min-height: 40px; padding: 0 8px;
  color: rgba(255,255,255,0.78); text-decoration: underline; text-underline-offset: 3px;
  border-radius: 8px;
}
.chichat-splash .legal a:hover { color: #fff; }
.chichat-splash .cta:focus-visible,
.chichat-splash .signin button:focus-visible,
.chichat-splash .legal a:focus-visible {
  outline: 2px solid hsl(var(--accent)); outline-offset: 3px;
}
/* Small phones (about 360 px and below): less side padding and slightly
   smaller text so "Already have an account? Sign in" stays on one line. */
@media (max-width: 360px) {
  .chichat-splash .content { padding: 20px 4px; }
  .chichat-splash .signin { font-size: 14px; }
  .chichat-splash .signin button { padding: 0 6px; }
  .chichat-splash .legal a { padding: 0 6px; }
}
/* Very narrow screens: the two legal links stack instead of squeezing. */
@media (max-width: 300px) {
  .chichat-splash .legal { flex-direction: column; }
  .chichat-splash .legal .dot { display: none; }
  .chichat-splash .legal a { min-height: 36px; }
}
@keyframes chichat-rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Tablet and desktop: no decorative phone frame and no boxed column. The
   frame is a phone-only touch (it echoes the device's own rounded screen);
   on larger screens it just looks like a box drawn round the page, so the
   photo backdrop runs full screen and only the content stays centred. */
@media (min-width: 768px) {
  .chichat-splash .frame-outer,
  .chichat-splash .frame-inner {
    display: none !important;
  }
  .chichat-splash .track img { object-position: center 22%; }
  .chichat-splash .content {
    left: 50%; right: auto;
    transform: translateX(-50%);
    width: min(560px, 100%);
    padding: 32px 24px;
  }
  .chichat-splash .logo-icon img {
    width: clamp(96px, 15vh, 140px); height: clamp(96px, 15vh, 140px);
  }
  .chichat-splash .wordmark { font-size: clamp(36px, 6vh, 52px); }
  .chichat-splash .tagline { font-size: clamp(12px, 1.6vh, 14px); }
  .chichat-splash .cta-wrap { margin-bottom: 28px; }
  .chichat-splash .cta { width: 240px; height: 54px; font-size: 16px; }
  .chichat-splash .signin { margin-top: 18px; font-size: 16px; }
  .chichat-splash .legal { margin-top: 6px; font-size: 14px; column-gap: 10px; }
}

/* Desktop: a portrait photo stretched across a wide screen turns into one
   huge, blurry, cropped face. Show the photos as a row of portrait tiles at
   their natural proportions instead, drifting slowly across the screen. */
@media (min-width: 1024px) {
  .chichat-splash { --tile: calc(100vh * 0.62); }
  .chichat-splash .track { animation-duration: 90s; }
  .chichat-splash .track img { object-position: center 12%; }
  .chichat-splash .content { width: min(640px, 100%); padding: 40px 32px; }
  .chichat-splash .logo-icon { margin-bottom: 18px; }
  .chichat-splash .logo-icon img {
    width: clamp(110px, 17vh, 168px); height: clamp(110px, 17vh, 168px);
  }
  .chichat-splash .wordmark { font-size: clamp(40px, 6.5vh, 64px); margin-bottom: 14px; }
  .chichat-splash .tagline { font-size: clamp(13px, 1.6vh, 16px); }
  .chichat-splash .cta-wrap { margin-bottom: clamp(24px, 6vh, 64px); }
  .chichat-splash .cta { width: 260px; height: 56px; font-size: 17px; }
  .chichat-splash .signin { margin-top: 22px; font-size: 17px; }
  .chichat-splash .legal { margin-top: 10px; font-size: 15px; column-gap: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .chichat-splash .track { animation-duration: 240s; }
}
/* Phones turned sideways: very little height, so everything compacts. */
@media (orientation: landscape) and (max-height: 500px) {
  .chichat-splash .content { padding: 12px 24px; }
  .chichat-splash .logo-icon img { width: 64px; height: 64px; }
  .chichat-splash .wordmark { font-size: 28px; }
  .chichat-splash .tagline { font-size: 11px; }
  .chichat-splash .logo-icon { margin-bottom: 6px; }
  .chichat-splash .wordmark { margin-bottom: 4px; letter-spacing: 1.5px; }
  .chichat-splash .cta-wrap { margin-bottom: 4px; }
  .chichat-splash .cta { height: 40px; width: 160px; font-size: 13px; }
  .chichat-splash .signin { margin-top: 2px; font-size: 14px; }
  .chichat-splash .legal { margin-top: 0; font-size: 13px; }
  .chichat-splash .signin button { min-height: 36px; }
  .chichat-splash .legal a { min-height: 32px; }
}`;

interface Props {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

export default function SplashScreen({ onGetStarted, onSignIn }: Props) {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);

  // Two copies of the set; the track slides by exactly one set (-50%), so
  // the loop is seamless on every screen size.
  const trackImages = [...IMAGES, ...IMAGES];

  return (
    <div className="chichat-splash">
      <div className="carousel">
        <div className="track">
          {trackImages.map((src, i) => (
            <img key={i} src={src} alt="" />
          ))}
        </div>
      </div>

      <div className="tint" />

      <div className="frame-outer" />
      <div className="frame-inner" />

      <div className="content">
        <div style={{ height: 0 }} />
        <div className="brand">
          <div className="logo-icon">
            <img src={chichatLogo} alt="ChiChat" />
          </div>
          <div className="wordmark">
            Chi<em>chat</em>
          </div>
          <div className="tagline">Experience The Possibilities</div>
        </div>

        <div className="cta-wrap">
          <div className="cta-group">
            <button className="cta" onClick={onGetStarted}>
              Get Started
            </button>
            <div className="signin">
              Already have an account?
              <button type="button" onClick={onSignIn}>Sign in</button>
            </div>
            {/* Required for app-store / Google OAuth review: the home page
                must link to the Terms of Service and Privacy Policy. */}
            <nav className="legal" aria-label="Legal">
              <a href="/terms">Terms of Service</a>
              <span className="dot" aria-hidden>·</span>
              <a href="/privacy">Privacy Policy</a>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
