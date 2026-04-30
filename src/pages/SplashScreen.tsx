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
.chichat-splash .track {
  display: flex; height: 100%; width: 600%;
  animation: chichat-slide 24s linear infinite;
}
.chichat-splash .track img {
  width: calc(100% / 6); height: 100%;
  object-fit: cover; object-position: center 8%;
  flex-shrink: 0; opacity: 0.42;
}
@keyframes chichat-slide {
  0% { transform: translateX(0); }
  100% { transform: translateX(-83.3333%); }
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
  width: clamp(64px, 13vh, 104px);
  height: clamp(64px, 13vh, 104px);
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
.chichat-splash .wordmark em { color: #22C55E; font-style: normal; }
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
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.70s both;
}
@media (orientation: landscape) and (max-height: 500px) {
  .chichat-splash .content { padding: 16px 24px; }
  .chichat-splash .logo-icon { margin-bottom: 6px; }
  .chichat-splash .wordmark { margin-bottom: 4px; letter-spacing: 1.5px; }
  .chichat-splash .cta { height: 36px; width: 130px; font-size: 12px; }
  .chichat-splash .signin { margin-top: 6px; }
}
.chichat-splash .cta {
  width: 141px; height: 42px; border-radius: 21px; border: none;
  background: linear-gradient(120deg, #22C55E 0%, #16A34A 100%);
  color: #fff;
  font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 700; letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(34,197,94,0.38), inset 0 1px 0 rgba(255,255,255,0.18);
  position: relative; overflow: hidden;
  transition: transform 0.13s;
}
.chichat-splash .cta::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 55%);
}
.chichat-splash .cta:active { transform: scale(0.97); }
.chichat-splash .signin {
  margin-top: 10px;
  font-family: 'DM Sans', sans-serif;
  font-size: 10px; font-weight: 500;
  color: rgba(255,255,255,0.65);
  text-align: center;
}
.chichat-splash .signin button {
  background: none; border: none; padding: 0; margin-left: 4px;
  color: #22C55E; font-weight: 700; cursor: pointer;
  font-family: inherit; font-size: inherit;
  text-decoration: underline; text-underline-offset: 3px;
}
@keyframes chichat-rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

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

  // Duplicate first image at end so the loop is seamless (matches -83.3333% shift)
  const trackImages = [...IMAGES, IMAGES[0]];

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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button className="cta" onClick={onGetStarted}>
              Get Started
            </button>
            <div className="signin">
              Already have an account?
              <button type="button" onClick={onSignIn}>Sign in</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
