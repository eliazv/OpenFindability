"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {PanelLeftOpen} from "lucide-react";
import {AppSidebar} from "@/components/app-sidebar";
import {SidebarInset,useSidebar} from "@/components/ui/sidebar";
import {Button} from "@/components/ui/button";
import {ProjectSwitcher} from "./project-switcher";
import {DashboardSettings} from "./dashboard-settings";
import {SidebarEditor,type SidebarProject} from "./sidebar-editor";
import {SyncProgress} from "./sync-progress";
type Panel="search"|"settings"|"organize";
export function DashboardShell({projects,initialDark,children}:{projects:SidebarProject[];initialDark:boolean;children:ReactNode}){
 const {isMobile,openMobile,setOpenMobile}=useSidebar(),[panel,P]=useState<Panel|null>(null);
 const current=useRef<Panel|null>(null),returnFocus=useRef<HTMLElement|null>(null),mobileMenu=useRef<HTMLButtonElement>(null);
 const open=useCallback((next:Panel)=>{
  if(!current.current){returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}
  if(isMobile)setOpenMobile(false);
  current.current=next;P(next);
 },[isMobile,setOpenMobile]);
 const close=()=>{current.current=null;P(null);};
 const restore=()=>{if(current.current)return;const target=returnFocus.current;returnFocus.current=null;if(target?.isConnected&&target.getClientRects().length)target.focus();else mobileMenu.current?.focus();};
 useEffect(()=>{function key(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){if(current.current&&current.current!=="search")return;e.preventDefault();if(current.current==="search"){current.current=null;P(null);}else open("search");}}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[open]);
 useEffect(()=>{function settings(){open("settings");}window.addEventListener("openfindability:settings",settings);return()=>window.removeEventListener("openfindability:settings",settings);},[open]);
 return <>
 <AppSidebar projects={projects} onSearch={()=>open("search")} onSettings={()=>open("settings")} onOrganize={()=>open("organize")}/>
 <SidebarInset className="min-w-0 pb-16 md:pb-0">
  <div className="fixed bottom-4 left-4 z-30 md:hidden" style={{bottom:"max(1rem, env(safe-area-inset-bottom))"}}>
   <Button type="button" variant="outline" size="icon" ref={mobileMenu} onClick={()=>setOpenMobile(true)} aria-label="Apri navigazione" aria-expanded={openMobile} className="size-11 rounded-full bg-background shadow-md"><PanelLeftOpen className="size-5"/></Button>
  </div>
  <SyncProgress/>
  {children}
 </SidebarInset>
 <ProjectSwitcher projects={projects} open={panel==="search"} onOpenChange={v=>v?open("search"):close()} onRestoreFocus={restore}/>
 <DashboardSettings initialDark={initialDark} open={panel==="settings"} onOpenChange={v=>v?open("settings"):close()} onOrganize={()=>open("organize")} onRestoreFocus={restore}/>
 <SidebarEditor projects={projects} open={panel==="organize"} onOpenChange={v=>v?open("organize"):close()} onRestoreFocus={restore}/>
 </>;
}
