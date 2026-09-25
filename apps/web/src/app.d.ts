declare global {
  namespace App {
    interface Locals {
      admin: boolean;
      clientIp: string;
      country: string | null;
    }
    interface Error {
      message: string;
    }
  }
}

export {};
