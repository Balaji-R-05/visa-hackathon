import axios from "axios";

// Everything goes through the gateway; in Docker, nginx proxies /api to it.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});
