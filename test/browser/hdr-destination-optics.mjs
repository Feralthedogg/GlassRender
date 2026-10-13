// Actual optical shapes: incremental rendering must agree with an independent fresh scene.
import {createRenderer,CORNER_SMOOTH,SCHEME_LIGHT,SCHEME_DARK,ROWS_TOP_DOWN,STACKING_EXACT,STACKING_FLAT} from '../../dist/index.js';

export async function hdrDestinationOptics(truthy,equal){
    const width=320,height=220,pixels=new Float32Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,a=[0,.5,1][(x+2*y)%3];pixels[i]=(.125+x/40)*a;pixels[i+1]=(-.25+y/70)*a;pixels[i+2]=(.25+(x+y)/180)*a;pixels[i+3]=a;}
    const mask=document.createElement('canvas');mask.width=mask.height=32;const ctx=mask.getContext('2d');ctx.fillStyle='white';ctx.beginPath();ctx.arc(16,16,14,0,Math.PI*2);ctx.fill();
    const scene=(mode,state)=>{
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true}),made=createRenderer(gl);truthy(made.ok,made.error);const r=made.value;
        r.resize(width,height,1);
        if(state.extended){if(!r.setExtendedRange(true,1)){r.dispose();return null;}}else r.setExtendedRange(false,1);
        r.setStacking(mode==='flat'?STACKING_FLAT:STACKING_EXACT);
        truthy(r.setBackdropPixels({width,height,data:pixels,rows:ROWS_TOP_DOWN}).ok,'premultiplied optical backdrop');
        const rect=r.addShape(state.x,state.y,150,110,14,CORNER_SMOOTH,SCHEME_LIGHT);r.setOpacity(rect,.7);r.setAdaptive(rect,false);
        let clear=null;
        if(!state.removed){clear=r.addShape(98,72,174,116,22,CORNER_SMOOTH,SCHEME_DARK);r.setClear(clear,SCHEME_DARK);r.setOpacity(clear,state.opacity);r.setAdaptive(clear,false);}
        const masked=r.addMask(mask,188,18,86,86,SCHEME_LIGHT);truthy(masked.ok,masked.error);r.setOpacity(masked.value,.6);r.setAdaptive(masked.value,false);
        const union=r.addUnion(7,SCHEME_DARK);r.addMember(union,34,142,80,52,12,CORNER_SMOOTH);
        const member=r.addMemberMask(union,mask,92,136,60,60);truthy(member.ok,member.error);r.setAdaptive(union,false);r.setOpacity(union,.8);
        if(state.raised)r.raise(rect);
        return {r,gl,rect,clear,mask:masked.value,union};
    };
    const read=s=>{s.r.render(0);const floating=s.r.extended,out=floating?new Float32Array(width*height*4):new Uint8Array(width*height*4);s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,null);s.gl.readPixels(0,0,width,height,s.gl.RGBA,floating?s.gl.FLOAT:s.gl.UNSIGNED_BYTE,out);equal(s.gl.getError(),0,'actual optical GL state');return out;};
    for(const extended of [true,false])for(const mode of ['exact','flat']){
        const state={x:20,y:26,opacity:.5,raised:false,removed:false,extended},live=scene(mode,state);if(!live)return 'skipped: no half-float drawing buffer';
        let partialCalls=0;const partial=live.r.partial.bind(live.r);live.r.partial=()=>{partialCalls++;return partial();};
        try{
            const baseline=read(live);
            state.x=24;state.y=28;live.r.setShape(live.rect,state.x,state.y,150,110,14);
            state.opacity=.35;live.r.setOpacity(live.clear,state.opacity);
            const updated=read(live),fresh=scene(mode,state);
            try{const expected=read(fresh);let different=0;for(let i=0;i<updated.length;i++)different+=!Object.is(updated[i],expected[i]);equal(different,0,'HDR '+mode+' partial optical scene equals fresh');}finally{fresh.r.dispose();}
            truthy(partialCalls>0,'optical '+mode+' uses the partial redraw path');
            let changed=0;for(let i=0;i<updated.length;i++)changed+=updated[i]!==baseline[i];truthy(changed>0,'optical update changes the frame');
            state.raised=true;live.r.raise(live.rect);const raised=read(live),ordered=scene(mode,state);
            try{const expected=read(ordered);let different=0;for(let i=0;i<raised.length;i++)different+=!Object.is(raised[i],expected[i]);equal(different,0,'HDR '+mode+' raised optical scene equals fresh');}finally{ordered.r.dispose();}
            state.removed=true;live.r.removeShape(live.clear);const removed=read(live),without=scene(mode,state);
            try{const expected=read(without);let different=0;for(let i=0;i<removed.length;i++)different+=!Object.is(removed[i],expected[i]);equal(different,0,'HDR '+mode+' removed lower glass equals fresh');}finally{without.r.dispose();}
            live.r.setExtendedRange(!extended,1);live.r.render(0);equal(live.gl.getError(),0,'optical range transition');
            live.r.setExtendedRange(extended,1);const restored=read(live);let different=0;for(let i=0;i<restored.length;i++)different+=!Object.is(restored[i],removed[i]);equal(different,0,'optical '+mode+' range roundtrip');
        }finally{live.r.dispose();}
    }
}
