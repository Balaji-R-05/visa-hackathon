import SectionTitle from "../components/section-title";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { ArrowRight, FileSpreadsheet, Database, Leaf, Globe } from "lucide-react";

const sources = [
    { icon: FileSpreadsheet, label: "CSV files", detail: "Upload up to 50 MB", href: "/csv" },
    { icon: Database, label: "PostgreSQL", detail: "Connect with a connection string", href: "/table" },
    { icon: Leaf, label: "MongoDB", detail: "Collections sampled for profiling", href: "/table" },
    { icon: Globe, label: "REST APIs", detail: "SSRF-guarded JSON endpoints", href: "/api" },
];

export default function TrustedCompanies() {
    const navigate = useNavigate();
    return (
        <section className="flex flex-col items-center">
            <SectionTitle title="Bring Your Own Data" description="Assay profiles the source where it lives and scores it against the same seven dimensions." />
            <motion.div className="relative max-w-5xl py-14 md:py-20 mt-18 md:w-full overflow-hidden mx-2 md:mx-auto border border-indigo-900 flex flex-col md:flex-row items-center justify-around gap-10 bg-gradient-to-br from-[#401B98]/5 to-[#180027]/10 rounded-3xl px-8"
                initial={{ y: 150, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 320, damping: 70, mass: 1 }}
            >
                <div className="absolute pointer-events-none top-10 -z-1 left-20 size-64 bg-gradient-to-br from-[#536DFF] to-[#4F39F6]/60 blur-[180px]"></div>
                <div className="absolute pointer-events-none bottom-10 -z-1 right-20 size-64 bg-gradient-to-br from-[#536DFF] to-[#4F39F6]/60 blur-[180px]"></div>
                <div className="flex flex-col items-center md:items-start max-md:text-center">
                    <div className="flex items-center gap-2 rounded-full text-sm p-1 pr-3 text-indigo-300 bg-indigo-200/15">
                        <span className="bg-indigo-600 text-white text-xs px-3.5 py-1 rounded-full">GOVERNED</span>
                        <span>Tamper-evident audit trail</span>
                    </div>
                    <h1 className="text-3xl font-medium max-w-xl mt-5 bg-gradient-to-r from-white to-[#b6abff] text-transparent bg-clip-text">Score once, explain everything.</h1>
                    <p className="text-base text-slate-400 max-w-lg mt-4">
                        Each report carries the formula, the evidence, prioritised fixes and the regulatory clauses behind every score, and each assessment is logged so it can be verified later.
                    </p>
                    <button onClick={() => navigate("/csv")} className="flex items-center gap-2 text-sm px-6 py-2.5 border border-indigo-400 hover:bg-indigo-300/10 active:scale-95 transition rounded-full mt-6">
                        Start an audit
                        <ArrowRight className="size-4" />
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
                    {sources.map(({ icon: Icon, label, detail, href }) => (
                        <button key={label} onClick={() => navigate(href)} className="text-left flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-400/40 transition px-4 py-3.5 min-w-56">
                            <span className="size-10 shrink-0 flex items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30">
                                <Icon className="size-5 text-indigo-300" strokeWidth={1.75} />
                            </span>
                            <span>
                                <span className="block text-sm font-medium text-slate-100">{label}</span>
                                <span className="block text-xs text-slate-400">{detail}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </section>
    );
}
