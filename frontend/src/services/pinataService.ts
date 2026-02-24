import { logger } from "@/lib/logger";

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

if (!PINATA_JWT) {
  logger.warn("Missing NEXT_PUBLIC_PINATA_JWT – Pinata uploads will fail until it is set in .env");
}

interface PinataUploadResult {
  cid: string;
  uri: string;
  gatewayUrl: string;
}

const PINATA_API_BASE = "https://api.pinata.cloud";
const PINATA_GATEWAY_BASE = "https://gateway.pinata.cloud/ipfs";

async function assertJwt() {
  if (!PINATA_JWT) {
    throw new Error("Pinata JWT not configured. Please set NEXT_PUBLIC_PINATA_JWT in .env");
  }
}

function mockUploadResult(name?: string): PinataUploadResult {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const cid = `mock-${name ? `${name}-` : ""}${suffix}`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY_BASE}/${cid}`,
  };
}

export async function pinJSONToIPFS<T>(data: T, name?: string): Promise<PinataUploadResult> {
  if (!PINATA_JWT) {
    logger.warn("Pinata JWT missing; returning mock IPFS URI for JSON upload");
    return mockUploadResult(name);
  }

  await assertJwt();
  const response = await fetch(`${PINATA_API_BASE}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: data,
      pinataMetadata: name ? { name } : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to pin JSON to IPFS: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const cid = json.IpfsHash;
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY_BASE}/${cid}`,
  };
}

export async function pinFileToIPFS(file: Blob | File, fileName: string): Promise<PinataUploadResult> {
  if (!PINATA_JWT) {
    logger.warn("Pinata JWT missing; returning mock IPFS URI for file upload");
    return mockUploadResult(fileName);
  }

  await assertJwt();
  const formData = new FormData();
  formData.append("file", file, fileName);

  const response = await fetch(`${PINATA_API_BASE}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to pin file to IPFS: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const cid = json.IpfsHash;
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY_BASE}/${cid}`,
  };
}
