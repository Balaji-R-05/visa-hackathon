import dns from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata"]);

const ipv4ToInt = (ip) => ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;

const IPV4_BLOCKED_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],   // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],  // link-local incl. cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],     // multicast
  ["240.0.0.0", 4],     // reserved + broadcast
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

// True when an IP literal is loopback, private, link-local, or otherwise non-public.
export const isPrivateAddress = (ip) => {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return IPV4_BLOCKED_CIDRS.some(([base, mask]) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||   // unique local
      /^fe[89ab]/.test(lower) ||  // link-local
      lower.startsWith("ff")      // multicast
    );
  }
  return true;
};

// Resolves the hostname and rejects the URL if any resolved address is non-public,
// so DNS names pointing at internal hosts (e.g. 127.0.0.1.nip.io) are caught too.
export const assertPublicUrl = async (urlString, lookup = dns.lookup) => {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new Error("Blocked host");

  const addresses = net.isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Blocked host");
  return url;
};
