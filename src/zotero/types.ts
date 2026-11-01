export interface ZoteroData {
  key?:string;version?:number;itemType:string;title?:string;parentItem?:string;collections?:string[];
  creators?:{creatorType:string;firstName?:string;lastName?:string;name?:string}[];
  tags?:{tag:string}[];date?:string;publicationTitle?:string;DOI?:string;abstractNote?:string;url?:string;note?:string;
  contentType?:string;filename?:string;md5?:string;mtime?:number;linkMode?:string;
  annotationType?:string;annotationText?:string;annotationComment?:string;annotationPosition?:string;annotationColor?:string;
  [key:string]:unknown;
}
export interface ZoteroItem {key:string;version:number;data:ZoteroData;meta?:{numChildren?:number}}
export interface ZoteroCollection {key:string;version:number;data:{name:string;parentCollection:string|false}}
export interface ZoteroAccess {userID:number;username:string;access:{user?:{library?:boolean;files?:boolean;notes?:boolean;write?:boolean}}}
