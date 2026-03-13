import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "https://visa-hackathon-in3q.onrender.com/api";

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});
