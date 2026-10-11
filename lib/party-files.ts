export const FILE_CHUNK_SIZE=256*1024;
export const MAX_PARTY_FILE=8*1024*1024;
export const PARTY_FILE_TYPES=['application/pdf','image/png','image/jpeg','image/webp'] as const;
export interface PartyFile {id:string;name:string;title:string;contentType:string;size:number;chunkCount:number;sha256:string;authorUid:string;authorName:string;createdAt:number;updatedAt:number;archived:boolean;}
export function validatePartyFile(file:Pick<File,'name'|'size'|'type'>){
 if(!PARTY_FILE_TYPES.includes(file.type as typeof PARTY_FILE_TYPES[number]))throw Error('Choose a PDF, PNG, JPEG, or WebP file.');
 if(file.size<1||file.size>MAX_PARTY_FILE)throw Error('Files must be between 1 byte and 8 MB.');
 if(!file.name.trim()||file.name.length>150)throw Error('Use a file name of at most 150 characters.');
}
export async function digestFile(bytes:Uint8Array){const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export async function checkFileContent(bytes:Uint8Array,type:string){
 const prefix=(values:number[])=>values.every((v,i)=>bytes[i]===v);
 if(!(type==='application/pdf'&&prefix([37,80,68,70,45])||type==='image/png'&&prefix([137,80,78,71,13,10,26,10])||type==='image/jpeg'&&prefix([255,216,255])||type==='image/webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'))throw Error('File contents do not match the selected file type.');
}
export async function assembleFile(file:PartyFile,chunks:{index:number;data:Uint8Array}[]){
 const ordered=chunks.sort((a,b)=>a.index-b.index);
 if(ordered.length!==file.chunkCount||ordered.some((c,i)=>c.index!==i||c.data.length!==Math.min(FILE_CHUNK_SIZE,file.size-i*FILE_CHUNK_SIZE)))throw Error('This file is incomplete. Ask its uploader to upload it again.');
 const bytes=new Uint8Array(file.size);ordered.forEach(c=>bytes.set(c.data,c.index*FILE_CHUNK_SIZE));
 if(await digestFile(bytes)!==file.sha256)throw Error('This file failed its integrity check.');
 await checkFileContent(bytes,file.contentType);return new Blob([bytes],{type:file.contentType});
}
