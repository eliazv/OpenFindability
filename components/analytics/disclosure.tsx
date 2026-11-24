import type {ReactNode} from "react";
export function Disclosure({title,count,children,open=false}:{title:string;count?:number;children:ReactNode;open?:boolean}){
 return <details className="rounded-lg border bg-card" open={open||undefined}><summary className="cursor-pointer px-4 py-3 text-sm font-medium">{title}{count!==undefined&&<span className="ml-2 font-normal text-muted-foreground">({count.toLocaleString("it-IT")})</span>}</summary><div className="px-3 pb-3 space-y-3">{children}</div></details>;
}
