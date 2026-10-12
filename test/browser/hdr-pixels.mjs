import { createGlass, ROWS_BOTTOM_UP } from "../../dist/index.js";

function maximumDifference(a,b){let n=0;for(let i=0;i<a.length;i++)n=Math.max(n,Math.abs(a[i]-b[i]));return n;}

export async function hdrPixels(truthy,equal,frameOf){
    const canvas=document.createElement("canvas");canvas.width=canvas.height=8;
    const made=createGlass(canvas,{autoResize:false,extendedRange:true,appearance:"dark"});truthy(made.ok,"raw HDR glass created");
    const glass=made.value,renderer=glass.renderer,gl=canvas.getContext("webgl2");
    if(!glass.extendedRange){glass.destroy();return "skipped: no half-float drawing buffer";}
    const pixels=new Float32Array(8*8*4);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const i=(y*8+x)*4;pixels[i]=y<4?2:1.5;pixels[i+1]=x<4?-.5:.5;pixels[i+2]=.25;pixels[i+3]=x===3&&y===3?.5:1;
        if(x===2&&y===2)pixels.fill(0,i,i+4);
    }
    try{
        equal(glass.displayHeadroom,1,"unknown current headroom defaults to1");
        equal(renderer.headroom,1,"renderer honors actual headroom1");
        const unpack=gl.createBuffer();gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,unpack);gl.bufferData(gl.PIXEL_UNPACK_BUFFER,16,gl.STATIC_DRAW);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT,8);gl.pixelStorei(gl.UNPACK_ROW_LENGTH,12);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,2);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
        truthy(glass.setBackdropPixels({width:8,height:8,data:pixels}).ok,"float upload accepted under foreign unpack state");
        equal(gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),unpack,"unpack buffer restored");
        equal(gl.getParameter(gl.UNPACK_ROW_LENGTH),12,"row length restored");equal(gl.getParameter(gl.UNPACK_ALIGNMENT),8,"alignment restored");
        equal(gl.getParameter(gl.UNPACK_SKIP_ROWS),2,"skipped rows restored");equal(gl.getParameter(gl.UNPACK_SKIP_PIXELS),1,"skipped pixels restored");
        equal(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),true,"flip state restored");equal(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),true,"premultiplication state restored");
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);gl.deleteBuffer(unpack);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        const baseline=frameOf(glass,true);
        const overridden=new Float32Array(pixels);
        overridden.slice=()=>{throw new Error("caller slice must not participate in the owned upload");};
        truthy(glass.setBackdropPixels({width:8,height:8,data:overridden}).ok,"caller slice override cannot change the validated snapshot");
        equal(maximumDifference(baseline,frameOf(glass,true)),0,"owned constructor copy preserves HDR pixels");
        for(let y=0;y<8;y++)for(let x=0;x<8;x++){
            const output=(y*8+x)*4,input=((7-y)*8+x)*4;
            for(let c=0;c<3;c++)equal(baseline[output+c],pixels[input+c],"encoded premultiplied RGB preserved");
            equal(baseline[output+3],1,"presentation remains opaque");
        }
        const invalid=[{width:7,height:8,data:pixels},{width:8,height:8,data:new Float32Array(4)},{width:8,height:8,data:pixels,rows:7}];
        for(const [component,value] of [[0,NaN],[0,Infinity],[0,65536],[3,1.5],[3,-.5]]){const bad=pixels.slice();bad[component]=value;invalid.push({width:8,height:8,data:bad});}
        const badHalf=new Uint16Array(8*8*4);badHalf[0]=0x7e00;invalid.push({width:8,height:8,data:badHalf});
        const nonpremul=pixels.slice();nonpremul[3]=0;invalid.push({width:8,height:8,data:nonpremul});
        for(const source of invalid)truthy(!glass.setBackdropPixels(source).ok,"invalid pixels rejected");
        equal(maximumDifference(baseline,frameOf(glass,true)),0,"rejected inputs preserve prior upload");
        glass.setExtendedRange(true,2);equal(glass.displayHeadroom,2,"host headroom accepted");glass.setExtendedRange(true,1);equal(glass.displayHeadroom,1,"host can return to headroom1");
        for(const value of [NaN,Infinity,-1,Number.MAX_VALUE]){glass.setExtendedRange(true,value);equal(glass.displayHeadroom,1,"invalid headroom does not replace valid state");}
        const words=new Uint16Array(pixels.length),codes=new Map([[0,0],[.25,0x3400],[.5,0x3800],[1,0x3c00],[1.5,0x3e00],[2,0x4000],[-.5,0xb800]]);
        for(let i=0;i<pixels.length;i++)words[i]=codes.get(pixels[i]);
        words.slice=()=>{throw new Error("caller half slice must not participate in the owned upload");};
        truthy(glass.setBackdropPixels({width:8,height:8,data:words}).ok,"binary16 words accepted");
        equal(maximumDifference(baseline,frameOf(glass,true)),0,"float32 and binary16 uploads match");
        const bottomUp=new Uint16Array(words.length);for(let y=0;y<8;y++)bottomUp.set(words.subarray(y*32,y*32+32),(7-y)*32);
        truthy(glass.setBackdropPixels({width:8,height:8,data:bottomUp,rows:ROWS_BOTTOM_UP}).ok,"bottom-up input accepted");
        equal(maximumDifference(baseline,frameOf(glass,true)),0,"row order preserves rendered orientation");
        bottomUp[0]=0x7e00;
        truthy(!glass.setBackdropPixels({width:8,height:8,data:bottomUp,rows:ROWS_BOTTOM_UP}).ok,"mutation with NaN is rejected without changing retained snapshot");
        glass.add({x:1,y:1,width:6,height:6,radius:2,preset:"clear",adaptive:false});
        const withGlass=frameOf(glass,true);for(const v of withGlass)truthy(Number.isFinite(v),"HDR glass pixels stay finite");
        glass.setExtendedRange(false);const sdr=frameOf(glass);for(const v of sdr)truthy(v<=255,"SDR output bounded");
        glass.setExtendedRange(true,1);equal(maximumDifference(withGlass,frameOf(glass,true)),0,"HDR pixels survive SDR/HDR roundtrip");
        const extension=gl.getExtension("WEBGL_lose_context");truthy(extension,"context loss extension");
        const lost=new Promise(resolve=>canvas.addEventListener("webglcontextlost",resolve,{once:true}));extension.loseContext();await lost;
        truthy(!glass.setBackdropPixels({width:8,height:8,data:pixels}).ok,"lost context rejects upload without dropping source");
        await new Promise(resolve=>setTimeout(resolve,50));const restored=new Promise(resolve=>canvas.addEventListener("webglcontextrestored",resolve,{once:true}));extension.restoreContext();await restored;
        equal(glass.contextLost,false,"HDR source context restored");equal(maximumDifference(withGlass,frameOf(glass,true)),0,"retained binary16 source restores exactly");
        const dom=document.createElement("canvas");dom.width=dom.height=8;const ctx=dom.getContext("2d");ctx.fillStyle="#000";ctx.fillRect(0,0,8,8);glass.setBackdrop(dom);
        const domFrame=frameOf(glass,true);truthy(maximumDifference(withGlass,domFrame)>.1,"DOM source can replace half input");
        truthy(glass.setBackdropPixels({width:8,height:8,data:pixels}).ok,"float source can replace DOM input");equal(maximumDifference(withGlass,frameOf(glass,true)),0,"HDR restored after DOM replacement");
        glass.setBackdrop(null);const removed=frameOf(glass,true);
        truthy(maximumDifference(withGlass,removed)>.1,"null removes the retained raw backdrop");
        glass.clearBackdrop();const cleared=frameOf(glass,true);
        equal(maximumDifference(removed,cleared),0,"null and explicit clear return the same empty backdrop");
        const freshCanvas=document.createElement("canvas");freshCanvas.width=freshCanvas.height=8;const fresh=createGlass(freshCanvas,{autoResize:false,extendedRange:true,appearance:"dark"});truthy(fresh.ok,"fresh empty HDR glass");
        try{fresh.value.add({x:1,y:1,width:6,height:6,radius:2,preset:"clear",adaptive:false});equal(maximumDifference(cleared,frameOf(fresh.value,true)),0,"null backdrop matches a fresh empty renderer");}finally{fresh.value.destroy();}
    }finally{glass.destroy();}
}
