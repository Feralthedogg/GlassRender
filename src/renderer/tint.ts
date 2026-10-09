/** Analytic HDR tint: independently rasterized fill mask and premultiplied foreground.
 * The recovered regular effect uses margin 8, fill support 1.5 and 64-pixel allocation tiles.
 * Layer-opacity groups retain alpha until their final generic composite.
 * Other effect combinations retain the existing path until their ordering is validated.
 */
import {GROUP_VERTEX,RIM_VERTEX,sdfFillMaskFragment,tintForegroundFragment,tintCompositeFragment} from "../kernels.js";
import {ROW_CORNER} from "../layout.js";
import {fma32} from "../precision.js";
import {boxEffectMesh,BOX_CORNER_INDICES,BOX_FILL_INDICES} from "./effect-mesh.js";
import {G} from "./lanes.js";
import {Group} from "./group.js";
import {link} from "./shared.js";

type Surface={texture:WebGLTexture;fbo:WebGLFramebuffer;width:number;height:number};
export abstract class Tint extends Group {
    private tintFill:Surface|null=null;
    private tintForeground:Surface|null=null;
    private tintVao:WebGLVertexArrayObject|null=null;
    private tintVbo:WebGLBuffer|null=null;
    private tintIbo:WebGLBuffer|null=null;
    private readonly tintPrograms=new Map<number,[WebGLProgram,WebGLProgram]>();
    private tintComposite:WebGLProgram|null=null;
    private tintGroupComposite:WebGLProgram|null=null;
    private readonly tintVertices=new Float32Array(96);

    protected dropTint(deleteObjects:boolean):void {
        const gl=this.gl;
        if(deleteObjects){for(const s of[this.tintFill,this.tintForeground])if(s){gl.deleteTexture(s.texture);gl.deleteFramebuffer(s.fbo);}
            gl.deleteVertexArray(this.tintVao);gl.deleteBuffer(this.tintVbo);gl.deleteBuffer(this.tintIbo);
            for(const ps of this.tintPrograms.values())ps.forEach(p=>gl.deleteProgram(p));gl.deleteProgram(this.tintComposite);gl.deleteProgram(this.tintGroupComposite);}
        this.tintFill=null;this.tintForeground=null;this.tintVao=null;this.tintVbo=null;this.tintIbo=null;this.tintPrograms.clear();this.tintComposite=null;this.tintGroupComposite=null;
    }

    private tintSurface(current:Surface|null,width:number,height:number,unit:number):Surface|null {
        const gl=this.gl;if(current&&current.width===width&&current.height===height)return current;
        if(current){gl.deleteTexture(current.texture);gl.deleteFramebuffer(current.fbo);}
        const texture=gl.createTexture(),fbo=gl.createFramebuffer();
        if(!texture||!fbo){gl.deleteTexture(texture);gl.deleteFramebuffer(fbo);return null;}
        gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA16F,width,height);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(fbo);return null;}
        return{texture,fbo,width,height};
    }

    protected drawTint(slot:number,premultiplied=false):void {
        const key=this.keys[slot] as number;if(!this.separateTint(key))return;
        const gl=this.gl,scene=this.sceneFbo,viewport=gl.getParameter(gl.VIEWPORT) as Int32Array;
        const scissored=gl.isEnabled(gl.SCISSOR_TEST),scissor=gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
        try{
            let programs=this.tintPrograms.get(key);
            if(!programs){const fill=link(gl,RIM_VERTEX,sdfFillMaskFragment(key)),foreground=link(gl,RIM_VERTEX,tintForegroundFragment(key,true,this.groupLayer(key)));
                if(!fill||!foreground){gl.deleteProgram(fill);gl.deleteProgram(foreground);return;}
                programs=[fill,foreground];this.tintPrograms.set(key,programs);
                for(const p of programs){for(const[name,binding]of[["M",0],["F",1],["U",2]] as const){const i=gl.getUniformBlockIndex(p,name);if(i!==gl.INVALID_INDEX)gl.uniformBlockBinding(p,i,binding);}
                    gl.useProgram(p);gl.uniform1ui(gl.getUniformLocation(p,"uHalfBarrier"),0);gl.uniform1f(gl.getUniformLocation(p,"uOffset"),-.5);}
                gl.useProgram(foreground);gl.uniform1i(gl.getUniformLocation(foreground,"uTintBackdrop"),6);gl.uniform1i(gl.getUniformLocation(foreground,"uTintMask"),7);gl.uniform1i(gl.getUniformLocation(foreground,"uTintFill"),8);gl.uniform1i(gl.getUniformLocation(foreground,"uTintUnderlying"),10);
            }
            let composite=premultiplied?this.tintGroupComposite:this.tintComposite;
            if(!composite){composite=link(gl,GROUP_VERTEX,tintCompositeFragment(premultiplied));if(!composite)return;
                if(premultiplied)this.tintGroupComposite=composite;else this.tintComposite=composite;
                gl.useProgram(composite);gl.uniform1ui(gl.getUniformLocation(composite,"uHalfBarrier"),0);gl.uniform1i(gl.getUniformLocation(composite,"uD"),6);gl.uniform1i(gl.getUniformLocation(composite,"uTintForeground"),9);}
            if(!this.tintVao){const vao=gl.createVertexArray(),vbo=gl.createBuffer(),ibo=gl.createBuffer();if(!vao||!vbo||!ibo){gl.deleteVertexArray(vao);gl.deleteBuffer(vbo);gl.deleteBuffer(ibo);return;}
                gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,384,gl.STREAM_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,24,16);
                const index=new Uint16Array(54);index.set(BOX_CORNER_INDICES);index.set(BOX_FILL_INDICES,24);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,index,gl.STATIC_DRAW);this.tintVao=vao;this.tintVbo=vbo;this.tintIbo=ibo;}
            const b=slot*G,g=this.geo,e=this.swell(slot),s=this.scale,hx=(g[b+2] as number)*.5+e,hy=(g[b+3] as number)*.5+e;
            const cx=(g[b] as number)+(g[b+2] as number)*.5,cy=(g[b+1] as number)+(g[b+3] as number)*.5,radius=this.blocks[slot*this.stride+ROW_CORNER*4] as number;
            const extent=(padding:number)=>{const x=Math.floor((cx-hx-padding)*s),y=Math.floor((cy-hy-padding)*s),right=Math.ceil((cx+hx+padding)*s),bottom=Math.ceil((cy+hy+padding)*s);return{x,y,width:Math.ceil((right-x)/64)*64,height:Math.ceil((bottom-y)/64)*64,right,bottom};};
            const fillBounds=extent(9.5),foregroundBounds=extent(18);
            if(Math.max(fillBounds.width,fillBounds.height,foregroundBounds.width,foregroundBounds.height)>this.maxTex)return;
            this.tintFill=this.tintSurface(this.tintFill,fillBounds.width,fillBounds.height,8);this.tintForeground=this.tintSurface(this.tintForeground,foregroundBounds.width,foregroundBounds.height,9);
            if(!this.tintFill||!this.tintForeground)return;
            this.keepDestination(slot);gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,this.destinationTex);if(!this.bindTintMask())return;
            if(premultiplied){gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,this.sceneTex);}
            gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
            for(let i=0;i<2;i++){
                const bounds=i===0?fillBounds:foregroundBounds,surface=i===0?this.tintFill:this.tintForeground,p=programs[i] as WebGLProgram;
                gl.bindFramebuffer(gl.FRAMEBUFFER,surface.fbo);gl.viewport(0,0,bounds.width,bounds.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
                gl.useProgram(p);const sx=Math.fround(2/bounds.width),sy=Math.fround(-2/bounds.height);gl.uniform4f(gl.getUniformLocation(p,"uProjection"),sx,sy,fma32(sx,-bounds.x,-1),fma32(-sy,bounds.y,1));
                gl.uniform2f(gl.getUniformLocation(p,"uTintOrigin"),bounds.x,bounds.y);gl.uniform2f(gl.getUniformLocation(p,"uTintFillOrigin"),fillBounds.x,fillBounds.y);gl.uniform2f(gl.getUniformLocation(p,"uTintFillSize"),fillBounds.width,fillBounds.height);
                if(i===1){gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,this.tintFill.texture);}
                boxEffectMesh(this.tintVertices,cx,cy,hx,hy,radius,i===0?9.5:18,s,false);gl.bindVertexArray(this.tintVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.tintVbo);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.tintVertices);
                gl.uniform1i(gl.getUniformLocation(p,"uMode"),4);gl.drawElements(gl.TRIANGLES,24,gl.UNSIGNED_SHORT,0);gl.uniform1i(gl.getUniformLocation(p,"uMode"),0);gl.drawElements(gl.TRIANGLES,30,gl.UNSIGNED_SHORT,48);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER,scene);gl.viewport(viewport[0] as number,viewport[1] as number,viewport[2] as number,viewport[3] as number);gl.enable(gl.SCISSOR_TEST);
            const x0=Math.max(0,foregroundBounds.x,scissored?scissor[0] as number:0),y0=Math.max(0,foregroundBounds.y,scissored?scissor[1] as number:0);
            const x1=Math.min(this.width,foregroundBounds.right,scissored?(scissor[0] as number)+(scissor[2] as number):this.width),y1=Math.min(this.height,foregroundBounds.bottom,scissored?(scissor[1] as number)+(scissor[3] as number):this.height);
            if(x1>x0&&y1>y0){gl.scissor(x0,y0,x1-x0,y1-y0);gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,this.tintForeground.texture);gl.useProgram(composite);gl.uniform2f(gl.getUniformLocation(composite,"uTintOrigin"),foregroundBounds.x,foregroundBounds.y);gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,3);}
        }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,scene);gl.viewport(viewport[0] as number,viewport[1] as number,viewport[2] as number,viewport[3] as number);
            if(scissored){gl.enable(gl.SCISSOR_TEST);gl.scissor(scissor[0] as number,scissor[1] as number,scissor[2] as number,scissor[3] as number);}else gl.disable(gl.SCISSOR_TEST);gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(this.vao);}
    }
}
