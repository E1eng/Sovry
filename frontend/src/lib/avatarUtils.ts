// Lightweight helpers for generating deterministic avatar visuals from an address.

/**
 * Get short initials to show inside a circular avatar.
 * For EVM addresses we just show the first 2 non-"0x" characters.
 */
export function getAddressInitials(address: string | undefined | null): string {
  if (!address) return "?";

  const trimmed = address.trim();
  if (!trimmed) return "?";

  if (trimmed.startsWith("0x") && trimmed.length >= 6) {
    return trimmed.slice(2, 4).toUpperCase();
  }

  // Generic fallback: first 2 visible chars
  const letters = trimmed.replace(/[^a-zA-Z0-9]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (letters.length === 1) return letters.toUpperCase();
  return "?";
}

/**
 * Generate a simple linear-gradient background based on the address hash.
 * This is deterministic and has no external dependencies.
 */
export function getAddressGradient(address: string | undefined | null): string {
  if (!address) {
    return "linear-gradient(135deg, #27272a, #3f3f46)"; // zinc-800 -> zinc-700
  }

  const trimmed = address.trim().toLowerCase();

  // Simple string hash
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }

  const hue1 = hash % 360;
  const hue2 = (hash * 13) % 360;

  const color1 = `hsl(${hue1}, 80%, 45%)`;
  const color2 = `hsl(${hue2}, 80%, 30%)`;

  return `linear-gradient(135deg, ${color1}, ${color2})`;
}
