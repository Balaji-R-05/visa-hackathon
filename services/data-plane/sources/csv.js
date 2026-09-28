import csv from "csv-parser";
import { Readable } from "stream";

// Function to parse CSV file.
export const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", (err) => reject(err));
  });
};
