// Adapted from dashboardcn (MIT), NoahGdev/dashboardcn@b1ffacbca0f7a0be60135c8665b9e8c267205c48.
// License: docs/reference/dashboardcn-LICENSE.txt.
// Small SVG, no responsive chart instance or observer per KPI.
import * as React from "react";
import {cn} from "@/lib/utils";
export function Sparkline({data,variant="area",color="var(--primary)",className,...props}:React.ComponentProps<"div">&{data:(number|null)[];variant?:"area"|"line";color?:string}){
 const values=data.filter((n):n is number=>n!==null&&Number.isFinite(n));
 if(values.length<2)return null;
 const min=Math.min(...values),max=Math.max(...values),width=100,height=32;
 const x=(i:number)=>2+i/(Math.max(1,data.length-1))*(width-4);
 const y=(n:number)=>max===min?height/2:2+(max-n)/(max-min)*(height-4);
 const segments:{x:number;y:number}[][]=[];let segment:{x:number;y:number}[]=[];
 for(let i=0;i<data.length;i++){const v=data[i];if(v===null||!Number.isFinite(v)){if(segment.length)segments.push(segment);segment=[];}else segment.push({x:x(i),y:y(v)});}if(segment.length)segments.push(segment);
 return <div data-slot="sparkline" aria-hidden="true" className={cn("h-8 w-full",className)} {...props}><svg viewBox="0 0 100 32" className="size-full" preserveAspectRatio="none">{segments.map((s,i)=>{const line=s.map((p,j)=>(j?"L":"M")+p.x+","+p.y).join(" ");return <React.Fragment key={i}>{variant==="area"&&s.length>1&&<path d={line+" L"+s.at(-1)!.x+","+height+" L"+s[0].x+","+height+" Z"} fill={color} opacity={.1}/>}{s.length>1?<path d={line} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>:<circle cx={s[0].x} cy={s[0].y} r={1.5} fill={color}/>}</React.Fragment>})}</svg></div>;
}
