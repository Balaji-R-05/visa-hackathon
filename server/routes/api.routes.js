import Router from 'express';
import { apiDataExtraction } from '../controllers/api.controller.js';

const router = Router();

// POST /api/source - extract metadata from API URL provided in body
router.post('/source', apiDataExtraction);

export default router;