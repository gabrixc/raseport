/**
 * Holds the object URL of the PDF being shown. Messages between windows carry a fresh *copy* of the PDF every
 * time, so identity cannot tell whether it is new; the render id can. A new URL (which reloads the iframe) is only
 * made when the id changes.
 */
export function createPdfSlot(make: (b: Blob) => string = (b) => URL.createObjectURL(b), revoke: (u: string) => void = (u) => URL.revokeObjectURL(u)) {
  let currentId = 0;
  let url: string | null = null;
  return {
    set(id: number, blob: Blob | null): string | null {
      if (id === currentId && (url !== null || blob === null)) return url;
      if (url) revoke(url);
      currentId = id;
      url = blob ? make(blob) : null;
      return url;
    },
    dispose(): void {
      if (url) revoke(url);
      url = null;
      currentId = 0;
    },
  };
}
