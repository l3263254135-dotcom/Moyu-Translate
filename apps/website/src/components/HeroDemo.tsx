import { Badge, MoyuMark } from "@moyu/ui";
import { MousePointer2, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

const words = [
  { word: "emergent", pos: "adj.", meaning: "涌现的；随规模突然出现的", tag: "TOEFL", uk: "ɪˈmɜːdʒənt", us: "ɪˈmɝːdʒənt" },
  { word: "serendipity", pos: "n.", meaning: "意外发现；机缘巧合", tag: "GRE", uk: "ˌserənˈdɪpəti", us: "ˌserənˈdɪpəti" },
  { word: "immersive", pos: "adj.", meaning: "沉浸式的；令人投入的", tag: "IELTS", uk: "ɪˈmɜːsɪv", us: "ɪˈmɝːsɪv" },
];

export function HeroDemo({ lang }: { lang: "zh" | "en" }) {
  const [index, setIndex] = useState(0);
  const current = words[index]!;
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % words.length), 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hero-demo" aria-label={lang === "zh" ? "悬停翻译交互演示" : "Interactive hover translation demo"}>
      <div className="hero-demo__bar">
        <span className="hero-demo__dots"><i /><i /><i /></span>
        <span>attention-is-all-you-need.pdf</span>
        <span className="hero-demo__local">LOCAL</span>
      </div>
      <div className="hero-demo__paper">
        <p>
          Scaling laws alone do not explain these results. The model exhibits{" "}
          <button type="button" className="hero-demo__word" onClick={() => setIndex((index + 1) % words.length)}>
            {current.word}
            <MousePointer2 aria-hidden="true" />
          </button>{" "}
          capabilities that appear abruptly beyond a certain scale.
        </p>
        <p className="is-muted">We evaluate retrieval, reasoning and multilingual understanding across twelve benchmarks.</p>
        <div className="demo-result">
          <div className="demo-result__brand"><MoyuMark /><span>Moyu Translate</span></div>
          <div className="demo-result__word"><strong>{current.word}</strong><button type="button" aria-label="Pronounce US"><Volume2 /></button></div>
          <div className="demo-result__pronunciations">
            <span><b>UK</b> /{current.uk}/ <Volume2 aria-hidden="true" /></span>
            <span><b>US</b> /{current.us}/ <Volume2 aria-hidden="true" /></span>
          </div>
          <div className="demo-result__meaning"><b>{current.pos}</b><span>{current.meaning}</span></div>
          <Badge>{current.tag}</Badge>
        </div>
        <div className="hero-demo__key"><kbd>{lang === "zh" ? "⌥ Option / Alt" : "Option / Alt"}</kbd><span>{lang === "zh" ? "无需选中" : "No selection needed"}</span></div>
      </div>
    </div>
  );
}
