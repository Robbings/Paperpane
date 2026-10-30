/** Portable backup envelope. Credentials and device-local runtime state are never included. */
export interface TransferRecord { [key:string]: unknown }
export interface TransferDatabase {
  name:string;
  version:number;
  stores:Record<string,TransferRecord[]>;
}
export interface TransferAsset { database:string; id:string; sha256:string; createdAt:string; blob:Blob }
export interface TransferSnapshot {
  format:'paperpane-backup';version:1;id:string;createdAt:string;complete:boolean;
  databases:TransferDatabase[];assets:TransferAsset[];preferences:Record<string,unknown>;
}
export interface TransferResult { imported:number; unchanged:number; conflicts:number; warnings:string[] }
