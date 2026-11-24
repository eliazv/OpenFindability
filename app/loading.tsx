import {Skeleton} from "@/components/ui/skeleton";
export default function Loading(){return <div className="p-5 space-y-4" aria-busy="true"><Skeleton className="h-8 w-48"/><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(n=><Skeleton key={n} className="h-28"/>)}</div><Skeleton className="h-80 w-full"/></div>;}
