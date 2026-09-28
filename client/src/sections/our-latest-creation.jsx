import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import SectionTitle from "../components/section-title";
import { ProfilingArt, ScoringArt, AuditArt } from "../components/panel-art";

export default function OurLatestCreation() {
    const [hoverIndex, setHoverIndex] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const sectionData = [
        {
            title: "Privacy-Preserving Profiling",
            description: "Raw rows never leave the data-plane. Other services only see counts, ratios and format masks, with PII and card data redacted.",
            Art: ProfilingArt,
        },
        {
            title: "Deterministic Scoring",
            description: "Seven quality dimensions and regulation-grounded rules are executed by a rules engine, so identical metadata always gives an identical score.",
            Art: ScoringArt,
        },
        {
            title: "Grounded, Auditable Insights",
            description: "LLM explanations are checked against the engine's numbers, and every assessment is written to a tamper-evident hash-chained log.",
            Art: AuditArt,
        },
    ];

    useEffect(() => {
        if (hoverIndex !== null) return;
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % sectionData.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [hoverIndex, sectionData.length]);

    return (
        <section className="flex flex-col items-center" id="creations">
            <SectionTitle
                title="Built Around Governance"
                description="A deterministic core for the numbers, language models only for the explanations."
            />

            <div className="flex items-stretch gap-4 h-[440px] w-full max-w-5xl mt-18 mx-auto" onMouseLeave={() => setHoverIndex(null)}>
                {sectionData.map((data, index) => {
                    const isActive = (hoverIndex ?? activeIndex) === index;
                    return (
                    <motion.div key={data.title} className="relative min-w-0 rounded-2xl overflow-hidden border border-white/10 bg-[#0c0a1f] cursor-pointer"
                        style={{ flexGrow: isActive ? 6 : 1, flexBasis: 0, transition: "flex-grow 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                        onMouseEnter={() => setHoverIndex(index)}
                        initial={{ y: 150, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: `${index * 0.15}`, type: "spring", stiffness: 320, damping: 70, mass: 1 }}
                    >
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[560px] max-w-none">
                            <data.Art />
                        </div>
                        <div className={`absolute inset-x-0 bottom-0 flex flex-col justify-end p-6 md:p-8 pt-24 text-white bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-500 ${isActive ? "opacity-100 delay-200" : "opacity-0"}`}>
                            <h1 className="text-xl md:text-2xl font-semibold">{data.title}</h1>
                            <p className="text-sm mt-2 text-slate-300 max-w-xl">{data.description}</p>
                        </div>
                        <div className={`absolute top-4 left-4 text-xs font-mono px-2 py-1 rounded-full bg-black/50 border border-white/10 text-slate-300 transition-opacity duration-500 ${isActive ? "opacity-0" : "opacity-100"}`}>0{index + 1}</div>
                    </motion.div>
                    );
                })}
            </div>
        </section>
    );
}
