import axios from "axios";
import { assertPublicUrl } from "../utils/ssrf.js";

const MAX_API_BYTES = 50 * 1024 * 1024;

// Fetches an array of records from a public REST endpoint. The SSRF check runs
// here, next to the fetch, so a DNS answer can't change between check and use
// in another service.
export const loadApi = async ({ apiUrl }) => {
  if (!apiUrl) throw Object.assign(new Error("API URL is required"), { status: 400 });
  try {
    await assertPublicUrl(apiUrl);
  } catch {
    throw Object.assign(new Error("Invalid or blocked URL. Only public HTTP(S) URLs are allowed."), { status: 400 });
  }
  // Redirects are disabled so a public URL cannot bounce the request to an internal host.
  const response = await axios.get(apiUrl, {
    timeout: 15000,
    maxRedirects: 0,
    maxContentLength: MAX_API_BYTES,
    maxBodyLength: MAX_API_BYTES,
  });
  if (!Array.isArray(response.data)) {
    throw Object.assign(new Error("API did not return an array of records"), { status: 400 });
  }
  return response.data;
};
