import{createRenderer,CORNER_SMOOTH,SCHEME_LIGHT}from'../../dist/index.js';

// Transparent support pixels of a foreground still have to preserve the current destination.
export async function tintSupportDestination(truthy,equal){
 const width=640,height=480,source=new Float32Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;source[i]=.2+x/width;source[i+1]=.1+y/height;source[i+2]=.4;source[i+3]=1;}
 for(const clear of[false,true]){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const gl=canvas.getContext('webgl2',{alpha:true,antialias:false}),made=createRenderer(gl);truthy(made.ok,'support renderer');const r=made.value;
  try{r.resize(width,height,1);truthy(r.setBackdropPixels({width,height,data:source}).ok,'support backdrop');truthy(r.setExtendedRange(true,1),'support half');let rect=[140.25,95.75,120,44,12];const h=r.addShape(...rect,CORNER_SMOOTH,SCHEME_LIGHT);if(clear)r.setClear(h,SCHEME_LIGHT);r.setAdaptive(h,false);r.setTint(h,.1,.75,.2,.6);
   const check=()=>{r.settle();r.render(0);const pixels=new Float32Array(width*height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,r.sceneFbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,pixels);equal(gl.getError(),0,'support GL');const x=Math.floor(rect[0]-17),top=Math.floor(rect[1]+rect[3]*.5),i=((height-1-top)*width+x)*4;truthy(pixels[i]>.1&&pixels[i+1]>.1&&pixels[i+2]>.1,'transparent tint support preserves background '+clear);equal(pixels[i+3],1,'support alpha');};
   check();rect=[180.75,141.25,120,44,12];r.setShape(h,...rect);check();
  }finally{r.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}
 }
}
