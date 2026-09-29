import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, X, FileText, ChevronRight } from "lucide-react";
import { toast } from "react-toastify";
import useResumeAssessment from "../hooks/useResumeAssessment.js";
import ResumeBanner from "../components/ResumeBanner.jsx";
import { assessCsv, MAX_UPLOAD_MB } from "../api/api.js";
import { SAMPLE_ANALYSIS_RESULT } from "../api/sampleData.js";
import { useNavigate } from "react-router";
import AssessmentOptions, { DEFAULT_OPTIONS } from "../components/AssessmentOptions.jsx";
import JobProgress from "../components/JobProgress.jsx";
import DataPreview from "../components/DataPreview.jsx";
import BatchPanel from "../components/BatchPanel.jsx";
import BatchProgress from "../components/BatchProgress.jsx";
import { useBatchRun } from "../utils/batchStore.js";

const Csv = ({ onResult }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [job, setJob] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const navigate = useNavigate();
  const batchRun = useBatchRun();
  // A batch run with no matching file selected (e.g. after a reload) is shown here so it is never hidden.
  const orphanRun = batchRun.status !== "idle" && !(file && file.name === batchRun.fileName);
  const resumedName = useResumeAssessment("csv", {
    setLoading,
    setJob,
    onFinished: (finished) => {
      finished.warnings?.forEach((w) => toast.warn(w));
      if (onResult) onResult(finished.report);
      else navigate("/result");
    },
  });
  const acceptFile = (f) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.info(`${f.name} is ${(f.size / 1024 / 1024).toFixed(0)} MB, above the ${MAX_UPLOAD_MB} MB single-upload limit. Use batch processing below.`);
    }
    setFile(f);
    setFileName(f.name);
  };

  const handleFileChange = (e) => {
    acceptFile(e.target.files[0]);
    e.target.value = "";
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith(".csv")) acceptFile(droppedFile);
    else if (droppedFile) toast.error("Only .csv files are supported.");
  };

  const tooLarge = !!file && file.size > MAX_UPLOAD_MB * 1024 * 1024;

  const handleUpload = async () => {
    if (!file || tooLarge) return;
    setLoading(true);
    setJob(null);
    try {
      const finished = await assessCsv(file, options, setJob);
      finished.warnings?.forEach((w) => toast.warn(w));
      if (onResult) onResult(finished.report);
      else navigate("/result");
    } catch (err) {
      toast.error(`Assessment failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTrySample = () => {
    setLoading(true);
    setTimeout(() => {
      if (onResult) onResult(SAMPLE_ANALYSIS_RESULT);
      else navigate("/result");
      setLoading(false);
    }, 600);
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-white font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Background Glow - Fixed SVG Integration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <svg className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[140%] opacity-50" viewBox="0 0 1440 676" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="-92" y="-948" width="1624" height="1624" rx="812" fill="url(#hero-gradient)" />
          <defs>
            <radialGradient id="hero-gradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(90 428 292)scale(812)">
              <stop offset=".63" stopColor="#372AAC" stopOpacity="0" />
              <stop offset="1" stopColor="#372AAC" />
            </radialGradient>
          </defs>
        </svg>
      </div>
            
      <div className="relative z-10 px-6 md:px-16 lg:px-24 xl:px-32 pt-12 pb-20">
        <motion.div 
          className="max-w-6xl mx-auto" 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
        >
          
          {/* Hero Header */}
          <div className="text-center mb-16">
            
            <motion.h1 
              className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50"
            >
              Is your data <span className="text-indigo-500 italic">ready</span>?
            </motion.h1>
            
            <motion.p 
              className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            >
              Upload your payment datasets for automated integrity checks, anomaly detection, and regulatory compliance scoring.
            </motion.p>
            
            {!fileName && (
              <motion.button
                onClick={handleTrySample}
                className="mt-8 text-xs font-bold text-indigo-400/60 hover:text-indigo-400 uppercase tracking-widest flex items-center gap-2 mx-auto transition-all"
              >
                <div className="size-1 bg-indigo-500 rounded-full animate-pulse" />
                No data? Try with sample dataset
              </motion.button>
            )}
          </div>

          <ResumeBanner name={resumedName} />

          {orphanRun && (
            <div className="mb-8 rounded-[2rem] border border-indigo-500/20 bg-indigo-500/[0.04] p-6 md:p-8">
              <div className="font-bold text-sm uppercase tracking-wider mb-4">Batch run</div>
              <BatchProgress run={batchRun} onOpen={(report) => onResult(report, { save: false })} resumeSlot={<span className="text-xs text-amber-200/80">Choose {batchRun.fileName} below to resume</span>} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Upload Area */}
            <motion.div className="lg:col-span-2">
              <div 
                className={`relative group border-[1.5px] rounded-[2.5rem] p-1 transition-all duration-700 
                  ${dragActive ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_40px_rgba(79,70,229,0.1)]' : 'border-white/10 bg-white/[0.02]'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="relative border border-dashed border-white/10 rounded-[2.3rem] p-12 flex flex-col items-center overflow-hidden">
                  {/* Grainy Texture Overlay */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
                  
                  <motion.div 
                    animate={dragActive ? { scale: 1.1 } : { scale: 1 }}
                    className={`p-7 rounded-3xl transition-all duration-500 mb-8 
                    ${fileName ? 'bg-indigo-600 shadow-[0_0_30px_rgba(79,70,229,0.4)]' : 'bg-white/5 border border-white/10'}`}
                  >
                    {fileName ? <FileText className="size-12 text-white" /> : <Upload className="size-12 text-indigo-400" />}
                  </motion.div>
                  
                  <h3 className="text-2xl font-semibold mb-3 tracking-tight">
                    {fileName || "Drop your dataset here"}
                  </h3>
                  
                  <p className="text-slate-500 mb-10 text-center max-w-xs text-sm">
                    {fileName ? "Ready for analysis" : "Accepting .csv files up to 50 MB. Rows stay in the data-plane and are discarded after profiling."}
                  </p>

                  <AnimatePresence mode="wait">
                    {!fileName ? (
                      <motion.label 
                        key="browse"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="group px-10 py-4 bg-white text-black font-bold rounded-2xl cursor-pointer hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-xl active:scale-95"
                      >
                        Browse Files
                        <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
                        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                      </motion.label>
                    ) : (
                      <motion.div 
                        key="actions"
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-wrap justify-center gap-4"
                      >
                        <button 
                          onClick={handleUpload}
                          disabled={loading || tooLarge}
                          title={tooLarge ? `Over ${MAX_UPLOAD_MB} MB: use batch processing below` : undefined}
                          className="px-10 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition shadow-xl shadow-indigo-600/20 flex items-center gap-3 disabled:opacity-50"
                        >
                          {loading ? (
                            <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : "Start Analysis"}
                        </button>
                        <button 
                          onClick={() => { setFile(null); setFileName(""); setBatchMode(false); }}
                          className="px-6 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-2xl hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all"
                        >
                          <X className="size-5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Sidebar Cards */}
            <div className="space-y-6">
              <AssessmentOptions options={options} onChange={setOptions} disabled={loading} />
              <JobProgress job={job} ruleMode={options.ruleMode} narrative={options.narrative} />

              <div className="p-8 bg-gradient-to-br from-indigo-600/10 to-transparent border border-indigo-500/10 rounded-[2rem]">
                <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="size-5 text-indigo-500" />
                    <span className="font-bold text-sm uppercase tracking-wider">Privacy First</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed italic">
                  Only aggregate metadata (counts, ratios, format masks) leaves the data-plane. Scores are computed deterministically; LLMs only derive rules and write explanations, and every assessment is recorded in a tamper-evident audit log.
                </p>
              </div>
            </div>
          </div>

          <DataPreview file={file} />
          {file && (tooLarge || batchMode) && <BatchPanel file={file} options={options} onOpen={(report) => onResult(report, { save: false })} />}
          {file && !tooLarge && !batchMode && (
            <button onClick={() => setBatchMode(true)} className="mt-4 text-xs text-slate-500 hover:text-indigo-300 transition">Process this file in batches instead</button>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Csv;
