import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getActiveJob, resumeAssessment } from "../api/api.js";

/**
 * On page load, continues an assessment that was still running when the page was reloaded or
 * left. Progress is fed to the same `setJob` the page uses for a fresh run, so the UI is identical.
 * Returns the name of the resumed job (for a banner) or null.
 */
export default function useResumeAssessment(kind, { setLoading, setJob, onFinished }) {
  const [resumedName, setResumedName] = useState(() => getActiveJob(kind)?.name ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!getActiveJob(kind)) { setResumedName(null); return; }
    setLoading(true);
    resumeAssessment(kind, (job) => !cancelled && setJob(job))
      .then((finished) => { if (!cancelled && finished) onFinished(finished); })
      .catch((err) => !cancelled && toast.error(`Assessment failed: ${err.message}`))
      .finally(() => { if (!cancelled) { setLoading(false); setResumedName(null); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return resumedName;
}
