interface Window {
  tlsn?: {
    execCode: (code: string) => Promise<string>;
    open: (
      url: string,
      options?: {
        width?: number;
        height?: number;
        showOverlay?: boolean;
      }
    ) => Promise<unknown>;
    sendMessage: (data: unknown) => void;
  };
}
