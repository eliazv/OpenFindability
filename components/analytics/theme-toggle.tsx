"use client";
import {useState} from "react";
import {Moon,Sun} from "lucide-react";
export function ThemeToggle({initialDark}:{initialDark:boolean}){
 const [dark,setDark]=useState(initialDark);
 return <button type="button" aria-label={dark?"Usa tema chiaro":"Usa tema scuro"} title={dark?"Tema chiaro":"Tema scuro"} className="rounded-md border p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>{const next=!dark;document.documentElement.classList.toggle("dark",next);document.cookie="dashboard_theme="+(next?"dark":"light")+"; path=/; max-age=31536000; SameSite=Lax";setDark(next);}}>{dark?<Sun className="size-4"/>:<Moon className="size-4"/>}</button>;
}
