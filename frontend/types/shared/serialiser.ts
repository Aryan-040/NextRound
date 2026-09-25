/**
 * Minimal serialiser exports for frontend type compatibility.
 * Frontend doesn't actually use serialisation at runtime.
 */

export function serialiseKit(kit: any): string {
  throw new Error('serialiseKit should not be called in frontend');
}
