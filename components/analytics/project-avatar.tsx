export function ProjectAvatar({name,icon}:{name:string;icon?:string}){
 return <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">{icon?<img src={icon} alt="" className="size-full object-contain"/>:name.slice(0,2).toUpperCase()}</span>;
}
