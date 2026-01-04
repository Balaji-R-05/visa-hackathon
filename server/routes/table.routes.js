// routes/table.routes.js
import express from "express";
import { tableMetaDataExtractionMongo, tableMetaDataExtractionPostgres } from "../controllers/table.controller.js";

const router = express.Router();

// MongoDB
router.post("/mongo", tableMetaDataExtractionMongo);

// Postgres
router.post("/postgres", tableMetaDataExtractionPostgres);

export default router;
