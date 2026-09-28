import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, AlertTriangle, ShieldAlert, Activity, ArrowLeft, ListChecks, ChevronRight, ChevronDown,
  Download, Scale, Lock, BookOpen, CheckCircle2, XCircle,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { exportReport, verifyAuditLog } from "../api/api";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const SEVERITY_STYLE = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};
const card = "bg-white/[0.03] border border-white/10 rounded-[2rem] p-8";

const Badge = ({ children, className = "" }) => (
  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${className}`}>{children}</span>
);

const DimensionCard = ({ d }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-3xl border p-6 ${d.applicable ? "bg-white/[0.02] border-white/10" : "bg-white/[0.01] border-white/5 opacity-70"}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="font-bold text-slate-200">{d.dimension}</h4>
        <span className="font-mono text-lg text-indigo-300">{d.applicable ? pct(d.score) : "N/A"}</span>
      </div>
      {d.applicable && (
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-3">
          <motion.div initial={{ width: 0 }} animate={{ width: `${d.score * 100}%` }} transition={{ duration: 0.8 }} className="h-full bg-indigo-500" />
        </div>
      )}
      <p className="text-xs text-slate-500 mb-2">
        Weight {d.applicable ? d.weight.toFixed(2) : "0 (not scored)"} · {d.formula}
      </p>
      <p className="text-sm text-slate-300 leading-relaxed">{d.narrative || d.explanation}</p>
      {d.narrative && <p className="text-xs text-slate-500 mt-2">{d.explanation}</p>}
      {d.evidence?.length > 0 && (
        <button onClick={() => setOpen(!open)} className="mt-3 text-xs text-indigo-400 flex items-center gap-1">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Evidence ({d.evidence.length} checks)
        </button>
      )}
      {open && (
        <table className="w-full mt-3 text-xs">
          <tbody>
            {d.evidence.map((e, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-1.5 pr-2 text-slate-300">{e.column}</td>
                <td className="py-1.5 pr-2 text-slate-500">{e.check}</td>
                <td className={`py-1.5 text-right font-mono ${e.violations ? "text-amber-300" : "text-slate-500"}`}>
                  {e.violations.toLocaleString()}/{e.checked.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Review LLM-derived rules and download the approved ones as a rule set that later
// assessments enforce as-is (Assessment options -> Approved rule set).
const RuleReview = ({ rules, llmRules }) => {
  const [selected, setSelected] = useState(() => new Set(llmRules.filter((x) => !x.held && !x.approved).map((x) => x.id)));
  if (!llmRules.length) return null;
  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const download = () => {
    const keep = ["id", "source", "dimension", "type", "column", "params", "description", "rationale", "regulation", "citations"];
    const ruleSet = {
      jurisdiction: rules.jurisdiction,
      approved_at: new Date().toISOString(),
      derived_by: rules.derivation?.model ?? null,
      optional_columns: rules.optional_columns || [],
      rules: llmRules.filter((x) => selected.has(x.id)).map((x) => Object.fromEntries(keep.map((k) => [k, x[k]]))),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(ruleSet, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `approved_rules_${rules.jurisdiction || "GLOBAL"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-3">
      <p className="text-xs text-slate-400 mb-2">Review LLM-derived rules. Held rules failed most of the data and were not scored.</p>
      <ul className="space-y-2 text-xs text-slate-300 max-h-72 overflow-y-auto pr-1">
        {llmRules.map((x) => (
          <li key={x.id} className="flex gap-2">
            <input type="checkbox" className="mt-0.5 accent-indigo-500" checked={selected.has(x.id)} onChange={() => toggle(x.id)} />
            <span>
              <span className="text-slate-500">{x.dimension} · </span>{x.description || `${x.type} on ${x.column}`}
              <span className="font-mono text-slate-500"> ({x.violations?.toLocaleString()}/{x.checked?.toLocaleString()})</span>
              {x.regulation && <span className="text-indigo-300"> [{x.regulation}]</span>}
              {x.approved && <span className="text-emerald-400"> approved</span>}
              {x.held && <span className="block text-amber-300/80">Held: {x.hold_reason}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button onClick={download} disabled={!selected.size} className="mt-3 text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:text-slate-600">
        Download approved rule set ({selected.size})
      </button>
    </div>
  );
};

const Result = ({ result }) => {
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);

  if (!result?.dimensions) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4">
        <ShieldAlert className="size-16 text-indigo-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">No Analysis Results Found</h2>
        <p className="text-slate-400 mb-6 text-center max-w-md">Please upload a dataset to generate a quality audit report.</p>
        <button onClick={() => navigate("/")} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full font-medium transition-colors">
          Return Home
        </button>
      </div>
    );
  }

  const r = result;
  const actions = [...(r.remediation_actions || [])].sort((a, b) => a.priority - b.priority || (b.expected_gain || 0) - (a.expected_gain || 0));
  const findings = Object.fromEntries((r.findings || []).map((f) => [f.id, f]));
  const rules = r.rules || {};
  const llmRules = [
    ...(rules.applied || []).filter((x) => x.source === "llm").map((x) => ({ ...x, held: false })),
    ...(rules.held || []).map((x) => ({ ...x, held: true })),
  ];
  const gov = r.governance || {};

  const handleDownloadReport = async () => {
    try {
      const markdown = await exportReport(r);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Assay_Report_${(r.dataset?.dataset_name || "dataset").replace(/[^\w.-]+/g, "_")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Report export failed: ${err.message}`);
    }
  };

  const handleVerify = async () => {
    try {
      setAudit(await verifyAuditLog());
    } catch (err) {
      toast.error(`Audit verification failed: ${err.message}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30">
      <div className="relative z-10 px-6 md:px-16 lg:px-24 xl:px-32 pt-12 pb-20">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="size-4" /> Back to Audit
            </button>
            <div className="flex items-center gap-3">
              <button onClick={handleDownloadReport} className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-2">
                <Download className="size-3.5 text-indigo-400" /> Download Report
              </button>
              <button onClick={() => navigate("/chat")} className="px-6 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-bold flex items-center gap-2">
                Chat with AI <ChevronRight className="size-3" />
              </button>
            </div>
          </div>

          {/* Headline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`${card} lg:col-span-1`}>
              <span className="text-indigo-400 text-sm font-medium flex items-center gap-2 mb-2">
                <Activity className="size-4" /> Composite Data Quality Score
              </span>
              <h2 className="text-6xl font-bold">{pct(r.composite_dqs)}</h2>
              <p className="text-slate-300 mt-2 font-bold">Grade {r.grade}</p>
              <p className="text-slate-500 text-xs mt-3">
                {r.dataset?.dataset_name} · {r.dataset?.row_count?.toLocaleString()} rows · {r.dataset?.column_count} columns · {r.scoring_profile} weights
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge className="border-emerald-500/30 text-emerald-300">Deterministic score</Badge>
                <Badge className="border-indigo-500/30 text-indigo-300">
                  Text: {r.narrative_source === "llm" ? r.narrative_model : "template"}
                </Badge>
                {r.grounding?.score != null && (
                  <Badge className={r.grounding.score === 1 ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}>
                    {r.grounding.verified}/{r.grounding.numeric_claims} numbers verified
                  </Badge>
                )}
              </div>
            </div>
            <div className={`${card} lg:col-span-2`}>
              <span className="text-indigo-400 text-sm font-medium flex items-center gap-2 mb-3">
                <BookOpen className="size-4" /> Summary
              </span>
              <p className="text-slate-200 leading-relaxed">{r.executive_summary}</p>
              {r.grounding?.unverified_claims?.length > 0 && (
                <p className="text-xs text-amber-300/80 mt-4">Unverified numbers in the explanation: {r.grounding.unverified_claims.join(", ")}</p>
              )}
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <h3 className="text-xl font-bold flex items-center gap-3 mb-4">
              <BarChart3 className="size-5 text-indigo-400" /> Dimension scores
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {r.dimensions.map((d) => <DimensionCard key={d.dimension} d={d} />)}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Improvement pathway */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <ListChecks className="size-5 text-emerald-400" /> Improvement pathway
              </h3>
              {actions.length === 0 && <p className={`${card} text-slate-400`}>No findings: every assessed check passed.</p>}
              {actions.map((a, i) => {
                const f = findings[a.finding_ids?.[0]];
                return (
                  <div key={i} className="bg-white/[0.02] border border-white/10 rounded-3xl p-6">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h4 className="font-bold text-slate-200">
                        <span className="text-slate-500 mr-2">P{a.priority}</span>{a.action}
                      </h4>
                      <Badge className={SEVERITY_STYLE[a.severity]}>{a.severity}</Badge>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{a.description}</p>
                    {f && (
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-300">{f.columns.join(", ")}</span>
                        <span className="px-2 py-1">{f.dimension}</span>
                        <span className="px-2 py-1 font-mono">{f.violations.toLocaleString()}/{f.checked.toLocaleString()} ({pct(f.violation_ratio)})</span>
                        {a.expected_gain > 0 && <span className="px-2 py-1 text-emerald-400">+{(a.expected_gain * 100).toFixed(2)} DQS points if fixed</span>}
                        {f.regulatory_context && <span className="px-2 py-1 text-slate-400">{f.regulatory_context}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-6">
              {/* Compliance */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-[2rem] p-8">
                <span className="text-red-400 text-sm font-medium flex items-center gap-2 mb-4">
                  <ShieldAlert className="size-4" /> Compliance risks
                </span>
                {r.regulatory_compliance_risks?.length ? (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {r.regulatory_compliance_risks.map((risk, i) => <li key={i}>{risk}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">No regulatory risks identified for this dataset.</p>
                )}
              </div>

              {/* Rules */}
              <div className={card}>
                <span className="text-indigo-400 text-sm font-medium flex items-center gap-2 mb-4">
                  <Scale className="size-4" /> Rules ({rules.jurisdiction}, {rules.rule_mode})
                </span>
                <p className="text-xs text-slate-400 mb-3">
                  Applied: {Object.entries(rules.applied_by_source || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}
                  {rules.derivation?.model && ` · derived by ${rules.derivation.model} in ${Math.round(rules.derivation.latency_ms)} ms`}
                </p>
                <RuleReview rules={rules} llmRules={llmRules} />
                {rules.rejected?.length > 0 && (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">{rules.rejected.length} proposed rule(s) rejected</summary>
                    <ul className="mt-2 space-y-1">
                      {rules.rejected.map((x, i) => <li key={i}>{x.rule?.type} on {x.rule?.column}: {x.reason}</li>)}
                    </ul>
                  </details>
                )}
              </div>

              {/* Governance */}
              <div className={card}>
                <span className="text-indigo-400 text-sm font-medium flex items-center gap-2 mb-4">
                  <Lock className="size-4" /> Governance
                </span>
                <ul className="space-y-2 text-xs text-slate-400">
                  <li>Raw values in metadata: <b className="text-slate-200">{String(gov.raw_values_included ?? false)}</b></li>
                  <li>Value-level fields suppressed: <b className="text-slate-200">{gov.suppressed_fields?.length ?? 0}</b></li>
                  <li>LLM: <b className="text-slate-200">{gov.llm_provider || "none"}</b> {gov.llm_local === false ? "(hosted)" : gov.llm_local ? "(local)" : ""}</li>
                  <li className="break-all">Fingerprint: <span className="font-mono">{r.metadata_fingerprint?.slice(0, 16)}…</span></li>
                  {r.audit_id && <li className="break-all">Audit id: <span className="font-mono">{r.audit_id}</span></li>}
                </ul>
                <button onClick={handleVerify} className="mt-4 text-xs font-bold text-indigo-400 hover:text-indigo-300">Verify audit log integrity</button>
                {audit && (
                  <p className={`mt-2 text-xs flex items-center gap-2 ${audit.valid ? "text-emerald-400" : "text-red-400"}`}>
                    {audit.valid ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {audit.valid ? `Hash chain intact (${audit.entries} entries)` : `Tampering detected at entry ${audit.first_invalid_line}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {r.data_quality_issues?.some((i) => i.affected_columns?.length) && (
            <p className="text-xs text-slate-600 flex items-center gap-2">
              <AlertTriangle className="size-3" /> Scores are computed by a deterministic engine from privacy-preserving metadata; explanations are generated and numerically verified against it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Result;
