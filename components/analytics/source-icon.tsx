"use client";
import {useState} from "react";
import {ChartNoAxesCombined,Search,Smartphone,Store,Coins,Globe,MousePointer2,Cloud,Activity,Database} from "lucide-react";
const config:Record<string,{label:string;url:string;icon:typeof Search;color:string}>={
 gsc:{label:"Google Search Console",url:"https://search.google.com/favicon.ico",icon:Search,color:"text-blue-600"},
 ga4:{label:"Google Analytics",url:"https://analytics.google.com/favicon.ico",icon:ChartNoAxesCombined,color:"text-orange-500"},
 ga4_landing:{label:"Google Analytics",url:"https://analytics.google.com/favicon.ico",icon:ChartNoAxesCombined,color:"text-orange-500"},
 umami:{label:"Umami",url:"https://umami.is/favicon.ico",icon:ChartNoAxesCombined,color:"text-foreground"},
 admob:{label:"Google AdMob",url:"https://admob.google.com/favicon.ico",icon:Coins,color:"text-amber-600"},
 adsense:{label:"Google AdSense",url:"https://adsense.google.com/favicon.ico",icon:Coins,color:"text-green-600"},
 revenuecat:{label:"RevenueCat",url:"https://www.revenuecat.com/favicon.ico",icon:Coins,color:"text-red-500"},
 play_console:{label:"Google Play",url:"https://play.google.com/favicon.ico",icon:Smartphone,color:"text-green-600"},
 play_stats:{label:"Google Play",url:"https://play.google.com/favicon.ico",icon:Smartphone,color:"text-green-600"},
 play_vitals:{label:"Android Vitals",url:"https://play.google.com/favicon.ico",icon:Activity,color:"text-green-600"},
 asc_analytics:{label:"App Store Connect",url:"https://appstoreconnect.apple.com/favicon.ico",icon:Store,color:"text-blue-500"},
 asc_metadata:{label:"App Store Connect",url:"https://appstoreconnect.apple.com/favicon.ico",icon:Store,color:"text-blue-500"},
 asc_experiments:{label:"App Store Connect",url:"https://appstoreconnect.apple.com/favicon.ico",icon:Store,color:"text-blue-500"},
 aso:{label:"RespectASO",url:"",icon:Search,color:"text-violet-500"},
 bing_webmaster:{label:"Bing Webmaster",url:"https://www.bing.com/favicon.ico",icon:Search,color:"text-teal-600"},
 clarity:{label:"Microsoft Clarity",url:"https://clarity.microsoft.com/favicon.ico",icon:MousePointer2,color:"text-violet-500"},
 cloudflare_ai:{label:"Cloudflare",url:"https://www.cloudflare.com/favicon.ico",icon:Cloud,color:"text-orange-500"},
 pagespeed:{label:"PageSpeed",url:"https://pagespeed.web.dev/favicon.ico",icon:Activity,color:"text-blue-500"},
 crux:{label:"Chrome UX Report",url:"",icon:Globe,color:"text-green-600"},
 gsc_index:{label:"Google Search Console",url:"https://search.google.com/favicon.ico",icon:Search,color:"text-blue-600"},
 motherduck:{label:"MotherDuck",url:"https://motherduck.com/favicon.ico",icon:Database,color:"text-yellow-600"},
};
export function SourceIcon({source}:{source:string}){return <SourceMark key={source} source={source}/>;}
function SourceMark({source}:{source:string}){
 const [failed,setFailed]=useState(false),v=config[source];const Icon=v?.icon??Database;
 return <span title={v?.label??source} aria-label={v?.label??source} role="img" className="inline-flex size-4 shrink-0 items-center justify-center">{v?.url&&!failed?<img src={v.url} alt="" referrerPolicy="no-referrer" decoding="async" loading="lazy" onError={()=>setFailed(true)} className="size-4 object-contain"/>:<Icon className={"size-4 "+(v?.color??"text-muted-foreground")}/>}</span>;
}
