import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Navbar from './components/Navbar'
import Csv from './pages/Csv'
import { ToastContainer } from 'react-toastify';
import LenisScroll from './components/lenis-scroll'
import Table from './pages/Table'
import { Routes } from 'react-router'
import { Route } from 'react-router'
import { useNavigate } from 'react-router'
import Api from './pages/Api'
import Home from './pages/Home'
import Result from './pages/Result'
import Chatbot from './pages/Chatbot'
import ResultTable from './pages/ResultTable'
import ResultApi from './pages/ResultApi'

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState();
  const navigate = useNavigate();

  const handleFinishedAnalysis = async (data) => {
  setIsLoading(true); // Start loading
  
  try {
    console.log("Analysis received:", data);
    
    // Simulate a small delay if you want the user to actually 
    // see the loading animation (optional)
    await new Promise(resolve => setTimeout(resolve, 100));

    setResult(data);
    
    // Navigate to the result page
    // navigate('/result');
  } catch (error) {
    console.error("Error during navigation:", error);
  } finally {
    // If you stay on the same page, turn it off. 
    // If you navigate away, the new page will take over.
    setIsLoading(false); 
  }
};
  return (
    <div>

      <LenisScroll />
      <ToastContainer /> 
      <Navbar />
      <Routes>
        <Route path="/csv" element={<Csv onResult={handleFinishedAnalysis} />} />

        <Route path="/table" element={<Table onResult={handleFinishedAnalysis} />} />
        <Route path="/api" element={<Api onResult={handleFinishedAnalysis} />} />
        <Route path="/chat" element={<Chatbot auditContext={result} />} />
        <Route path="/result" element={<Result/>} />
        <Route path="/result." element={<ResultTable/>} />
        <Route path="/result`" element={<ResultApi/>} />
        <Route path="/" element={<Home />} />
      </Routes>



    </div>
  );
}

export default App
