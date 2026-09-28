import rateLimit from 'express-rate-limit';
import fileUpload from 'express-fileupload';


// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  // Clients poll job status every few seconds while a local LLM works; don't count polls.
  skip: (req) => req.method === 'GET' && req.path.startsWith('/api/assessments/'),
});

// File Upload Limiting
const fileLimiter = fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
  abortOnLimit: true,
  limitHandler: (_req, res) => {
    res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
  }
})

export { limiter, fileLimiter };
