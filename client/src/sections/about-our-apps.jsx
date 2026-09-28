import SectionTitle from "../components/section-title";
import { motion } from "framer-motion";
import { BrainCircuit, Scale, ShieldCheck } from "lucide-react";

export default function AboutOurApps() {
    const sectionData = [
        {
            title: "Seven Quality Dimensions",
            description: "Completeness, validity, accuracy, consistency, uniqueness, timeliness and integrity, each scored with its formula and evidence.",
            icon: BrainCircuit,
            className: "py-10 border-b border-slate-700 md:py-0 md:border-r md:border-b-0 md:px-10"
        },
        {
            title: "Regulatory Compliance",
            description: "Rules derived from retrieved regulations (GDPR, RBI, PCI DSS) for GLOBAL, IN, EU and US jurisdictions, with citations.",
            icon: Scale,
            className: "py-10 border-b border-slate-700 md:py-0 lg:border-r md:border-b-0 md:px-10"
        },
        {
            title: "Privacy-First Architecture",
            description: "Only the data-plane sees rows. Everything downstream works on aggregates, and a local Ollama model can keep the LLM on your machine too.",
            icon: ShieldCheck,
            className: "py-10 border-b border-slate-700 md:py-0 md:border-b-0 md:px-10"
        },
    ];
    return (
        <section className="flex flex-col items-center" id="about">
            <SectionTitle title="Engineered for Trust" description="Assay scores payment datasets with explainable, reproducible metrics and a full audit trail." />
            <div className="relative max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 px-8 md:px-0 mt-18">
                {sectionData.map((data, index) => (
                    <motion.div key={data.title} className={data.className}
                        initial={{ y: 150, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: `${index * 0.15}`, type: "spring", stiffness: 320, damping: 70, mass: 1 }}
                    >
                        <div className="size-11 flex items-center justify-center bg-indigo-600/20 border border-indigo-500/30 rounded-xl">
                            <data.icon className="size-5 text-indigo-300" strokeWidth={1.75} />
                        </div>
                        <div className="mt-5 space-y-2">
                            <h3 className="text-base font-medium text-slate-200">{data.title}</h3>
                            <p className="text-sm text-slate-400">{data.description}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}