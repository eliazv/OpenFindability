import { configure } from './engine.js';
export async function loadSession() {
  const q = new URLSearchParams(location.search);
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Impossibile caricare i progetti');
  const projects = await response.json();
  if (!projects.length) throw new Error('Nessun progetto configurato. Avvia con --repo <percorso> oppure registra flutterProjectPath in OpenFindability.');
  const project = q.has('project') ? projects.find(p => p.slug === q.get('project')) : projects[0];
  if (!project) throw new Error('Progetto sconosciuto');
  const setName = q.get('set') || project.defaultSet || project.sets[0]?.id;
  if (!project.sets.some(s => s.id === setName)) throw new Error('Set sconosciuto');
  const res = await fetch(`/p/${project.slug}/${project.setsPath}/${setName}.json`, {cache:'no-store'});
  if (!res.ok) throw new Error('Impossibile caricare il set');
  const set = await res.json();
  const css = document.createElement('link'); css.rel='stylesheet'; css.href=project.css;
  await new Promise((ok,fail) => {css.onload=ok;css.onerror=()=>fail(new Error('CSS del progetto non disponibile'));document.head.append(css);});
  const components = await import(project.components);
  configure(components.default, {name:project.name,icon:project.icon});
  return {q,projects,project,setName,set};
}
export function connectHeader(session, isDirty = () => false, leave = () => {}) {
  const {projects,project,setName,set,q} = session;
  const $ = id => document.getElementById(id);
  for (const p of projects) $('project').add(new Option(p.name,p.slug));
  $('project').value=project.slug;
  for (const s of project.sets) $('set').add(new Option(s.name,s.id));
  $('set').value=setName;
  $('app-icon').src=project.icon; $('app-icon').alt=project.name;
  for (const [key,p] of Object.entries(set.platforms)) $('platform').add(new Option(`${p.label} · ${p.w}×${p.h}`,key));
  for (const locale of set.locales) $('locale').add(new Option(locale === 'it' ? 'Italiano' : locale === 'en' ? 'English' : locale.toUpperCase(),locale));
  $('platform').value=set.platforms[q.get('platform')] ? q.get('platform') : Object.keys(set.platforms)[0];
  $('locale').value=set.locales.includes(q.get('locale')) ? q.get('locale') : set.locales[0];
  const go = (kind) => {
    if (isDirty() && !confirm('Ci sono modifiche non salvate. Vuoi cambiare vista e scartarle?')) {$(kind).value=kind==='project'?project.slug:setName;return;}
    leave();
    const next=new URLSearchParams(location.search);
    next.set('project',$('project').value);
    next.set('set',kind==='project' ? (projects.find(p=>p.slug===$('project').value).defaultSet || projects.find(p=>p.slug===$('project').value).sets[0]?.id || '') : $('set').value);
    next.delete('slide'); location.href=`${location.pathname}?${next}`;
  };
  $('project').onchange=()=>go('project');$('set').onchange=()=>go('set');
  const updateUrl=()=>{const next=new URLSearchParams(location.search);for(const key of ['project','set','platform','locale'])next.set(key,$(key).value);history.replaceState(null,'',`?${next}`);const back=$('gallery');if(back)back.href=`/?${next}`;};
  for(const key of ['platform','locale'])$(key).addEventListener('input',updateUrl);
  updateUrl();
}
export function showError(error) { const box=document.createElement('p');box.className='error';box.setAttribute('role','alert');box.textContent=error.message;document.body.prepend(box); }
