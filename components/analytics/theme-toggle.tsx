"use client";
import {useState} from "react";
import {Moon,Sun} from "lucide-react";
import {Button} from "@/components/ui/button";
export function ThemeSettings({initialDark}:{initialDark:boolean}){
 const [dark,setDark]=useState(()=>typeof document!=="undefined"?document.documentElement.classList.contains("dark"):initialDark);
 function change(next:boolean){document.documentElement.classList.toggle("dark",next);document.cookie="dashboard_theme="+(next?"dark":"light")+"; path=/; max-age=31536000; SameSite=Lax";setDark(next);}
 return <div role="group" aria-label="Tema" className="flex gap-1 rounded-lg border bg-muted/40 p-1"><Button type="button" size="sm" variant={!dark?"secondary":"ghost"} aria-pressed={!dark} onClick={()=>change(false)}><Sun className="size-4"/>Chiaro</Button><Button type="button" size="sm" variant={dark?"secondary":"ghost"} aria-pressed={dark} onClick={()=>change(true)}><Moon className="size-4"/>Scuro</Button></div>;
}
