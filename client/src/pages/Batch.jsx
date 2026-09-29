import { useNavigate } from "react-router";
import { Layers } from "lucide-react";
import { resetBatchRun, useBatchRun } from "../utils/batchStore";
import BatchProgress from "../components/BatchProgress";

const Batch = ({ onOpen }) => {
  const run = useBatchRun();
  const navigate = useNavigate();
  const running = ["running", "stopping", "recovering"].includes(run.status);

  return (
    <div className="relative min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30">
      <div className="px-6 md:px-16 lg:px-24 xl:px-32 pt-12 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium mb-3"><Layers className="size-4" /> Batch run</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">Batch progress</h1>

          {run.status === "idle" ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-12 text-center">
              <p className="text-slate-300 font-medium">No batch run in progress.</p>
              <p className="text-slate-500 text-sm mt-2">Upload a large CSV and choose batch processing.</p>
              <button onClick={() => navigate("/csv")} className="mt-6 px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-bold">Go to CSV audit</button>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-indigo-500/20 bg-indigo-500/[0.04] p-6 md:p-8">
              <BatchProgress
                run={run}
                onOpen={(report) => onOpen(report)}
                resumeSlot={<button onClick={() => navigate("/csv")} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm transition">Go to CSV page to resume</button>}
              />
              {!running && (
                <button onClick={resetBatchRun} className="mt-6 text-xs text-slate-500 hover:text-white transition">Clear this run</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Batch;
