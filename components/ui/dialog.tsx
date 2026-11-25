"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
function DialogContent({className,children,...props}:React.ComponentProps<typeof DialogPrimitive.Content>){
 return <DialogPrimitive.Portal>
  <DialogPrimitive.Overlay data-slot="dialog-overlay"/>
  <DialogPrimitive.Content data-slot="dialog-content" className={cn("grid gap-4 rounded-xl border bg-background p-5 shadow-lg outline-none",className)} {...props}>
   {children}
   <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><XIcon className="size-4"/><span className="sr-only">Chiudi</span></DialogPrimitive.Close>
  </DialogPrimitive.Content>
 </DialogPrimitive.Portal>;
}
function DialogHeader({className,...props}:React.ComponentProps<"div">){return <div className={cn("flex flex-col gap-1.5 pr-8",className)} {...props}/>;}
function DialogTitle({className,...props}:React.ComponentProps<typeof DialogPrimitive.Title>){return <DialogPrimitive.Title className={cn("text-lg font-semibold tracking-tight",className)} {...props}/>;}
function DialogDescription({className,...props}:React.ComponentProps<typeof DialogPrimitive.Description>){return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground",className)} {...props}/>;}
export {Dialog,DialogTrigger,DialogClose,DialogContent,DialogHeader,DialogTitle,DialogDescription};
