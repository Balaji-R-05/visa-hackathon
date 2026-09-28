import { ShieldCheck } from "lucide-react";

const DIMENSIONS = [
    ["Completeness", 96], ["Validity", 91], ["Accuracy", 88], ["Consistency", 93],
    ["Uniqueness", 99], ["Timeliness", 84], ["Integrity", 95],
];

export default function ReportPreview() {
    return (
        <div className="w-full rounded-[15px] border border-white/10 bg-gradient-to-br from-[#12102b] to-black p-6 md:p-8 shadow-2xl shadow-indigo-900/30 text-left">
            <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono">payments_q3.csv · jurisdiction: IN · rules: hybrid</span>
                <span className="px-2 py-0.5 rounded-full border border-white/10">Sample report</span>
            </div>
            <div className="mt-6 grid md:grid-cols-[220px_1fr] gap-8">
                <div className="flex flex-col items-center justify-center rounded-xl bg-white/5 border border-white/10 p-6">
                    <span className="text-xs text-slate-400">Composite Data Quality Score</span>
                    <span className="text-6xl font-bold mt-2 bg-gradient-to-b from-white to-indigo-300 bg-clip-text text-transparent">92.1</span>
                    <span className="mt-2 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><ShieldCheck className="size-3.5" /> Grade A</span>
                </div>
                <div className="space-y-2.5 self-center">
                    {DIMENSIONS.map(([name, v]) => (
                        <div key={name} className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-24 shrink-0">{name}</span>
                            <div className="flex-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${v}%` }} /></div>
                            <span className="w-7 text-right text-slate-400">{v}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
