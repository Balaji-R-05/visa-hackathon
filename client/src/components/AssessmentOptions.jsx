import { useState } from "react";
import { Globe, Cpu, MessageSquareText, Clock, FileCheck2, X } from "lucide-react";
import { toast } from "react-toastify";
import { JURISDICTIONS, RULE_MODES } from "../api/api.js";

export const DEFAULT_OPTIONS = { jurisdiction: "GLOBAL", ruleMode: "hybrid", narrative: true, freshnessDays: 365, approvedRules: null };

const AssessmentOptions = ({ options, onChange, disabled }) => {
  const [ruleFile, setRuleFile] = useState("");
  const set = (key) => (value) => onChange({ ...options, [key]: value });
  const mode = RULE_MODES.find((m) => m.value === options.ruleMode);

  const loadRuleSet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.rules)) throw new Error("missing a rules list");
      // An approved rule set replaces LLM derivation, so it needs an LLM-capable mode.
      onChange({ ...options, approvedRules: parsed, ruleMode: options.ruleMode === "builtin" ? "hybrid" : options.ruleMode });
      setRuleFile(`${file.name} (${parsed.rules.length} rules)`);
    } catch (err) {
      toast.error(`Not a valid approved rule set: ${err.message}`);
    }
    e.target.value = "";
  };

  const clearRuleSet = () => {
    onChange({ ...options, approvedRules: null });
    setRuleFile("");
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-8 space-y-6">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-indigo-400">
          <Globe className="size-4" /> Jurisdiction
        </label>
        <select
          value={options.jurisdiction}
          disabled={disabled}
          onChange={(e) => set("jurisdiction")(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          {JURISDICTIONS.map((j) => (
            <option key={j.value} value={j.value} className="bg-[#0b0b0f]">{j.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-indigo-400">
          <Cpu className="size-4" /> Rules
        </label>
        <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
          {RULE_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={disabled || (options.approvedRules && m.value === "builtin")}
              onClick={() => set("ruleMode")(m.value)}
              className={`px-2 py-2 rounded-lg text-xs font-bold transition-all ${options.ruleMode === m.value ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          {options.approvedRules ? "Your approved rule set is enforced as-is; no new rules are derived." : mode?.hint}
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-indigo-400">
          <FileCheck2 className="size-4" /> Approved rule set (optional)
        </label>
        {ruleFile ? (
          <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300">
            <span className="truncate">{ruleFile}</span>
            <button type="button" onClick={clearRuleSet} disabled={disabled} className="text-slate-500 hover:text-red-400">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label className="block cursor-pointer bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-slate-200">
            Upload a rule set downloaded from a previous report
            <input type="file" accept=".json" className="hidden" disabled={disabled} onChange={loadRuleSet} />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-indigo-400">
          <Clock className="size-4" /> Freshness window (days)
        </label>
        <input
          type="number"
          min={0}
          max={36500}
          value={options.freshnessDays}
          disabled={disabled}
          onChange={(e) => set("freshnessDays")(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <p className="text-xs text-slate-500">Records older than this count against timeliness. Use 0 for archives.</p>
      </div>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-bold text-indigo-400">
          <MessageSquareText className="size-4" /> Plain-language explanations
        </span>
        <input
          type="checkbox"
          checked={options.narrative}
          disabled={disabled}
          onChange={(e) => set("narrative")(e.target.checked)}
          className="size-4 accent-indigo-500"
        />
      </label>
    </div>
  );
};

export default AssessmentOptions;
