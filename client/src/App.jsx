import { useState } from 'react'
import Navbar from './components/Navbar'
import Csv from './pages/Csv'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LenisScroll from './components/lenis-scroll'
import Table from './pages/Table'
import { Routes } from 'react-router'
import { Route } from 'react-router'
import { useNavigate } from 'react-router'
import Api from './pages/Api'
import Home from './pages/Home'
import Result from './pages/Result'
import Chatbot from './pages/Chatbot'
import History from './pages/History'
import Batch from './pages/Batch'
import { addToHistory } from './utils/history'

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(() => {
    const saved = localStorage.getItem("assay_result");
    return saved ? JSON.parse(saved) : null;
  });
  const navigate = useNavigate();

  const handleFinishedAnalysis = async (data, { save = true } = {}) => {
    setIsLoading(true); 
    
    try {
      console.log("Analysis received:", data);
      await new Promise(resolve => setTimeout(resolve, 100));

      setResult(data);
      if (save) addToHistory(data);
      localStorage.setItem("assay_result", JSON.stringify(data));
      
      navigate('/result');
    } catch (error) {
      console.error("Error during navigation:", error);
    } finally {
      setIsLoading(false); 
    }
  };
  return (
    <div>

      <LenisScroll />
      <ToastContainer /> 
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/csv" element={<Csv onResult={handleFinishedAnalysis} />} />
        <Route path="/table" element={<Table onResult={handleFinishedAnalysis} />} />
        <Route path="/api" element={<Api onResult={handleFinishedAnalysis} />} />
        <Route path="/chat" element={<Chatbot auditContext={result} />} />
        <Route path="/batch" element={<Batch onOpen={(report) => handleFinishedAnalysis(report, { save: false })} />} />
        <Route path="/history" element={<History onOpen={(report) => { setResult(report); localStorage.setItem("assay_result", JSON.stringify(report)); }} />} />
        <Route path="/result" element={<Result result={result} />} />
      </Routes>
    </div>
  );
}

export default App
