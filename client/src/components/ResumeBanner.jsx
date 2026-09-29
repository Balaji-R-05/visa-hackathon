import { Loader2 } from "lucide-react";

export default function ResumeBanner({ name }) {
  if (!name) return null;
  return (
    <div className="mb-8 flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-3.5 text-sm text-indigo-100">
      <Loader2 className="size-4 animate-spin shrink-0" />
      <span>Reconnected to the assessment of <b className="text-white">{name}</b> that was still running. You will be taken to the result when it finishes.</span>
    </div>
  );
}
