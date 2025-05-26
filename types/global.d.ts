// types/global.d.ts

// Define User-Agent Client Hints interfaces if not already available
// Based on MDN and common typings

interface NavigatorUADataBrandVersion {
  readonly brand: string;
  readonly version: string;
}

interface UADataValues {
  readonly architecture?: string;
  readonly bitness?: string;
  readonly brands?: NavigatorUADataBrandVersion[];
  readonly mobile?: boolean;
  readonly model?: string;
  readonly platform?: string;
  readonly platformVersion?: string;
  readonly uaFullVersion?: string;
  // Add other high entropy values as needed
}

interface NavigatorUAData extends UADataValues {
  getHighEntropyValues(hints: string[]): Promise<UADataValues>;
  toJSON(): UADataValues;
}

declare global {
  interface Navigator {
    readonly userAgentData?: NavigatorUAData;
  }
}

// This export statement makes the file a module, which is often necessary
// for global declarations to be picked up correctly in some TypeScript setups.
export {}; 