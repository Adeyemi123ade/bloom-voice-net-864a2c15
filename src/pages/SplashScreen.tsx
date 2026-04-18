import { useEffect } from "react";

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
.chichat-splash .frame-svg {
  position: absolute; inset: 0; z-index: 2;
  pointer-events: none; width: 100%; height: 100%;
}
.chichat-splash .line-outer {
  stroke-dasharray: 2200; stroke-dashoffset: 2200;
  animation: chichat-draw 2.8s cubic-bezier(0.4,0,0.2,1) 0.2s forwards;
}
.chichat-splash .line-inner {
  stroke-dasharray: 2000; stroke-dashoffset: 2000;
  animation: chichat-draw 2.8s cubic-bezier(0.4,0,0.2,1) 0.5s forwards;
}
@keyframes chichat-draw { to { stroke-dashoffset: 0; } }
.chichat-splash .brand {
  position: absolute; z-index: 3;
  left: 40px; right: 40px; top: 50%;
  transform: translate(0, -55%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 0 24px;
}
.chichat-splash .logo-icon {
  margin-bottom: 14px;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.2s both;
}
.chichat-splash .logo-icon svg {
  width: 64px; height: 64px;
  filter: drop-shadow(0 4px 18px rgba(34,197,94,0.65));
}
.chichat-splash .wordmark {
  font-family: 'DM Sans', sans-serif;
  font-size: 44px; font-weight: 500;
  color: #fff; letter-spacing: 2.5px; line-height: 1.15;
  margin-bottom: 10px;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.35s both;
}
.chichat-splash .wordmark em { color: #22C55E; font-style: normal; }
.chichat-splash .tagline {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px; font-weight: 700;
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
  position: absolute; z-index: 4;
  bottom: calc(50px + 5%); left: 0; right: 0;
  display: flex; justify-content: center;
  animation: chichat-rise 0.8s cubic-bezier(0.22,1,0.36,1) 1.70s both;
}
.chichat-splash .cta {
  width: 55px; height: 28px; border-radius: 14px; border: none;
  background: linear-gradient(120deg, #22C55E 0%, #16A34A 100%);
  color: #fff;
  font-family: 'Syne', sans-serif;
  font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
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

      <svg
        className="frame-svg"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          className="line-outer"
          x="28" y="18"
          width="334" height="764"
          rx="52" ry="52"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.2"
        />
        <rect
          className="line-inner"
          x="40" y="30"
          width="310" height="740"
          rx="44" ry="44"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="0.9"
        />
      </svg>

      <div className="brand">
        <div className="logo-icon">
          <svg viewBox="0 0 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="45" height="40" rx="12" fill="#22C55E" />
            <rect x="9" y="9" width="33" height="28" rx="8" fill="#07090C" />
            <circle cx="18" cy="23" r="3.5" fill="#22C55E" />
            <circle cx="29" cy="23" r="3.5" fill="#22C55E" />
            <circle cx="40" cy="23" r="3.5" fill="#22C55E" />
            <path d="M14 43 L8 54 L26 47" fill="#22C55E" />
            <circle cx="47" cy="11" r="10" fill="#07090C" />
            <circle cx="47" cy="11" r="8" fill="#16A34A" />
            <text
              x="47" y="15.5"
              textAnchor="middle"
              fill="white"
              fontFamily="Syne,sans-serif"
              fontSize="10"
              fontWeight="800"
            >
              C
            </text>
          </svg>
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
  );
}
