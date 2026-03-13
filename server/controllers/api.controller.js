import axios from 'axios';
import { buildFullMetadata } from '../utils/metadataExtractor.js';

// Validate URL to prevent SSRF attacks
function isUrlSafe(urlString) {
  try {
    const url = new URL(urlString);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    // Block localhost and private/internal IPs
    const blocked = [
      'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
      '169.254.169.254', // cloud metadata endpoint
      'metadata.google.internal',
    ];
    if (blocked.includes(hostname)) return false;
    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10 || a === 0) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const apiDataExtraction = async (req, res) => {
  try {
    const { apiUrl } = req.body;

    if (!apiUrl) {
      return res.status(400).json({ message: 'API URL is required' });
    }

    if (!isUrlSafe(apiUrl)) {
      return res.status(400).json({ message: 'Invalid or blocked URL. Only public HTTP(S) URLs are allowed.' });
    }

    // Fetch data from user-provided API URL
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (!Array.isArray(data)) {
      return res.status(400).json({ message: 'API did not return an array of data' });
    }

    if (data.length === 0) {
      return res.status(200).json(buildFullMetadata([], apiUrl, 'API Source'));
    }

    // Use shared extraction utilities for full metadata (fixes #6)
    const metadata = buildFullMetadata(data, apiUrl, 'API Source');
    return res.status(200).json(metadata);

  } catch (error) {
    console.error('Error fetching or processing API data:', error.message);
    return res.status(500).json({
      message: 'Failed to fetch or process API data',
      error: error.message,
    });
  }
};
