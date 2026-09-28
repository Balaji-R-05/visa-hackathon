import { Database, Lock, ShieldCheck, Link2, Check } from "lucide-react";

const DIMENSIONS = [
    ["Completeness", 96], ["Validity", 91], ["Accuracy", 88], ["Consistency", 93],
    ["Uniqueness", 99], ["Timeliness", 84], ["Integrity", 95],
];

const Shell = ({ children }) => (
    <div className="absolute inset-0 bg-gradient-to-br from-[#160f3a] via-[#0c0a1f] to-black flex items-start justify-center px-8 pt-10">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-indigo-600/25 blur-[90px]" />
        <div className="relative w-full max-w-md">{children}</div>
    </div>
);

export function ProfilingArt() {
    return (
        <Shell>
            <div className="flex items-center justify-between gap-3">
                <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-300 font-medium"><Database className="size-4 text-indigo-300" /> data-plane</div>
                    <div className="mt-3 space-y-1.5">
                        {[70, 90, 55, 80].map((w, i) => <div key={i} className="h-2 rounded bg-slate-600/50" style={{ width: `${w}%` }} />)}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300"><Lock className="size-3" /> raw rows stay here</div>
                </div>
                <div className="text-indigo-400 text-xl">→</div>
                <div className="flex-1 space-y-2 text-[11px] font-mono">
                    {["null_ratio: 0.02", "mask: AAAAA9999A", "distinct: 1,204", "pii: card_no ✕"].map((t) => (
                        <div key={t} className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-indigo-100">{t}</div>
                    ))}
                </div>
            </div>
        </Shell>
    );
}

export function ScoringArt() {
    return (
        <Shell>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-end justify-between mb-3">
                    <span className="text-xs text-slate-400">Composite DQS</span>
                    <span className="text-2xl font-semibold text-white">92.1<span className="text-xs text-slate-400"> / 100</span></span>
                </div>
                <div className="space-y-1.5">
                    {DIMENSIONS.map(([name, v]) => (
                        <div key={name} className="flex items-center gap-3 text-[11px] text-slate-300">
                            <span className="w-24 shrink-0">{name}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${v}%` }} /></div>
                            <span className="w-6 text-right text-slate-400">{v}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Shell>
    );
}

export function AuditArt() {
    return (
        <Shell>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-[11px]">
                <div className="flex items-center gap-2 text-emerald-300 font-medium"><ShieldCheck className="size-4" /> Every number in the narrative verified</div>
                <div className="mt-2 text-slate-300 leading-relaxed">"Completeness is <span className="text-white font-semibold">96</span>, driven by 4.1% missing <span className="font-mono text-indigo-200">merchant_id</span>."</div>
            </div>
            <div className="mt-4 flex items-center">
                {["#a41f", "#7c02", "#e9b8"].map((h, i) => (
                    <div key={h} className="flex items-center">
                        <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 font-mono text-indigo-100 text-[11px] flex items-center gap-1.5"><Check className="size-3 text-emerald-300" />{h}</div>
                        {i < 2 && <Link2 className="size-4 mx-1 text-indigo-400" />}
                    </div>
                ))}
                <span className="ml-3 text-[11px] text-slate-400">hash chain</span>
            </div>
        </Shell>
    );
}
