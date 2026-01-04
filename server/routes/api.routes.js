import express from 'express';
import { apiDataExtraction } from '../controllers/api.controller.js';
// import { apiDataExtraction } from '../controllers/api.controller.js';
// apiDataExtraction
const router = express.Router();

// POST /api/source - extract metadata from API URL provided in body
router.post('/source', apiDataExtraction);

export default router;
