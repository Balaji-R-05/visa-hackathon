import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Navbar from './components/Navbar'
import Csv from './pages/Csv'

import LenisScroll from './components/lenis-scroll'
import Table from './pages/Table'
import { Routes } from 'react-router'
import { Route } from 'react-router'
import { useNavigate } from 'react-router'
import Api from './pages/Api'
import Home from './pages/Home'
import Result from './pages/Result'
import Chatbot from './pages/Chatbot'
function App() {
  const [result, setResult] = useState();
  const navigate = useNavigate();

  const handleFinishedAnalysis = (data) => {
    console.log("Analysis received:", data);
    setResult(data);
    navigate('/result');
  };

  return (
    <div>

      <LenisScroll />
      <Navbar />
      <Routes>
        <Route path="/csv" element={<Csv onResult={handleFinishedAnalysis} />} />

        <Route path="/table" element={<Table onResult={handleFinishedAnalysis} />} />
        <Route path="/api" element={<Api onResult={handleFinishedAnalysis} />} />
        <Route path="/chat" element={<Chatbot auditContext={result} />} />
        <Route path="/result" element={<Result result={result} onResult={handleFinishedAnalysis} />} />
        <Route path="/" element={<Home />} />
      </Routes>



    </div>
  );
}

export default App

