import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
export function VisitCollector() {
  const {pathname}=useLocation(),last=useRef('');
  useEffect(()=>{
    if(last.current===pathname||pathname.startsWith('/admin')||new URLSearchParams(window.location.search).has('preview'))return;
    const privacy=navigator as Navigator & {globalPrivacyControl?:boolean};
    if(navigator.doNotTrack==='1'||privacy.globalPrivacyControl)return;
    last.current=pathname;
    const width=window.innerWidth;
    const body={eventId:crypto.randomUUID(),path:pathname,referrer:document.referrer||undefined,device:width<600?'mobile':width<1024?'tablet':'desktop'};
    fetch('/api/v1/public/events',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(()=>{});
  },[pathname]);
  return null;
}
