declare module 'qrcode' {
  const QRCode: {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: Record<string, unknown>,
    ): Promise<void>;
    toDataURL(
      text: string,
      options?: Record<string, unknown>,
    ): Promise<string>;
    toString(
      text: string,
      options?: Record<string, unknown>,
    ): Promise<string>;
  };
  export default QRCode;
}
