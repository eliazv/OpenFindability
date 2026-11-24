"use client";
// Adapted from dashboardcn (MIT), NoahGdev/dashboardcn@b1ffacbca0f7a0be60135c8665b9e8c267205c48.
// License: docs/reference/dashboardcn-LICENSE.txt.
import * as React from "react";
import {Area,AreaChart,Line,LineChart,ResponsiveContainer} from "recharts";
import {cn} from "@/lib/utils";
// Recharts 2 adaptation: no v3 AreaRevealShape; preserve explicit missing observations.
export function Sparkline({data,variant="area",color="var(--primary)",className,...props}:React.ComponentProps<"div">&{data:(number|null)[];variant?:"area"|"line";color?:string}){
 const id=React.useId(),points=React.useMemo(()=>data.map((y,i)=>({i,y})),[data]);
 return <div data-slot="sparkline" aria-hidden="true" className={cn("h-10 w-full",className)} {...props}><ResponsiveContainer width="100%" height="100%" debounce={100}>{variant==="line"?<LineChart data={points}><Line dataKey="y" type="linear" stroke={color} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false}/></LineChart>:<AreaChart data={points}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.2}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><Area dataKey="y" type="linear" stroke={color} fill={`url(#${id})`} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false}/></AreaChart>}</ResponsiveContainer></div>;
}
