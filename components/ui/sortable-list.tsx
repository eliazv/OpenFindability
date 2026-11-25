"use client";
import {useId,type ReactNode} from "react";
import {DndContext,closestCenter,KeyboardSensor,PointerSensor,useSensor,useSensors,type DragEndEvent} from "@dnd-kit/core";
import {SortableContext,useSortable,verticalListSortingStrategy,sortableKeyboardCoordinates,arrayMove} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {GripVertical} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type SortableEntry={id:string;name:string};
type SortableListProps<T extends SortableEntry>={
 items:T[];onChange:(items:T[])=>void;disabled?:boolean;className?:string;
 renderItem:(item:T,index:number)=>ReactNode;
};
/** Shared vertical list, based on dnd-kit's official sortable preset.
 * Activation is restricted to the handle; links and other controls remain interactive. */
export function SortableList<T extends SortableEntry>({items,onChange,disabled=false,className,renderItem}:SortableListProps<T>){
 const id=useId();
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 function finish({active,over}:DragEndEvent){
  if(disabled||!over||active.id===over.id)return;
  const from=items.findIndex(x=>x.id===active.id),to=items.findIndex(x=>x.id===over.id);
  if(from>=0&&to>=0)onChange(arrayMove(items,from,to));
 }
 return <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={finish} accessibility={{screenReaderInstructions:{draggable:"Premi spazio per prendere la voce. Usa le frecce per spostarla, spazio per confermare ed Esc per annullare."}}}>
  <SortableContext items={items.map(x=>x.id)} strategy={verticalListSortingStrategy}>
   <div role="list" className={cn("divide-y rounded-md border",className)}>
    {items.map((item,index)=><SortableRow key={item.id} item={item} disabled={disabled}>{renderItem(item,index)}</SortableRow>)}
   </div>
  </SortableContext>
 </DndContext>;
}
function SortableRow({item,disabled,children}:{item:SortableEntry;disabled:boolean;children:ReactNode}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:item.id,disabled});
 return <div role="listitem" ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?10:undefined}} className={cn("relative flex items-center gap-2 px-2 py-2 bg-background",isDragging&&"rounded-md shadow-md ring-1 ring-primary/30")}>
  <Button type="button" variant="ghost" size="icon" ref={setActivatorNodeRef} disabled={disabled} className="size-7 touch-none cursor-grab active:cursor-grabbing text-muted-foreground" {...attributes} {...listeners} aria-label={"Riordina "+item.name} title={"Trascina "+item.name}><GripVertical className="size-4"/></Button>
  {children}
 </div>;
}
