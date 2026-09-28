import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { STAGES } from "../api/api.js";

// Live view of the assessment pipeline while the job runs.
const JobProgress = ({ job, ruleMode, narrative }) => {
  if (!job) return null;
  const stages = STAGES.filter(([key]) => (key !== "deriving_rules" || ruleMode !== "builtin") && (key !== "explaining" || narrative));
  const current = stages.findIndex(([key]) => key === job.stage);

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-8">
      <h4 className="text-sm font-bold text-indigo-400 mb-4">Assessment in progress</h4>
      <ol className="space-y-3">
        {stages.map(([key, label], i) => {
          const done = job.status === "completed" || (current >= 0 && i < current);
          const active = i === current && job.status !== "completed";
          return (
            <li key={key} className={`flex items-center gap-3 text-sm ${done ? "text-slate-300" : active ? "text-white" : "text-slate-600"}`}>
              {done ? <CheckCircle2 className="size-4 text-emerald-400" /> : active ? <Loader2 className="size-4 animate-spin text-indigo-400" /> : <Circle className="size-4" />}
              {label}
              {job.timings_ms?.[key] != null && <span className="ml-auto font-mono text-xs text-slate-500">{job.timings_ms[key]} ms</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default JobProgress;
