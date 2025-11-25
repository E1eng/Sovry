const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

if (!PINATA_JWT) {
  console.warn("Missing NEXT_PUBLIC_PINATA_JWT – Pinata uploads will fail until it is set in .env");
}

interface PinataUploadResult {
  cid: string;
  uri: string;
  gatewayUrl: string;
}

const PINATA_API_BASE = "https://api.pinata.cloud";

async function assertJwt() {
  if (!PINATA_JWT) {
    throw new Error("Pinata JWT not configured. Please set NEXT_PUBLIC_PINATA_JWT in .env");
  }
}

export async function pinJSONToIPFS<T>(data: T, name?: string): Promise<PinataUploadResult> {
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
    gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
  };
}

export async function pinFileToIPFS(file: Blob | File, fileName: string): Promise<PinataUploadResult> {
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
    gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
  };
}
