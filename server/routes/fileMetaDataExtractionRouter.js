import express from "express";
import { fileMetaDataExtraction } from "../controllers/file.controller.js";
const router = express.Router();

router.post("/", fileMetaDataExtraction)


export default router;