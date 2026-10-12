import {FIELD_SEED_FRAGMENT,FULL_VERTEX} from '../../dist/kernels.js';

// A centre with exactly half coverage must stay on the outline even when a neighbouring raster sample is noisy.
export function stableMaskSeed(truthy,equal){
 const gl=document.createElement('canvas').getContext('webgl2');if(!gl.getExtension('EXT_color_buffer_float'))return 'skipped: no float targets';
 const p=gl.createProgram(),shaders=[],mask=gl.createTexture(),target=gl.createTexture(),fbo=gl.createFramebuffer();
 try{
  for(const[kind,source]of [[gl.VERTEX_SHADER,FULL_VERTEX],[gl.FRAGMENT_SHADER,FIELD_SEED_FRAGMENT]]){
   const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);truthy(gl.getShaderParameter(s,gl.COMPILE_STATUS),gl.getShaderInfoLog(s));gl.attachShader(p,s);shaders.push(s);
  }
  gl.linkProgram(p);truthy(gl.getProgramParameter(p,gl.LINK_STATUS),gl.getProgramInfoLog(p));gl.useProgram(p);
  const data=new Float32Array(25);for(let y=0;y<5;y++)for(let x=0;x<5;x++)data[y*5+x]=x<2?1:x===2?.5:0;
  data[1*5+2]=.50390625;
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.R16F,5,5,0,gl.RED,gl.FLOAT,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.uniform1i(gl.getUniformLocation(p,'uM'),0);gl.uniform4f(gl.getUniformLocation(p,'uX'),.2,.2,0,0);gl.uniform1f(gl.getUniformLocation(p,'uL'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,target);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA16F,5,5);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);gl.viewport(0,0,5,5);gl.drawArrays(gl.TRIANGLES,0,3);
  const out=new Float32Array(4);gl.readPixels(2,2,1,1,gl.RGBA,gl.FLOAT,out);equal(gl.getError(),0,'seed GPU operations');
  truthy(out[2]===0,'half-covered seed must have zero distance');truthy(Number.isFinite(out[3]),'finite seed direction');
 }finally{gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);gl.deleteTexture(mask);gl.deleteTexture(target);gl.deleteFramebuffer(fbo);}
}
