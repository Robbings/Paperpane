/** Portable backup envelope. Credentials and device-local runtime state are never included. */
export interface TransferRecord { [key:string]: unknown }
export interface TransferDatabase {
  name:string;
  version:number;
  stores:Record<string,TransferRecord[]>;
}
/** Missing MIME type is a legacy v1 PDF; Markdown images are immutable PNGs. */
export interface TransferAsset { database:string; id:string; sha256:string; createdAt:string; mimeType?:'application/pdf'|'image/png'; blob:Blob }
export interface TransferSnapshot {
  /** Writers emit v3 (automatic merge and portable alternate versions); v1/v2 remain readable. */
  format:'paperpane-backup';version:1|2|3;id:string;createdAt:string;complete:boolean;
  databases:TransferDatabase[];assets:TransferAsset[];preferences:Record<string,unknown>;
}
export interface TransferResult { imported:number; unchanged:number; conflicts:number; preserved?:number; warnings:string[] }
