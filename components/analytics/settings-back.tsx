"use client";
import {ChevronLeft} from "lucide-react";
import {Button} from "@/components/ui/button";
export function SettingsBack(){return <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs text-muted-foreground" onClick={()=>window.dispatchEvent(new Event("openfindability:settings"))}><ChevronLeft className="size-3.5"/>Impostazioni</Button>;}
