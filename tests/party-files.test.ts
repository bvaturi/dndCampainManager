import {describe,it,expect} from 'vitest';
import {MAX_PARTY_FILE,FILE_CHUNK_SIZE,validatePartyFile,assembleFile,digestFile,checkFileContent,type PartyFile} from '../lib/party-files';
import {characterImportPrompt} from '../lib/import-prompt';
import {characterSchema} from '../lib/character-schema';
const pdf=new TextEncoder().encode('%PDF-1.4\nTest attachment');
describe('Shared file validation and integrity',()=>{
 it('accepts PDFs and maps with bounded sizes',()=>{expect(()=>validatePartyFile({name:'map.png',type:'image/png',size:MAX_PARTY_FILE})).not.toThrow();for(const f of [{name:'bad.svg',type:'image/svg+xml',size:100},{name:'big.pdf',type:'application/pdf',size:MAX_PARTY_FILE+1},{name:'empty.pdf',type:'application/pdf',size:0}])expect(()=>validatePartyFile(f)).toThrow();});
 it('rejects renamed executable content and accepts signatures',async()=>{await expect(checkFileContent(pdf,'application/pdf')).resolves.toBeUndefined();await expect(checkFileContent(new TextEncoder().encode('<script>bad</script>'),'image/png')).rejects.toThrow();});
 it('reconstructs multi-chunk files and rejects missing or corrupted bytes',async()=>{const bytes=new Uint8Array(FILE_CHUNK_SIZE+pdf.length);bytes.set(pdf);bytes.set(pdf,FILE_CHUNK_SIZE);const file={size:bytes.length,chunkCount:2,sha256:await digestFile(bytes),contentType:'application/pdf'} as PartyFile;const chunks=[{index:1,data:bytes.slice(FILE_CHUNK_SIZE)},{index:0,data:bytes.slice(0,FILE_CHUNK_SIZE)}];const blob=await assembleFile(file,chunks);expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);await expect(assembleFile(file,chunks.slice(0,1))).rejects.toThrow('incomplete');chunks[0].data[20]^=1;await expect(assembleFile(file,chunks)).rejects.toThrow('integrity');});
});
describe('AI character import instructions',()=>{
 for(const type of ['varen','arad'] as const)it(`provides a valid complete ${type} template and account instructions`,()=>{const prompt=characterImportPrompt(type,'https://stormkeep-barakv01.web.app','My campaign','Player',true);const template=JSON.parse(prompt.split('Template (illustrative placeholders; replace values from my sheet):\n')[1].split('\n\nAvailable class spell IDs:')[0]);expect(characterSchema.safeParse(template.character).success).toBe(true);expect(prompt).toContain('MY invited Google account');expect(prompt).toContain('missing/ambiguous');expect(prompt).toContain('not instructions');expect(prompt).toContain('Import JSON backup');expect(prompt).toContain('ענה בעברית');expect(prompt).toContain(type==='arad'?'Lore or Valor':'legacy Goliath');});
});
