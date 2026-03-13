import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import "dotenv/config";
import rateLimit from 'express-rate-limit';
import fileMetaDataExtraction from "./routes/fileMetaDataExtractionRouter.js";
import fileUpload from 'express-fileupload';
import tableRoutes from "./routes/table.routes.js";
import apiRoutes from "./routes/api.routes.js"; 



const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(helmet());

// Rate limiting: max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// File upload with limits
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  abortOnLimit: true,
  limitHandler: (req, res) => {
    res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
  },
}));

app.get('/', (req, res) => res.json({ message: 'Hello from Express' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', now: new Date() }));
app.use("/api/file-csv", fileMetaDataExtraction);
app.use("/api/tables", tableRoutes);
app.use("/api", apiRoutes);

app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});