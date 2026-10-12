// Exercise the separate HDR rim through public operations and compare against independent fresh scenes.
import {createRenderer,CORNER_SMOOTH,SCHEME_LIGHT,SCHEME_DARK,ROWS_TOP_DOWN,STACKING_EXACT,STACKING_FLAT} from '../../dist/index.js';
import {ROW_TOP} from '../../dist/layout.js';

export async function hdrRimRuntime(truthy,equal,group=false){
    const width=300,height=220,pixels=new Float32Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,a=[0,.5,1][(x+2*y)%3];
        pixels[i]=(.125+x/45)*a;pixels[i+1]=(-.25+y/80)*a;pixels[i+2]=(.25+(x+y)/170)*a;pixels[i+3]=a;
    }
    const scaledPixels=new Float32Array(width*height*4*4);
    for(let y=0;y<height*2;y++)for(let x=0;x<width*2;x++)scaledPixels.set(pixels.subarray((Math.floor(y/2)*width+Math.floor(x/2))*4,(Math.floor(y/2)*width+Math.floor(x/2))*4+4),(y*width*2+x)*4);
    const mask=document.createElement('canvas');mask.width=mask.height=32;
    const ctx=mask.getContext('2d');ctx.fillStyle='white';ctx.beginPath();ctx.arc(16,16,14,0,Math.PI*2);ctx.fill();
    const scene=(mode,state)=>{
        const canvas=document.createElement('canvas');canvas.width=width*state.scale;canvas.height=height*state.scale;
        const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true});
        const made=createRenderer(gl);truthy(made.ok,made.error);const r=made.value;
        r.resize(canvas.width,canvas.height,state.scale);
        if(!r.setExtendedRange(true,1)){r.dispose();return null;}
        r.setStacking(mode==='flat'?STACKING_FLAT:STACKING_EXACT);
        truthy(r.setBackdropPixels({width:canvas.width,height:canvas.height,data:state.scale===1?pixels:scaledPixels,rows:ROWS_TOP_DOWN}).ok,'HDR rim backdrop accepted');
        const rect=r.addShape(state.x,state.y,150,104,state.radius,CORNER_SMOOTH,SCHEME_LIGHT);
        const upper=r.addShape(87,66,162,98,23,CORNER_SMOOTH,SCHEME_DARK);
        const field=r.addMask(mask,190,18,82,82,SCHEME_LIGHT);truthy(field.ok,field.error);
        const union=r.addUnion(7,SCHEME_DARK);r.addMember(union,34,142,80,52,12,CORNER_SMOOTH);
        const member=r.addMemberMask(union,mask,92,136,60,60);truthy(member.ok,member.error);
        const handles=[rect,upper,field.value,union];for(const h of handles){r.setAdaptive(h,false);r.setOpacity(h,state.opacity);}
        if(state.raised)r.raise(rect);r.settle();
        return {r,gl,canvas,rect,handles};
    };
    const read=s=>{
        s.r.render(0);
        let active=0;
        for(const h of s.handles){const slot=h&0xfffff,weight=s.r.blocks[slot*s.r.stride+ROW_TOP*4+2];
            if(weight===0){equal(s.r.draws[slot],0,'zero packet opacity hides the group');continue;}
            active++;truthy(s.r.separateRim(s.r.keys[slot]),'shape selects separate HDR rim');
            equal(s.r.groupLayer(s.r.keys[slot]),weight<1,'packet opacity selects RGBA group');
        }
        if(active)truthy(s.r.rimPrograms.size>0,'rim programs actually created');
        const out=new Float32Array(s.canvas.width*s.canvas.height*4);s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,null);
        s.gl.readPixels(0,0,s.canvas.width,s.canvas.height,s.gl.RGBA,s.gl.FLOAT,out);equal(s.gl.getError(),0,'HDR rim GL state');return out;
    };
    const same=(a,b,label)=>{equal(a.length,b.length,label+' frame size');let different=0;for(let i=0;i<a.length;i++)different+=!Object.is(a[i],b[i]);equal(different,0,label);};
    for(const mode of ['exact','flat']){
        const state={x:20.25,y:26.75,radius:14,scale:1,raised:false,opacity:group?.35:1},live=scene(mode,state);
        if(!live)return 'skipped: no half-float drawing buffer';
        let partialCalls=0;const partial=live.r.partial.bind(live.r);live.r.partial=()=>{partialCalls++;return partial();};
        const freshFrame=()=>{const fresh=scene(mode,state);try{return read(fresh);}finally{fresh.r.dispose();}};
        try{
            const baseline=read(live);
            state.x=25.75;state.y=29.25;state.radius=0;live.r.setShape(live.rect,state.x,state.y,150,104,state.radius);
            const moved=read(live);same(moved,freshFrame(),mode+' zero-radius partial equals fresh');
            truthy(partialCalls>0,mode+' opaque rim uses actual partial redraw');
            let changed=0;for(let i=0;i<moved.length;i++)changed+=!Object.is(moved[i],baseline[i]);truthy(changed>0,'opaque rim move changes frame');
            state.radius=52;live.r.setShape(live.rect,state.x,state.y,150,104,state.radius);
            same(read(live),freshFrame(),mode+' capsule partial equals fresh');
            state.raised=true;live.r.raise(live.rect);const raised=read(live);same(raised,freshFrame(),mode+' reordered rim equals fresh');
            const priorWorldTexture=live.r.worldTex,priorWorldFbo=live.r.worldFbo;
            truthy(priorWorldTexture&&priorWorldFbo,'direct world surface allocated');
            live.r.setExtendedRange(false,1);live.r.render(0);equal(live.gl.getError(),0,'rim SDR transition');
            truthy(!live.gl.isTexture(priorWorldTexture)&&!live.gl.isFramebuffer(priorWorldFbo),'world surface released on SDR transition');
            live.r.setExtendedRange(true,1);same(read(live),raised,mode+' rim range roundtrip');
            if(group){
                for(const opacity of [.5039215683937073,.9998000264167786,0,.35]){
                    state.opacity=opacity;for(const h of live.handles)live.r.setOpacity(h,opacity);
                    same(read(live),freshFrame(),mode+' group opacity '+opacity+' equals fresh');
                }
            }
            state.scale=2;live.canvas.width=width*2;live.canvas.height=height*2;live.r.resize(width*2,height*2,2);
            truthy(live.r.setBackdropPixels({width:width*2,height:height*2,data:scaledPixels,rows:ROWS_TOP_DOWN}).ok,'resized HDR rim backdrop accepted');
            const resized=read(live);same(resized,freshFrame(),mode+' rim resize equals fresh');
            const extension=live.gl.getExtension('WEBGL_lose_context');truthy(extension,'context loss extension');
            const lost=new Promise(resolve=>live.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();resolve();},{once:true}));
            extension.loseContext();await lost;await new Promise(resolve=>setTimeout(resolve,50));
            const restored=new Promise(resolve=>live.canvas.addEventListener('webglcontextrestored',resolve,{once:true}));extension.restoreContext();await restored;
            const restoredRenderer=live.r.restore();truthy(restoredRenderer.ok,restoredRenderer.error);
            same(read(live),resized,mode+' rim context restoration');
            const programs=Array.from(live.r.rimPrograms.values(),v=>v.program),vao=live.r.rimVao,vbo=live.r.rimVertexBuffer,ibo=live.r.rimIndexBuffer;
            const groupTex=live.r.groupTex,groupFbo=live.r.groupFbo,groupProgram=live.r.groupProgram;
            const worldTex=live.r.worldTex,worldFbo=live.r.worldFbo,worldVao=live.r.worldVao,worldVbo=live.r.worldVbo;
            truthy(worldTex&&worldFbo&&worldVao&&worldVbo,'direct world resources recreated');
            if(group)truthy(groupTex&&groupFbo&&groupProgram,'RGBA group resources recreated');
            truthy(vao&&vbo&&ibo,'box rim resources recreated');live.r.dispose();
            for(const p of programs)truthy(!live.gl.isProgram(p),'rim program released');
            truthy(!live.gl.isVertexArray(vao)&&!live.gl.isBuffer(vbo)&&!live.gl.isBuffer(ibo),'rim mesh released');
            if(group)truthy(!live.gl.isTexture(groupTex)&&!live.gl.isFramebuffer(groupFbo)&&!live.gl.isProgram(groupProgram),'RGBA group resources released');
            truthy(!live.gl.isTexture(worldTex)&&!live.gl.isFramebuffer(worldFbo)&&!live.gl.isVertexArray(worldVao)&&!live.gl.isBuffer(worldVbo),'direct world resources released');
        }finally{live.r.dispose();}
    }
}
