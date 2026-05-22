declare module "uzip" {
  const UZIP: {
    parse(buffer: ArrayBuffer): Record<string, Uint8Array>;
    encode(files: Record<string, Uint8Array>): ArrayBuffer | Uint8Array;
  };

  export default UZIP;
}
