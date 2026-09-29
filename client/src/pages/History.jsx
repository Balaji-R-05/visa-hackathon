import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { History as HistoryIcon, Trash2, ChevronRight, FileSpreadsheet } from "lucide-react";
import { clearHistory, loadHistory, removeFromHistory } from "../utils/history";

const History = ({ onOpen }) => {
  const [items, setItems] = useState(loadHistory);
  const navigate = useNavigate();

  const open = (entry) => {
    onOpen(entry.report);
    navigate("/result");
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30">
      <div className="px-6 md:px-16 lg:px-24 xl:px-32 pt-12 pb-20">
        <motion.div className="max-w-4xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium mb-3"><HistoryIcon className="size-4" /> Saved in this browser</div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Report history</h1>
              <p className="text-slate-400 mt-3">Your last 10 assessments, kept locally so you can reopen a report without re-running it.</p>
            </div>
            {items.length > 0 && (
              <button onClick={() => setItems(clearHistory())} className="text-xs font-bold text-slate-400 hover:text-red-400 transition">Clear all</button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-12 text-center">
              <p className="text-slate-300 font-medium">No saved reports yet.</p>
              <p className="text-slate-500 text-sm mt-2">Run an audit and it will appear here.</p>
              <button onClick={() => navigate("/csv")} className="mt-6 px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-bold">Start an audit</button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((e) => (
                <div key={e.id} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-indigo-500/30 transition px-5 py-4">
                  <span className="size-11 shrink-0 flex items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
                    <FileSpreadsheet className="size-5 text-indigo-300" strokeWidth={1.75} />
                  </span>
                  <button onClick={() => open(e)} className="flex-1 min-w-0 text-left">
                    <span className="block font-semibold text-slate-100 truncate">{e.name}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {e.source && `${e.source} · `}{new Date(e.savedAt).toLocaleString()}
                    </span>
                  </button>
                  {e.score !== null && (
                    <span className="text-right">
                      <span className="block font-mono text-lg text-indigo-300">{(e.score * 100).toFixed(1)}%</span>
                      {e.grade && <span className="block text-[10px] text-slate-500">{e.grade}</span>}
                    </span>
                  )}
                  <button onClick={() => open(e)} aria-label="Open report" className="text-slate-500 group-hover:text-white transition"><ChevronRight className="size-5" /></button>
                  <button onClick={() => setItems(removeFromHistory(e.id))} aria-label="Delete report" className="text-slate-600 hover:text-red-400 transition"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default History;
