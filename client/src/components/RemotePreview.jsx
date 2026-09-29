import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { previewSource } from "../api/api.js";
import { PreviewCard, summarizeRows } from "./DataPreview.jsx";

// Fetches ~10 sample rows from a connected source on request, so users can sanity-check
// the connection and columns before running an assessment.
export default function RemotePreview({ source, payload, ready, disabled }) {
  const [state, setState] = useState(null);

  // Any change to the connection details invalidates the previous sample.
  const key = JSON.stringify(payload);
  useEffect(() => setState(null), [key, source]);

  const load = async () => {
    setState({ loading: true });
    try {
      const data = await previewSource(source, payload);
      setState({ rows: data.rows, columns: data.columns, fetched: data.fetched });
    } catch (err) {
      setState(null);
      toast.error(`Preview failed: ${err.message}`);
    }
  };

  const summary = state?.rows?.length ? summarizeRows(state.columns, state.rows) : null;

  return (
    <>
      <button
        onClick={load}
        disabled={!ready || disabled || state?.loading}
        className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-sm font-semibold text-slate-200 transition"
      >
        {state?.loading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4 text-indigo-400" />}
        Preview sample rows
      </button>
      {state && (
        <PreviewCard
          title="Data preview"
          state={state}
          summary={summary}
          badges={summary ? [`${summary.cols.length} columns`, `first ${summary.data.length} rows`] : []}
          footnote="A sample fetched through the data-plane and shown only in this browser. It is not sent to any LLM or stored."
        />
      )}
    </>
  );
}
