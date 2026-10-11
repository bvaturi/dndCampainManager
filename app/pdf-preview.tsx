import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {Button} from '@/components/ui/button';
import {useLanguage} from './language';
GlobalWorkerOptions.workerSrc=workerURL;
export default function PDFPreview({blob,title}:{blob:Blob;title:string}){
 const {t}=useLanguage();const canvas=useRef<HTMLCanvasElement>(null),[document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let stopped=false;let task:ReturnType<typeof getDocument>|undefined;setError('');setLoading(true);void blob.arrayBuffer().then(data=>{if(stopped)return;task=getDocument({data:new Uint8Array(data)});return task.promise;}).then(pdf=>{if(pdf&&!stopped){setDocument(pdf);setPage(1);}}).catch(()=>{if(!stopped){setError(t('PDF preview unavailable. Download the file to view it.'));setLoading(false);}});return()=>{stopped=true;void task?.destroy();};},[blob]);
 useEffect(()=>{if(!document||!canvas.current)return;let stopped=false;let render:RenderTask|undefined;setLoading(true);setError('');void document.getPage(page).then(pdf=>{if(stopped||!canvas.current)return;const base=pdf.getViewport({scale:1}),scale=Math.min(2,1200/base.width,1600/base.height),viewport=pdf.getViewport({scale});canvas.current.width=viewport.width;canvas.current.height=viewport.height;render=pdf.render({canvas:canvas.current,viewport});return render.promise;}).then(()=>{if(!stopped)setLoading(false);}).catch(()=>{if(!stopped){setError(t('PDF preview unavailable. Download the file to view it.'));setLoading(false);}});return()=>{stopped=true;render?.cancel();};},[document,page]);
 return <div className="pdf-preview"><div className="button-row"><Button variant="outline" disabled={!document||page===1||loading} onClick={()=>setPage(page-1)}>{t('Previous page')}</Button><span>{page} / {document?.numPages||'—'}</span><Button variant="outline" disabled={!document||page===document.numPages||loading} onClick={()=>setPage(page+1)}>{t('Next page')}</Button></div>{loading&&<p role="status">{t('Loading PDF…')}</p>}{error&&<p role="status">{error}</p>}<canvas ref={canvas} role="img" aria-label={`${title} · ${t('Page')} ${page}`}/></div>;
}
