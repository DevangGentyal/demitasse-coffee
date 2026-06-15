declare module 'qz-tray' {
  interface QZ {
    websocket: {
      connect(options?: { retries?: number; delay?: number }): Promise<void>
      disconnect(): Promise<void>
      isActive(): boolean
    }
    security: {
      setCertificatePromise(promise: () => Promise<string>): void
      setSignatureAlgorithm(algorithm: string): void
      setSignaturePromise(promise: () => (hash: string) => Promise<string>): void
    }
    configs: {
      create(printer: string, options?: any): any
    }
    printers: {
      find(query?: string): Promise<string | string[]>
      getDefault(): Promise<string>
    }
    print(config: any, data: any[]): Promise<void>
  }

  const qz: QZ
  export default qz
}
