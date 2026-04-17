import { useEffect, useState } from "react";

// In Lovable: place all splash-1.jpg ... splash-6.jpg inside /public/assets/splash/
// Then these paths resolve automatically
const IMAGES = [
  "/assets/splash/splash-1.jpg",
  "/assets/splash/splash-2.jpg",
  "/assets/splash/splash-3.jpg",
  "/assets/splash/splash-4.jpg",
  "/assets/splash/splash-5.jpg",
  "/assets/splash/splash-6.jpg",
];

function ChichatLogo() {
  return (
    <svg width="52" height="52" viewBox="0 0 58 58" fill="none"
      style={{ filter: "drop-shadow(0 4px 20px rgba(34,197,94,0.65))" }}>
      <rect x="3" y="3" width="45" height="40" rx="12" fill="#22C55E"/>
      <rect x="9" y="9" width="33" height="28" rx="8" fill="#07090C"/>
      <circle cx="18" cy="23" r="3.5" fill="#22C55E"/>
      <circle cx="29" cy="23" r="3.5" fill="#22C55E"/>
      <circle cx="40" cy="23" r="3.5" fill="#22C55E"/>
      <path d="M14 43 L8 54 L26 47" fill="#22C55E"/>
      <circle cx="47" cy="11" r="10" fill="#07090C"/>
      <circle cx="47" cy="11" r="8" fill="#16A34A"/>
      <text x="47" y="15.5" textAnchor="middle" fill="white"
        fontFamily="sans-serif" fontSize="10" fontWeight="800">C</text>
    </svg>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <div style={{
      height: 4,
      width: active ? 18 : 4,
      borderRadius: 2,
      background: active ? "#22C55E" : "rgba(255,255,255,0.22)",
      transition: "all 0.5s ease",
    }} />
  );
}

interface Props { onGetStarted?: () => void; }

export default function SplashScreen({ onGetStarted }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % IMAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const translateX = -(activeIndex * (100 / IMAGES.length));

  const enter = (delay: string) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0px)" : "translateY(20px)",
    transition: `opacity 0.8s ease ${delay}, transform 0.8s ease ${delay}`,
  });

  return (
    <div style={{
      position: "relative", width: "100%", height: "100vh",
      overflow: "hidden", background: "#07090C",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* LAYER 0 — Carousel full bleed */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}>
        <div style={{
          display: "flex", height: "100%",
          width: `${IMAGES.length * 100}%`,
          transform: `translateX(${translateX}%)`,
          transition: "transform 1.2s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {IMAGES.map((src, i) => (
            <img key={i} src={src} alt="" style={{
              width: `${100 / IMAGES.length}%`, height: "100%",
              objectFit: "cover", objectPosition: "center 8%",
              flexShrink: 0, opacity: 0.42,
            }} />
          ))}
        </div>
      </div>

      {/* LAYER 1 — Tint */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "linear-gradient(to bottom,rgba(7,9,12,0.45) 0%,rgba(7,9,12,0.15) 30%,rgba(7,9,12,0.15) 55%,rgba(7,9,12,0.78) 78%,rgba(7,9,12,0.97) 100%)",
      }} />

      {/* LAYER 2 — Two thin SVG frame lines */}
      <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet"
        style={{ position:"absolute",inset:0,zIndex:2,width:"100%",height:"100%",pointerEvents:"none" }}>
        <rect x="28" y="18" width="334" height="764" rx="52" ry="52"
          fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2"
          strokeDasharray="2200" strokeDashoffset={visible ? 0 : 2200}
          style={{ transition: "stroke-dashoffset 2.8s cubic-bezier(0.4,0,0.2,1) 0.2s" }} />
        <rect x="40" y="30" width="310" height="740" rx="44" ry="44"
          fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.9"
          strokeDasharray="2000" strokeDashoffset={visible ? 0 : 2000}
          style={{ transition: "stroke-dashoffset 2.8s cubic-bezier(0.4,0,0.2,1) 0.5s" }} />
      </svg>

      {/* LAYER 3 — Logo + Wordmark + Tagline */}
      <div style={{
        position: "absolute", zIndex: 3,
        top: "50%", left: 0, right: 0,
        transform: visible ? "translateY(-8%)" : "translateY(calc(-8% + 20px))",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.8s ease 1.2s, transform 0.8s ease 1.2s",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "0 40px",
      }}>
        <div style={{ marginBottom: 12 }}><ChichatLogo /></div>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontSize: 40, fontWeight: 800,
          color: "#fff", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 6,
        }}>
          Chi<span style={{ color: "#22C55E" }}>chat</span>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.38)",
          letterSpacing: "0.06em", textAlign: "center",
          textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.18)",
          textUnderlineOffset: "3px",
        }}>
          experience the possibilities
        </div>
      </div>

      {/* LAYER 4 — Dots */}
      <div style={{
        position: "absolute", zIndex: 3,
        bottom: 116, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 7,
        ...enter("1.6s"),
      }}>
        {IMAGES.map((_, i) => <Dot key={i} active={i === activeIndex} />)}
      </div>

      {/* LAYER 5 — CTA */}
      <div style={{
        position: "absolute", zIndex: 4,
        bottom: 36, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        ...enter("1.7s"),
      }}>
        <button onClick={onGetStarted} style={{
          width: 220, height: 50, borderRadius: 25, border: "none",
          background: "linear-gradient(120deg, #22C55E 0%, #16A34A 100%)",
          color: "#fff", fontFamily: "'Syne', sans-serif",
          fontSize: 15, fontWeight: 700, letterSpacing: "0.05em",
          cursor: "pointer",
          boxShadow: "0 8px 28px rgba(34,197,94,0.38), inset 0 1px 0 rgba(255,255,255,0.18)",
        }}>
          Get Started
        </button>
      </div>

    </div>
  );
}
