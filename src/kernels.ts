/**
 * @file kernels.ts
 * @brief GLSL ES 3.00 programs specialized by material and geometry features.
 * @details Framebuffer coordinates are y-up; material distances are measured in points.
 */

import {
    BLOCK_ROWS, FEATURE_ABERRATION, FEATURE_BITS, FEATURE_BLEED, FEATURE_CLAMP, FEATURE_CLAMP_HUE, FEATURE_EDGE, FEATURE_FACE,
    FEATURE_FADE, FEATURE_FIELD, FEATURE_FILL, FEATURE_HOLD, FEATURE_LENS, FEATURE_LIGHTS, FEATURE_LUMA, FEATURE_OUTER,
    FEATURE_RIM_HUE, FEATURE_RIM_SPLIT, FEATURE_RING, FEATURE_ROUND_NORMAL, FEATURE_SHADOW, FEATURE_SHADOW_SAMPLE, FEATURE_SHARP,
    FEATURE_TINT, FEATURE_UNEVEN, FEATURE_VEIL, MEMBER_SHIFT, ROW_BLEED, ROW_BLEED_MATRIX, ROW_BLEED_MORE, ROW_BLUR, ROW_BOUNDS,
    ROW_CLAMP, ROW_CLAMP_RECT, ROW_CORNER, ROW_DROP, ROW_EDGE, ROW_EDGE_MORE, ROW_EDGE_ROUND, ROW_FACE, ROW_FACE_MORE, ROW_FRAME,
    ROW_FRINGE, ROW_GRID, ROW_HOLD, ROW_KNOT, ROW_LENS, ROW_LENS_DIR, ROW_LENS_FADE, ROW_LENS_LAYER, ROW_MIX, ROW_RADII, ROW_REGION,
    ROW_RIM, ROW_RIM_ALPHA, ROW_RIM_FILL, ROW_RIM_FILL_MATRIX, ROW_RIM_FILL_MORE, ROW_RIM_KEY, ROW_RIM_KEY_MORE, ROW_RING,
    ROW_RING_MORE, ROW_ROUND, ROW_SHADOW, ROW_SHADOW_LENS, ROW_SHADOW_MATRIX, ROW_SHADOW_MORE, ROW_SLOPE, ROW_TEXEL, ROW_TINT,
    ROW_TINT_MORE, ROW_TOP, SMOOTH_REACH, UNION_ROWS
} from "./layout.js";

const H = "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n"
    + "float hf(float x){return unpackHalf2x16(packHalf2x16(vec2(x,0.))).x;}"
    + "vec2 h2(vec2 x){return unpackHalf2x16(packHalf2x16(x));}"
    + "vec3 h3(vec3 x){return vec3(h2(x.xy),hf(x.z));}"
    + "vec4 h4(vec4 x){return vec4(h2(x.xy),h2(x.zw));}\n";
// The zero uniform keeps the converted value in Float32 through subsequent arithmetic. Without
// this bit barrier the driver can lower that arithmetic to half and move its rounding boundary.
// Retain the separate integer conversion below for the precise mip accumulation compiler context.
const H_BODY = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n"
    + "uniform highp uint uHalfBarrier;\n"
    + "float hf(float x){float v=unpackHalf2x16(packHalf2x16(vec2(x,0.))).x;return uintBitsToFloat(floatBitsToUint(v)^uHalfBarrier);}"
    + "vec2 h2(vec2 x){vec2 v=unpackHalf2x16(packHalf2x16(x));return uintBitsToFloat(floatBitsToUint(v)^uvec2(uHalfBarrier));}"
    + "vec3 h3(vec3 x){return vec3(h2(x.xy),hf(x.z));}"
    + "vec4 h4(vec4 x){return vec4(h2(x.xy),h2(x.zw));}\n";
// Preserve half additions and the rounded center product in the mip FMA chain.
const H_MIP = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n"
    + "float hf(float x){uint b=floatBitsToUint(x),a=b&0x7fffffffu,sign=b&0x80000000u;"
    + "if(a>=0x7f800000u)return x;if(a>=0x477ff000u)return uintBitsToFloat(sign|0x7f800000u);"
    + "if(a<0x38800000u){float v=roundEven(abs(x)*16777216.)*.000000059604644775390625;return uintBitsToFloat(floatBitsToUint(v)|sign);}"
    + "return uintBitsToFloat((b+0xfffu+((b>>13)&1u))&0xffffe000u);}"
    + "vec2 h2(vec2 x){return vec2(hf(x.x),hf(x.y));}vec3 h3(vec3 x){return vec3(h2(x.xy),hf(x.z));}"
    + "vec4 h4(vec4 x){uvec4 b=floatBitsToUint(x),a=b&0x7fffffffu;"
    + "if(all(greaterThanEqual(a,uvec4(0x38800000u)))&&all(lessThan(a,uvec4(0x477ff000u))))"
    + "return uintBitsToFloat((b+0xfffu+((b>>13)&1u))&0xffffe000u);return vec4(h2(x.xy),h2(x.zw));}"
    + "vec4 hread(vec4 x){return vec4(unpackHalf2x16(packHalf2x16(x.xy)),unpackHalf2x16(packHalf2x16(x.zw)));}\n";
// f[0] scale, 1/scale, 8-bit target, backdrop row order; f[2] size/light turn; f[3] HDR half pair, EDR factor, eligibility.
const FRAME = "layout(std140) uniform F{vec4 f[4];};";
const BLOCKS = "layout(std140) uniform M{vec4 m[" + BLOCK_ROWS + "];};" + FRAME;
// backdrop texel under framebuffer pixel p (rows top-down when f[0].w = 1), and its bilinear lookup at a pixel position
const FETCH = "vec4 bk(vec2 p){return texelFetch(uB,ivec2(p.x,f[0].w>0.?f[2].y-p.y:p.y),0);}"
    + "vec3 bl(vec2 p){vec2 u=p*f[1].zw;return textureLod(uB,vec2(u.x,f[0].w>0.?1.-u.y:u.y),0.).rgb;}";

export const FULL_VERTEX = "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));"
    + "gl_Position=vec4(p*2.-1.,0.,1.);}";

export const SHAPE_VERTEX = "#version 300 es\n" + BLOCKS + "out vec2 vQ;out vec2 vU;flat out int vMode;"
    + "void main(){vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1));vec2 p=mix(m[" + ROW_BOUNDS + "].xy,m[" + ROW_BOUNDS + "].zw,c);"
    + "vec4 r=m[" + ROW_REGION + "],cl=m[" + ROW_CLAMP_RECT + "];float T=m[" + ROW_TEXEL + "].x;vec2 origin=(cl.xy-r.zw)/r.xy/T,size=(cl.zw-cl.xy)/r.xy/T;"
    + "vQ=p*f[0].y-m[" + ROW_FRAME + "].xy;vU=(p/T-origin)*(1./size);vMode=4;gl_Position=vec4(p*(2.*f[1].zw)-1.,0.,1.);}";

export const GRID_VERTEX = "#version 300 es\n" + BLOCKS + "out vec2 vQ;out vec2 vU;flat out int vMode;"
    + "const ivec2 cells[25]=ivec2[25](ivec2(1,1),ivec2(3,1),ivec2(3,3),ivec2(1,3),ivec2(2,0),ivec2(2,4),ivec2(0,2),ivec2(4,2),ivec2(0,0),ivec2(1,0),ivec2(0,1),ivec2(4,0),ivec2(3,0),ivec2(4,1),ivec2(4,4),ivec2(3,4),ivec2(4,3),ivec2(0,4),ivec2(1,4),ivec2(0,3),ivec2(2,2),ivec2(2,1),ivec2(2,3),ivec2(1,2),ivec2(3,2));"
    + "float A(int i){return m[" + ROW_GRID + "+i/4][i%4];}"
    + "void main(){int cell=gl_VertexID/6,corner=gl_VertexID%6;ivec2 step=corner==0||corner==5?ivec2(0):corner==1?ivec2(1,0):corner==4?ivec2(0,1):ivec2(1);"
    + "ivec2 at=cells[cell]+step;vMode=cell<4?4:cell<20?-4:0;vQ=vec2(A(12+at.x),A(18+at.y));vU=vec2(A(24+at.x),A(30+at.y));"
    + "gl_Position=vec4(A(at.x),A(6+at.y),0.,1.);}";

// Native Metal interpolates toward top-down storage. Keep q/UV in logical y-up coordinates.
export function shapeVertex(grid: boolean, nativeY = false): string {
    const source = grid ? GRID_VERTEX : SHAPE_VERTEX;
    return nativeY ? source.slice(0, -1) + "gl_Position.y=-gl_Position.y;}" : source;
}

/** Float world positions retain the original vertex projection and interpolation context. */
export function worldVertex(rim = false): string {
    return "#version 300 es\nprecision highp float;layout(location=0)in vec4 aP;"
        + "layout(location=1)in vec2 aQ;layout(location=2)in vec2 aU;uniform mat4 uWorldMVP;"
        + (rim ? "uniform int uMode;" : "")
        + "out vec2 vQ;out vec2 vU;flat out int vMode;void main(){"
        + "vec4 p=uWorldMVP[0]*aP.x+uWorldMVP[1]*aP.y;p=p+uWorldMVP[2]*aP.z;p=p+uWorldMVP[3]*aP.w;"
        + "gl_Position=vec4(p.x,-p.y,p.z,p.w);vQ=aQ;vU=aU;"
        + (rim ? "vMode=uMode;}" : "int cell=gl_VertexID/6;vMode=cell<4?4:cell<20?-4:0;}");
}

// Fixed-image rim meshes carry their own Float32 positions and SDF coordinates.
export const RIM_VERTEX = "#version 300 es\nprecision highp float;precision highp int;"
    + "layout(location=0)in vec4 aP;layout(location=1)in vec2 aQ;uniform vec4 uProjection;uniform int uMode;"
    + "uniform highp uint uHalfBarrier;out vec2 vQ;out vec2 vU;flat out int vMode;"
    + "float fb(float x){return uintBitsToFloat(floatBitsToUint(x)^uHalfBarrier);}"
    + "void main(){gl_Position=vec4(fb(fb(aP.x*uProjection.x)+uProjection.z),-fb(fb(aP.y*uProjection.y)+uProjection.w),0.,1.);"
    + "vQ=aQ;vU=vec2(0.);vMode=uMode;}";

// the backdrop is opaque whatever its alpha says: a drawing buffer with an alpha channel must not show the page through
export const PRESENT_FRAGMENT = H + FRAME + "uniform sampler2D uB;out vec4 o;" + FETCH + "void main(){o=vec4(bk(gl_FragCoord.xy).rgb,1.);}";

// backdrop into two targets at once (uT = 1 when its rows are top-down)
export const SPLIT_FRAGMENT = H_BODY + FRAME + "uniform sampler2D uB;uniform float uT;layout(location=0) out vec4 o;"
    + "layout(location=1) out vec4 p;void main(){vec2 c=gl_FragCoord.xy;vec4 raw=h4(texelFetch(uB,ivec2(c.x,uT>0.?f[2].y-c.y:c.y),0));o=vec4(raw.rgb,1.);p=f[0].z>0.?o:raw;}";

// Instanced region quads of the pyramid atlas. a0 = region rect in base texels, a1 = capture origin px (y up), texel px,
// a2 = capture position of the region's first texel (texels) and capture size (texels). uS = 2 / level size, 2^-level.
export const BUILD_VERTEX = "#version 300 es\nlayout(location=0) in vec4 a0;layout(location=1) in vec4 a1;"
    + "layout(location=2) in vec4 a2;uniform vec3 uS;flat out vec4 v0;flat out vec4 v1;flat out vec4 v2;"
    + "void main(){vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1));vec4 r=a0*uS.z;"
    + "gl_Position=vec4((r.xy+r.zw*c)*uS.xy-1.,0.,1.);v0=r;v1=a1;v2=a2;}";

// a texel beyond the capture takes a captured one: mirrored once at the capture edge, then clamped
const MIRROR = "float mir(float u,float hi){u=u<0.?-u:u;u=u>hi?2.*hi-u:u;return clamp(u,0.,hi);}";

// Scale-dependent capture samples. Coordinates are pixel centers; the capture edge is mirrored once.
export const CAPTURE_FRAGMENT = H + FRAME + "uniform sampler2D uB;flat in vec4 v0;flat in vec4 v1;flat in vec4 v2;out vec4 o;" + MIRROR
    + "vec4 sampleAt(vec2 p){vec2 hi=f[2].xy;p=clamp(p,vec2(.5),hi-.5);vec2 uv=p/hi;"
    + "if(f[0].w>0.)uv.y=1.-uv.y;return h4(textureLod(uB,uv,0.));}"
    + "void main(){float T=v1.z;vec2 u=floor(gl_FragCoord.xy)-v0.xy+v2.xy;"
    + "vec2 p=v1.xy+(vec2(mir(u.x,v2.z-1.),mir(u.y,v2.w-1.))+.5)*T;vec4 sum=vec4(0.);"
    + "if(T<=2.)sum=sampleAt(p);else if(T<=4.){float a=1./T;float k=sqrt(min(-4.*a+2.,1.));"
    + "sum=h4(sampleAt(p+vec2(-k,k))*.25+sum);sum=h4(sampleAt(p+k)*.25+sum);"
    + "sum=h4(sampleAt(p-k)*.25+sum);sum=h4(sampleAt(p+vec2(k,-k))*.25+sum);"
    + "}else{float a=1./T;float k=.5*sqrt(min(-8.*a+2.,1.))+.5;"
    + "for(int q=0;q<4;q++){vec2 sg=vec2((q&2)!=0?-1.:1.,(q&1)!=0?-1.:1.);"
    + "sum=h4(sampleAt(p+sg*k)*.0625+sum);sum=h4(sampleAt(p+sg*vec2(k,3.*k))*.0625+sum);"
    + "sum=h4(sampleAt(p+sg*vec2(3.*k,k))*.0625+sum);sum=h4(sampleAt(p+sg*(3.*k))*.0625+sum);}}o=sum;}";

// First level: 13 taps of 2x2 means of the captured texels, each read with the capture's edge rule (the halo comes from
// the capture, not from the cropped base level). uP holds the base level of the page.
export const FIRST_MIP_FRAGMENT = H_MIP + "uniform sampler2D uP;flat in vec4 v0;flat in vec4 v2;out vec4 o;" + MIRROR
    + "vec4 c(vec2 u){return hread(texelFetch(uP,ivec2(2.*v0.xy+vec2(mir(u.x,v2.z-1.),mir(u.y,v2.w-1.))-v2.xy),0));}"
    + "vec4 b(vec2 q){return h4(h4(h4(c(q+vec2(0.,1.))+c(q+1.))+c(q+vec2(1.,0.)))+c(q))*.25;}"
    + "void main(){vec2 p=2.*(floor(gl_FragCoord.xy)-v0.xy)+v2.xy;"
    + "vec4 a=h4(h4(h4(b(p+vec2(2.,-2.))+b(p-2.))+b(p+vec2(-2.,2.)))+b(p+2.));"
    + "vec4 c=h4(h4(h4(b(p-vec2(2.,0.))+b(p-vec2(0.,2.)))+b(p+vec2(2.,0.)))+b(p+vec2(0.,2.)));"
    + "vec4 e=h4(h4(h4(b(p-vec2(4.,0.))+b(p-vec2(0.,4.)))+b(p+vec2(4.,0.)))+b(p+vec2(0.,4.)));"
    + "vec4 r=h4(a*hf(.0770874)+h4(b(p)*hf(.105469)));r=h4(r+c*hf(.0902099));r=h4(r+e*hf(.0563354));"
    + "o=vec4(mix(r.rgb,vec3(0.),lessThan(abs(r.rgb),vec3(.000100017))),r.a);}";

// Build level k from k-1 with 13 bilinear taps in 16x32 tiles. Map local coordinates into the atlas region.
export const DOWNSAMPLE_FRAGMENT = H_MIP + "uniform sampler2D uP;flat in vec4 v0;out vec4 o;"
    + "vec2 origin,step;ivec2 gid,group;vec4 b(ivec2 offset){ivec2 cell=gid-group+ivec2(2)+offset;"
    + "ivec2 loader=ivec2(cell.x&~1,cell.y>=20?cell.y-20:cell.y);vec2 uv=(vec2(group+loader)-1.5)*step;"
    + "if((cell.x&1)!=0)uv.x+=step.x;if(cell.y>=20)uv.y+=step.y*20.;"
    + "vec2 p=clamp(uv*(2.*v0.zw),vec2(.5),2.*v0.zw-.5)+origin;"
    + "return hread(textureLod(uP,p/vec2(textureSize(uP,0)),0.));}"
    + "void main(){origin=2.*v0.xy;step=1./v0.zw;gid=ivec2(floor(gl_FragCoord.xy)-v0.xy);group=(gid/ivec2(16,32))*ivec2(16,32);"
    + "vec4 a=h4(h4(h4(b(ivec2(1,-1))+b(ivec2(-1,-1)))+b(ivec2(-1,1)))+b(ivec2(1,1)));"
    + "vec4 c=h4(h4(h4(b(ivec2(-1,0))+b(ivec2(0,-1)))+b(ivec2(1,0)))+b(ivec2(0,1)));"
    + "vec4 e=h4(h4(h4(b(ivec2(-2,0))+b(ivec2(0,-2)))+b(ivec2(2,0)))+b(ivec2(0,2)));"
    + "vec4 r=h4(a*hf(.0770874)+h4(b(ivec2(0))*hf(.105469)));r=h4(r+c*hf(.0902099));o=h4(r+e*hf(.0563354));}";

// SDR storage quantizes at each pass. Keep its hardware-half compiler context separate from precise HDR mips.
const H_BYTE = H + "vec4 hread(vec4 x){return h4(x);}\n";
export const FIRST_MIP_FRAGMENT_8 = H_BYTE + FIRST_MIP_FRAGMENT.slice(H_MIP.length);
export const DOWNSAMPLE_FRAGMENT_8 = H_BYTE + DOWNSAMPLE_FRAGMENT.slice(H_MIP.length);

// one pixel per instance: mean luminance of base texels a0 = (x0, y0, x1, y1), 16 bits in rg. uW = 2 / width, first pixel
export const LUMA_VERTEX = "#version 300 es\nlayout(location=0) in vec4 a0;uniform vec2 uW;flat out vec4 v0;"
    + "void main(){v0=a0;gl_Position=vec4((float(gl_InstanceID)+uW.y+.5)*uW.x-1.,0.,0.,1.);gl_PointSize=1.;}";
export const LUMA_FRAGMENT = H + "uniform sampler2D uP;flat in vec4 v0;out vec4 o;"
    + "void main(){ivec4 r=ivec4(v0);vec3 s=vec3(0.);for(int y=r.y;y<r.w;y++)for(int x=r.x;x<r.z;x++)s+=texelFetch(uP,ivec2(x,y),0).rgb;"
    + "float n=float(max((r.z-r.x)*(r.w-r.y),1));float v=clamp(dot(s,vec3(.2126,.7152,.0722))/n,0.,1.)*255.;float h=floor(v);"
    + "o=vec4(h/255.,v-h,0.,1.);}";

// Keep coverage mip averages in half. An 8-bit mip rounds an exact half-covered texel to 128/255.
export const MASK_COPY_FRAGMENT = H + "uniform sampler2D uM;out float o;void main(){o=hf(texelFetch(uM,ivec2(gl_FragCoord.xy),0).a);}";
// Distance field of a coverage mask by jump flooding, on the pixel grid of the field texture (y up).
// uM R16F coverage (rows top-down, mip-mapped), uX: field pixel -> mask uv (scale xy, offset zw), uL: mask level whose
// texels match the field texels (a finer mask is averaged down to coverage).
const COVER = "uniform sampler2D uM;uniform vec4 uX;uniform float uL;float cov(vec2 p){vec2 u=p*uX.xy+uX.zw;"
    + "return (u.x<0.||u.y<0.||u.x>1.||u.y>1.)?0.:hf(textureLod(uM,u,uL).r);}";
// Refine straight raster edges from neighboring coverage samples. Preserve half-covered centers and leave
// curved or corner patches to the coverage inverse.
const SEED_FIT = `
float areaDistance(float c,vec2 n){vec2 m=abs(n);float A=max(m.x,m.y),B=min(m.x,m.y),v=min(c,1.-c);
return (2.*v*A>=B?(.5-v)*A:.5*(A+B)-sqrt(2.*A*B*v))*(c<.5?1.:-1.);}
void fittedSeed(vec2 p,inout vec2 n,inout float s){
if(s==0.)return;
float weight=0.,count=0.;vec2 sum=vec2(0.);vec3 moment=vec3(0.);
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
vec2 q=vec2(x,y);float a=cov(p+q);if(a<=0.||a>=1.)continue;
float w=a*(1.-a);vec2 v=q-areaDistance(a,n)*n;
weight+=w;count+=1.;sum+=w*v;moment+=w*vec3(v.x*v.x,v.x*v.y,v.y*v.y);}
if(count<3.||weight<=0.)return;
vec2 mean=sum/weight;vec3 C=moment/weight-vec3(mean.x*mean.x,mean.x*mean.y,mean.y*mean.y);
float gap=length(vec2(C.x-C.z,2.*C.y));if(gap<=1e-5)return;
float hi=.5*(C.x+C.z+gap),lo=.5*(C.x+C.z-gap);if(lo>.001*hi)return;
float angle=.5*atan(2.*C.y,C.x-C.z);vec2 g=vec2(-sin(angle),cos(angle));if(dot(g,n)<0.)g=-g;
float d=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
vec2 q=vec2(x,y);float a=cov(p+q);if(a<=0.||a>=1.)continue;d+=a*(1.-a)*(areaDistance(a,g)-dot(q,g));}
n=g;s=d/weight;}
`;
// seeds: texels the outline passes through (partly covered ones, and full ones next to an empty one where the outline
// runs along the texel edge). Each holds the point of the outline next to its center: b = distance of the
// center to the outline (positive outside), a = angle of the outline normal (100 = no seed), rg = offset to the seed
// texel (0 here). The normal is the Sobel gradient of the coverage; the distance is the inverse of the texel coverage for
// a straight edge of that direction (A = larger, B = smaller component of the normal): 0.5 - c = s / A while the edge
// cuts opposite sides, c = ((A + B) / 2 - s)^2 / (2 A B) once it cuts a corner off.
export const FIELD_SEED_FRAGMENT = H + COVER + SEED_FIT + "out vec4 o;void main(){vec2 p=gl_FragCoord.xy;float a=cov(p);"
    + "float l=cov(p-vec2(1.,0.)),r=cov(p+vec2(1.,0.)),d=cov(p-vec2(0.,1.)),u=cov(p+vec2(0.,1.));"
    + "if(!((a>0.&&a<1.)||(a>=1.&&(l<=0.||r<=0.||d<=0.||u<=0.)))){o=vec4(0.,0.,0.,100.);return;}"
    + "float tl=cov(p+vec2(-1.,1.)),tr=cov(p+vec2(1.,1.)),bl=cov(p+vec2(-1.,-1.)),br=cov(p+vec2(1.,-1.));"
    + "vec2 g=vec2(tl+2.*l+bl-tr-2.*r-br,bl+2.*d+br-tl-2.*u-tr);float gn=length(g);vec2 n=gn>0.?g/gn:vec2(1.,0.);"
    + "vec2 m=abs(n);float A=max(m.x,m.y),B=min(m.x,m.y),c=min(a,1.-a);"
    + "float s=(2.*c*A>=B?(.5-c)*A:.5*(A+B)-sqrt(2.*A*B*c))*(a<.5?1.:-1.);"
    + "fittedSeed(p,n,s);o=vec4(0.,0.,s,atan(n.y,n.x));}";
// one flood step of uJ texels: among the nine neighbours keep the seed whose outline point is nearest
export const FIELD_JUMP_FRAGMENT = H + "uniform sampler2D uS;uniform int uJ;out vec4 o;void main(){ivec2 p=ivec2(gl_FragCoord.xy),"
    + "z=textureSize(uS,0);vec4 best=vec4(0.,0.,0.,100.);float bd=1e20;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=p+ivec2(i,j)*uJ;"
    + "if(q.x<0||q.y<0||q.x>=z.x||q.y>=z.y)continue;vec4 v=texelFetch(uS,q,0);if(v.w>50.)continue;"
    + "vec2 f=vec2(ivec2(i,j)*uJ)+v.xy,e=f-v.z*vec2(cos(v.w),sin(v.w));float l=dot(e,e);if(l<bd){bd=l;best=vec4(f,v.zw);}}o=best;}";
// signed distance in points (uK = points per texel): the outline next to the seed is a piece of a straight line through
// its outline point, one texel long; the sign comes from the coverage
// Encode each side of the distance range separately, with half-rounded shape alpha accumulated into
// the half distance plane. The normalized minimum is applied before the rounded 1-alpha boundary, not in points.
// The small-span producer first stores at 1/510, samples in half, then copies to 10-bit UNORM and samples in half again.
const FIELD_PACKED = "float storedDistance(float v){return hf(roundEven(clamp(v,0.,1.)*510.)/510.);}"
    + "float packedSample(float v){return hf(roundEven(clamp(v,0.,1.)*1023.)/1023.);}";
export const FIELD_ENCODING = FIELD_PACKED + "float encodeDistance(float d,vec2 e){if(e.y<=0.)return d;"
    + "float b=hf(e.y/(e.y-e.x)),a=hf(1.-max(hf(clamp(abs(d)/(d<0.?-e.x:e.y),0.,1.)),hf(.001501080)));"
    + "float v=d<0.?hf(b+hf(hf(1.-b)*hf(1.-a))):hf(b*a);return e.y-e.x<32.?storedDistance(v):v;}";
export const FIELD_DISTANCE_FRAGMENT = H_MIP + COVER + FIELD_ENCODING + "uniform sampler2D uS;uniform float uK;uniform vec2 uE;out vec4 o;void main(){"
    + "vec2 p=gl_FragCoord.xy;vec4 v=texelFetch(uS,ivec2(p),0);float a=cov(p);"
    + "if(v.w>50.){o=vec4(a>=.5?-1e4:1e4,0.,0.,uE.y>0.?0.:1.);return;}"
    + "vec2 n=vec2(cos(v.w),sin(v.w)),w=v.z*n-v.xy;float e=dot(w,n),t=abs(dot(w,vec2(-n.y,n.x)))-.5;"
    + "float d=(a>=.5?-1.:1.)*(t>0.?length(vec2(e,t)):abs(e))*uK;o=vec4(encodeDistance(d,uE),0.,0.,1.);}";
// Filter each axis with four symmetric bilinear pairs. Keep the original
// distance separate: only the direction uses the filtered field. Samples are half, accumulation is Float.
export const FIELD_BLUR_FRAGMENT = H_MIP + "uniform sampler2D uS;uniform vec2 uA;out vec4 o;"
    + "float D(vec2 p){return hf(textureLod(uS,p/vec2(textureSize(uS,0)),0.).x);}"
    + "void main(){vec2 p=gl_FragCoord.xy;float v=0.;"
    + "v+=.18218441307544708*(D(p-uA*.6575354933738708)+D(p+uA*.6575354933738708));"
    + "v+=.17575673758983612*(D(p-uA*2.449155807495117)+D(p+uA*2.449155807495117));"
    + "v+=.10040872544050217*(D(p-uA*4.409182071685791)+D(p+uA*4.409182071685791));"
    + "v+=.04165012389421463*(D(p-uA*6.3703742027282715)+D(p+uA*6.3703742027282715));o=vec4(hf(v),0.,0.,1.);}";
// r = decoded point distance, gb = decoded gradient from the two filtered axes. The compiled packed decoder fuses
// its half coefficient multiply/add before rounding; retain the captured magnitude when the field is later sampled.
export const FIELD_NORMAL_FRAGMENT = H_MIP + FIELD_PACKED + "uniform sampler2D uS;uniform sampler2D uD;uniform vec2 uZ;out vec4 o;"
    + "float D(ivec2 q){return texelFetch(uS,clamp(q,ivec2(0),textureSize(uS,0)-1),0).x;}"
    + "void main(){ivec2 p=ivec2(gl_FragCoord.xy);"
    + "float x=hf(D(p+ivec2(1,0))-D(p-ivec2(1,0))),y=hf(D(p+ivec2(0,1))-D(p-ivec2(0,1)));"
    + "vec4 base=texelFetch(uD,p,0);float l=length(vec2(x,y));vec2 n=l>0.?vec2(x,y)/l:vec2(0.);"
    + "bool packed=uZ.x<0.&&uZ.x> -32.;float v=packed?packedSample(base.x):base.x,d=base.a>0.?hf(v*uZ.x+uZ.y):1e4;"
    + "if(packed){n=base.x>0.?h2(.5-.5*n):vec2(0.);n=vec2(packedSample(storedDistance(n.x)),packedSample(storedDistance(n.y)));"
    + "n=h2(n*hf(2.0019569396972656)-1.);}else n=h2(l>0.?sign(uZ.x)*n:vec2(0.,1.));o=vec4(d,n,1.);}";

const NAMES = ["OUTER", "FILL", "FACE", "LUMA", "BLEED", "SHADOW", "SHADOW_SAMPLE", "RING", "EDGE", "HOLD", "CLAMP", "CLAMP_HUE",
    "ABERRATION", "LIGHTS", "RIM_SPLIT", "RIM_HUE", "TINT", "LENS", "ROUND", "SHARP", "UNEVEN", "FIELD", "VEIL", "FADE"];
const BITS = [FEATURE_OUTER, FEATURE_FILL, FEATURE_FACE, FEATURE_LUMA, FEATURE_BLEED, FEATURE_SHADOW, FEATURE_SHADOW_SAMPLE,
    FEATURE_RING, FEATURE_EDGE, FEATURE_HOLD, FEATURE_CLAMP, FEATURE_CLAMP_HUE, FEATURE_ABERRATION, FEATURE_LIGHTS,
    FEATURE_RIM_SPLIT, FEATURE_RIM_HUE, FEATURE_TINT, FEATURE_LENS, FEATURE_ROUND_NORMAL, FEATURE_SHARP, FEATURE_UNEVEN,
    FEATURE_FIELD, FEATURE_VEIL, FEATURE_FADE];

const R = (row: number): string => "m[" + row + "]";
const BL = R(ROW_BLUR), LE = R(ROW_LENS), KN = R(ROW_KNOT), SL = R(ROW_SLOPE), DR = R(ROW_DROP), MX = R(ROW_MIX);
const FM = R(ROW_FACE_MORE), BE = R(ROW_BLEED), BM = R(ROW_BLEED_MORE), SH = R(ROW_SHADOW), SN = R(ROW_SHADOW_LENS);
const SM = R(ROW_SHADOW_MORE), RG = R(ROW_RING), RM = R(ROW_RING_MORE), ED = R(ROW_EDGE), EM = R(ROW_EDGE_MORE), HO = R(ROW_HOLD);
const CM = R(ROW_CLAMP), FG = R(ROW_FRINGE), KY = R(ROW_RIM_KEY), KM = R(ROW_RIM_KEY_MORE), FL = R(ROW_RIM_FILL);
const FX = R(ROW_RIM_FILL_MORE), RA = R(ROW_RIM_ALPHA), TM = R(ROW_TINT_MORE), LL = R(ROW_LENS_LAYER), LD = R(ROW_LENS_DIR);
const LF = R(ROW_LENS_FADE), FR = R(ROW_FRAME), CO = R(ROW_CORNER), RO = R(ROW_ROUND), RN = R(ROW_REGION), CL = R(ROW_CLAMP_RECT);
const TX = R(ROW_TEXEL), RA2 = R(ROW_RADII), EG = R(ROW_EDGE_ROUND), TP = R(ROW_TOP);
// three rows (rgb) or four rows (rgba) of a color matrix applied to c
const M3 = (row: number, c: string): string => "h3(vec3(dotHalf(" + c + "," + R(row) + ".xyz),dotHalf(" + c + "," + R(row + 1)
    + ".xyz),dotHalf(" + c + "," + R(row + 2) + ".xyz))+vec3(" + R(row) + ".w," + R(row + 1) + ".w," + R(row + 2) + ".w))";
const M4 = (row: number, c: string): string => "matrix4(" + c + ",h4(" + R(row) + "),h4(" + R(row + 1) + "),h4(" + R(row + 2) + "),h4(" + R(row + 3) + "))";

// smooth-corner depth for corner coordinates c (corner zone origin 0, edge at 1), blended to the circular one by k
const CURVE = "float rho=length(c),b=max(c.x,c.y),t=b>0.?sat(min(c.x,c.y)/b):0.;"
    + "float Q=(((-.926054*t+3.15601)*t-3.64122)*t+1.26803)*t+.268531;";
const DEPTH = "hf(mix(mix(rho+1.-1./(1.-t*t*sat(rho)*Q),.3458344340324402+.6541655659675598*length(max(E*c-.528665,0.)),kk.x),"
    + "mix(rho+1.-1./(1.-t*t*sat(rho)*Q),.3458344340324402+.6541655659675598*length(max(E*c-.528665,0.)),kk.y),"
    + "sat(.5-(c.y>c.x?1.:-1.)+(c.y>c.x?1.:-1.)*t))-1.)";
const OVAL = (ratio: string): string => "vec2 v=vec2(q.x,q.y*" + ratio + ");v=h2(v/max(length(v),1e-12));"
    + "n=blendNormal(n,v,hf(" + MX + ".z));";

const BODY = `const vec3 L=vec3(.2126,.7152,.0722);const vec3 LB=vec3(.2125,.7154,.0721);const float E=${SMOOTH_REACH};
float sat(float x){return clamp(x,0.,1.);}
vec2 sat2(vec2 x){return clamp(x,0.,1.);}
// Explicit binary16 nearest-even boundary for the normal's reciprocal square root.
float hfBits(float x){highp uint b=floatBitsToUint(x),a=b&0x7fffffffu,sign=b&0x80000000u;
if(a>=0x7f800000u)return x;if(a>=0x477ff000u)return uintBitsToFloat(sign|0x7f800000u);
if(a<0x38800000u){float v=roundEven(abs(x)*16777216.)*.000000059604644775390625;return uintBitsToFloat(floatBitsToUint(v)|sign);}
return uintBitsToFloat((b+0xfffu+((b>>13)&1u))&0xffffe000u);}
// Float complement, rounded first product, then half multiply-add; the dot follows the same order.
vec2 blendNormal(vec2 n,vec2 v,float t){n=h2(h2(h2(n)*(1.-t))+v*t);
float length2=hf(hf(n.x*n.x)+n.y*n.y);return h2(n*hfBits(inversesqrt(length2)));}
// Half dot: first product rounds, then each following multiply-add rounds once.
float dotHalf(vec3 a,vec3 b){float v=hf(a.x*b.x);v=hf(v+a.y*b.y);return hf(v+a.z*b.z);}
#ifdef HDR_BLEND
vec3 destination(vec2 p){
#ifdef NATIVE_Y
p.y=f[2].y-p.y;
#endif
return texelFetch(uD,ivec2(p),0).rgb;}
vec4 finishPixel(vec4 v,vec2 p){v=h4(v);return vec4(h3(v.rgb+destination(p)*hf(1.-v.a)),1.);}
#else
vec4 finishPixel(vec4 v,vec2 p){return v;}
#endif
// displacement of a lookup: A at the rim, falling to 0 at depth H (i = 1/H)
float lens(float a,float i,float d){a=hf(a);float u=sat(hf(hf(-d)*hf(i)));return hf(a-sat(hf(sqrt(hf(u*hf(2.-u)))))*a);}
// level of a radius in base texels: the pyramid texture starts at its low level (m), whose texels the system measures it in
float lodOf(float r){float m=${TX}.w;r=hf(r*exp2(-m));return max(hf(log2(r<2.?hf(r*.5+1.):r)),0.)+m;}
// what a layer drawn before the next one leaves in an 8-bit target: clipped and rounded to 8 bits
vec3 store(vec3 c){return f[0].z>0.?floor(clamp(c,0.,1.)*255.+.5)/255.:c;}
vec2 HT;vec2 RC,RS;
// Native compiled sampling retains Float UV; forcing half here shifts sharp Clear backdrops.
vec2 refractAt(vec2 p,float amount,float s,vec2 n){vec2 dn=h2(s*n*${RN}.xy/RS);return (((vU+hf(amount)*dn)*RS+RC)-${RN}.zw)/${RN}.xy;}
// the pyramid at pixel position p and level l, held inside the region
vec4 tap4(vec2 p,float l){l=min(l,${RO}.w);vec2 e=HT*exp2(ceil(l));return h4(textureLod(uP,clamp(p*${RN}.xy+${RN}.zw,${CL}.xy+e,${CL}.zw-e),l));}
vec3 clean(vec3 c){return mix(c,vec3(0.),lessThan(abs(c),vec3(hf(.000100017))));}
vec3 tap(vec2 p,float l){vec4 v=tap4(p,l);return h3(clean(v.rgb)/max(v.a,hf(.000100017)));}
// blur weight against the refracted distance
float weight(float x){x=hf(x);vec3 ramp=h3(clamp((vec3(x)-${KN}.xyz)*${SL}.xyz,0.,1.));vec3 v=h3(ramp*${DR}.xyz);return hf(${SL}.w-hf(hf(v.x+v.y)+v.z));}
// 0.5 erfc on [-2, 2] (odd polynomial)
float gaussianAt(float z,float scale){float x=hf(hf(sat(hf(z*scale+.5))*4.)-2.),x2=hf(x*x);float p=hf(hf(.00295448)*x2+hf(-.0344543));p=hf(p*x2+hf(.168213));p=hf(p*x2+hf(-.560546));return hf(p*x+.5);}
float gauss(float z){return gaussianAt(z,.25);}
// Preserve the native ring contractions before evaluating the Gaussian polynomials.
float ringAlpha(float distance,float inverse,float offset,float opacity,float coverage,float mask){
float scale=hf(.176758),inner=hf(distance*inverse+offset);
float band=hf(sat(hf(gaussianAt(distance,hf(inverse*scale))-gaussianAt(inner,scale))));
return hf(band*hf(opacity*hf(hf(1.-mask)+coverage*mask)));}
// The material ABI supplies half RGB bias and a Float opacity; construct half before premultiplying.
vec4 shadowPixel(vec4 colour,float strength){return h4(h4(colour)*strength);}
vec4 mixBody(vec4 shadow,vec4 face,float coverage){return h4(h4(shadow*(1.-coverage))+face*coverage);}
// Native face fill rounds the remaining product, then the darken and lighten FMA results.
vec3 fillColour(vec3 c,vec3 g,float lighten,float darken,float normal){
vec3 x=h3(hf(1.-hf(darken+lighten))*c);
x=h3(x+darken*min(c,g));x=h3(x+lighten*max(c,g));
return h3(h3(x*(1.-normal))+g*normal);}
// A binary16 product is exact in Float. At a half midpoint, recover the sum's remainder before rounding.
float floatBoundary(float x){return uintBitsToFloat(floatBitsToUint(x)^uHalfBarrier);}
float halfFMA(float a,float b,float c){
float p=floatBoundary(a*b),v=floatBoundary(p+c);
uint bits=floatBitsToUint(v),magnitude=bits&0x7fffffffu;
bool midpoint=magnitude>=0x38800000u?(magnitude<=0x477ff000u&&(magnitude&0x1fffu)==0x1000u):fract(abs(v)*16777216.)==.5;
if(!midpoint)return hf(v);
float q=floatBoundary(v-p);
float residual=floatBoundary(floatBoundary(p-floatBoundary(v-q))+floatBoundary(c-q));
if(residual==0.)return hf(v);
return hf(uintBitsToFloat(bits+((v>0.)==(residual>0.)?1u:0xffffffffu)));}
// Share half packing and the usual non-midpoint path across the colour channels.
vec4 floatBoundary4(vec4 x){return uintBitsToFloat(floatBitsToUint(x)^uvec4(uHalfBarrier));}
vec4 halfFMA4(vec4 a,vec4 b,vec4 c){
vec4 p=floatBoundary4(a*b),v=floatBoundary4(p+c);
uvec4 bits=floatBitsToUint(v),magnitude=bits&uvec4(0x7fffffffu);
uvec4 normal=uvec4(greaterThanEqual(magnitude,uvec4(0x38800000u)));
uvec4 normalMid=normal*uvec4(lessThanEqual(magnitude,uvec4(0x477ff000u)))*uvec4(equal(magnitude&uvec4(0x1fffu),uvec4(0x1000u)));
uvec4 subMid=(uvec4(1u)-normal)*uvec4(equal(fract(abs(v)*16777216.),vec4(.5)));
bvec4 midpoint=notEqual(normalMid+subMid,uvec4(0u));
if(!any(midpoint))return h4(v);
vec4 q=floatBoundary4(v-p);
vec4 residual=floatBoundary4(floatBoundary4(p-floatBoundary4(v-q))+floatBoundary4(c-q));
uvec4 step=uvec4(equal(greaterThan(v,vec4(0.)),greaterThan(residual,vec4(0.))))*2u-1u;
bvec4 correct=bvec4(midpoint.x&&residual.x!=0.,midpoint.y&&residual.y!=0.,midpoint.z&&residual.z!=0.,midpoint.w&&residual.w!=0.);
return h4(uintBitsToFloat(bits+step*uvec4(correct)));}
vec4 halfFMA4(vec4 a,float b,vec4 c){return halfFMA4(a,vec4(b),c);}
vec3 halfFMA3(vec3 a,vec3 b,vec3 c){return halfFMA4(vec4(a,0.),vec4(b,0.),vec4(c,0.)).rgb;}
vec4 mixOuter(vec4 base,vec4 outside,float weight){return halfFMA4(outside,weight,halfFMA4(base,-weight,base));}
vec3 mixHalf3(vec3 base,vec3 colour,float weight){
vec3 first=halfFMA3(base,vec3(-weight),base);
return halfFMA3(colour,vec3(weight),first);}
float dotHalfExact(vec3 a,vec3 b){return halfFMA(a.z,b.z,halfFMA(a.y,b.y,hf(a.x*b.x)));}
float bleedWeight(vec3 c,float ramp,float gain,float bias,float opacity){
float y=sat(dotHalfExact(c,h3(LB))),v=halfFMA(gain,y,bias),q=hf(hf(v*v)*ramp);
return hf(hf(q*q)*opacity);}
vec3 edgeSolid(vec3 toned,vec3 premultiplied,float alpha){float inverse=hf(1.-alpha);
return halfFMA3(toned,vec3(inverse),premultiplied);}
vec3 edgeColour(vec3 solid,vec3 raw,float bias,float alpha){
vec3 inner=halfFMA3(vec3(-2.),solid,vec3(3.));
vec3 factor=halfFMA3(vec3(bias),inner,vec3(1.));
vec3 seed=h3(-hf(1.-alpha)*raw);
return halfFMA3(factor,solid,seed);}
bool invisibleBody(float coverage,float strength,float ring,float highlight){
return coverage==0.&&strength<hf(.000100017)&&ring<hf(.000100017)&&highlight<hf(.000100017);}
// Vibrant layers accumulate matrix columns in half, with a half destination input.
vec4 matrix4(vec3 c,vec4 r0,vec4 r1,vec4 r2,vec4 r3){c=h3(c);
vec4 v=vec4(r0.w,r1.w,r2.w,r3.w);v=h4(v+c.x*vec4(r0.x,r1.x,r2.x,r3.x));
v=h4(v+c.y*vec4(r0.y,r1.y,r2.y,r3.y));return h4(v+c.z*vec4(r0.z,r1.z,r2.z,r3.z));}
#ifdef TINT
uniform highp sampler2D uTintMask;
// Generic native tint starts at the bias and rounds each half FMA once.
vec4 tintMatrix4(vec3 c,vec4 r0,vec4 r1,vec4 r2,vec4 r3){c=h3(c);
vec4 v=vec4(r0.w,r1.w,r2.w,r3.w);
v=halfFMA4(vec4(r0.x,r1.x,r2.x,r3.x),c.x,v);
v=halfFMA4(vec4(r0.y,r1.y,r2.y,r3.y),c.y,v);
return halfFMA4(vec4(r0.z,r1.z,r2.z,r3.z),c.z,v);}
// Texture61/blend42 produces a separate premultiplied foreground, then texture60 masks it.
vec4 tintForeground(vec4 backdrop,float gradientCoverage,float fillCoverage,float distance){
vec3 straight=h3(backdrop.rgb/max(backdrop.a,hf(.000100017)));
vec4 mapped=${M4(ROW_TINT, "straight").replace("matrix4(", "tintMatrix4(")};
// packTint's alpha row is the input-alpha column, with no RGB terms or bias.
mapped.a=hf(mapped.a*backdrop.a);
float alpha=hf(sat(mapped.a));
float coordinate=(-distance-1.)*(-.09090909361839294);
float mask=hf(texture(uTintMask,vec2(coordinate,.5)).a);
// Keep the weighted alpha store before RGB premultiplication.
float weight=hf(mask*gradientCoverage),weightedAlpha=hf(alpha*weight);vec4 result=vec4(h3(mapped.rgb*weightedAlpha),weightedAlpha);
float limit=hf(${TM}.x);
if(limit>0.){vec3 rgb=h3(result.rgb/max(result.a,hf(.000100017)));
rgb=clamp(rgb,-.75,limit);result=vec4(h3(rgb*result.a),result.a);}
return h4(result*fillCoverage);}
#endif
#ifdef FACE
// face colour: maximum luminance, then the YCC matrix
vec3 faceMatrix(vec3 c){
#ifdef LUMA
float y=dotHalf(h3(L),c),k=sat(hf(1.-y*hf(${FM}.x)));float sr=hf(1.+hf(1.-k)*hf(.3));
vec3 a=vec3(hf(k*y)),b=h3(k*c);c=h3(h3(a*hf(1.-sr))+b*sr);
#endif
return ${M3(ROW_FACE, "c")};}
#endif
#if defined(UNEVEN)
float corner(vec2 p,vec2 h,float r,vec2 kk,out vec2 u){
if(r<=0.){u=p-h;return max(u.x,u.y);}
float e0=E*r;u=p-h+mix(e0,r,max(kk.x,kk.y));vec2 c=max((p-h+e0)/e0,0.);${CURVE}
return hf(min(max(hf(u.x),hf(u.y)),0.)+hf(e0*(${DEPTH})));}
// four corners of their own radius (+x+y, -x+y, -x-y, +x-y; y up) and the roundness of the edges (top, bottom, right, left)
float uneven(vec2 q,vec2 h,vec4 ra,vec4 ed,float ar,out vec2 n){vec2 u,w;vec2 sg=vec2(1.);float d=corner(q,h,ra.x,ed.xz,u);
float e=corner(vec2(-q.x,q.y),h,ra.y,ed.xw,w);if(e>d){d=e;u=w;sg=vec2(-1.,1.);}
e=corner(-q,h,ra.z,ed.yw,w);if(e>d){d=e;u=w;sg=vec2(-1.);}
e=corner(vec2(q.x,-q.y),h,ra.w,ed.yz,w);if(e>d){d=e;u=w;sg=vec2(1.,-1.);}
w=max(u,0.);float l=length(w);n=(l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.)))*sg;
#ifdef ROUND
${OVAL("ar")}
#else
n=h2(h2(n)*hf(inversesqrt(hf(dot(h2(n),h2(n))))));
#endif
return d;}
float unevenDist(vec2 q,vec2 h,vec4 ra,vec4 ed){vec2 u;return max(max(corner(q,h,ra.x,ed.xz,u),corner(vec2(-q.x,q.y),h,ra.y,ed.xw,u)),
max(corner(-q,h,ra.z,ed.yw,u),corner(vec2(q.x,-q.y),h,ra.w,ed.yz,u)));}
#endif
#if defined(GROUP)
float box(vec2 q,vec2 h,vec4 g,vec2 kk,out vec2 n){vec2 a=abs(q),u;float d;
if(g.x<=0.){u=a-h;d=max(u.x,u.y);n=u.x>u.y?vec2(1.,0.):vec2(0.,1.);}
else{u=a-h+g.z;vec2 c=max((a-h+g.y)/g.y,0.);${CURVE}
d=hf(min(max(hf(u.x),hf(u.y)),0.)+hf(g.y*(${DEPTH})));
vec2 w=max(u,0.);float l=length(w);n=l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.));}
n=h2(n)*vec2(q.x>=0.?1.:-1.,q.y>=0.?1.:-1.);
#ifdef ROUND
${OVAL("g.w")}
#else
n=h2(h2(n)*hf(inversesqrt(hf(dot(h2(n),h2(n))))));
#endif
return d;}
#ifdef FIELD
// distance and direction of a mask member from field texture k (no derivatives: lookups sit in varying control flow)
float field(int k,vec2 u,out vec2 n){vec4 w=k==0?textureLod(uF0,u,0.):k==1?textureLod(uF1,u,0.):k==2?textureLod(uF2,u,0.):textureLod(uF3,u,0.);
n=dot(w.yz,w.yz)>0.?w.yz:vec2(0.,1.);return w.x;}
#endif
// member rows: centre + half extents | r, reach0, reach, hx/hy | kx, ky, kind, field | radii or field uv | edges
float member(int i,vec2 q,out vec2 n){vec4 c=mb[i*5+2];
#ifdef UNEVEN
if(c.z==1.)return uneven(q,mb[i*5].zw,mb[i*5+3],mb[i*5+4],mb[i*5+1].w,n);
#endif
#ifdef FIELD
if(c.z==2.)return field(int(c.w),q*mb[i*5+3].xy+mb[i*5+3].zw,n);
#endif
return box(q,mb[i*5].zw,mb[i*5+1],c.xy,n);}
// smooth union: k = spacing sat((1 - g_a.g_b) / 2); the direction is mixed, not normalised again
float shape(vec2 p,out vec2 g){float d=1e4,lo=1e9,sp=${TX}.z;int s=0;g=vec2(0.);
// a member replaces everything folded before it when those are all farther by more than the merge distance:
// lower bound of the earlier ones (box distance, less sp/4 per fold) against its upper bound (box distance + half its
// largest radius); a mask member has no such bound
for(int i=1;i<GROUP;i++){vec2 e=abs(p-mb[i*5-5].xy)-mb[i*5-5].zw;lo=min(lo,max(e.x,e.y));
e=abs(p-mb[i*5].xy)-mb[i*5].zw;if(mb[i*5+2].z<1.5&&lo-float(i-1)*.25*sp>=length(max(e,0.))+min(max(e.x,e.y),0.)+.52*mb[i*5+1].x+sp)s=i;}
for(int i=s;i<GROUP;i++){vec2 q=p-mb[i*5].xy,e=abs(q)-mb[i*5].zw;
if(max(e.x,e.y)>=d+sp)continue;
vec2 n;float b=member(i,q,n);
float k=max(sp*sat(.5-.5*dot(n,g)),1e-6),h=sat(.5+.5*(d-b)/k);d=mix(d,b,h)-k*h*(1.-h);g=mix(g,n,h);}
return d;}
float dist(vec2 p){vec2 g;return shape(p,g);}
#elif defined(FIELD)
float dist(vec2 q){return texture(uF,q*${RA2}.xy+${RA2}.zw).x;}
float shape(vec2 q,out vec2 n){vec4 w=texture(uF,q*${RA2}.xy+${RA2}.zw);n=dot(w.yz,w.yz)>0.?w.yz:vec2(0.,1.);return w.x;}
#elif defined(UNEVEN)
float shape(vec2 q,out vec2 n){return uneven(q,${FR}.zw,${RA2},${EG},${RO}.z,n);}
float dist(vec2 q){return unevenDist(q,${FR}.zw,${RA2},${EG});}
#else
float dist(vec2 q){vec2 a=abs(q),h=${FR}.zw;
#ifdef SHARP
vec2 u=a-h;return length(max(u,0.))+min(max(u.x,u.y),0.);
#else
float e0=${CO}.y;vec2 u=a-h+${CO}.z;vec2 c=max((a-h+e0)/e0,0.);${CURVE}
vec2 kk=${RO}.xy;return hf(min(max(hf(u.x),hf(u.y)),0.)+hf(e0*(${DEPTH})));
#endif
}
float shape(vec2 q,out vec2 n){
#ifdef SHARP
vec2 u=abs(q)-${FR}.zw;n=u.x>u.y?vec2(1.,0.):vec2(0.,1.);
#else
vec2 u=abs(q)-${FR}.zw+${CO}.z;vec2 w=max(u,0.);float l=length(w);n=l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.));
#endif
n=h2(n)*vec2(q.x>=0.?1.:-1.,q.y>=0.?1.:-1.);
#ifdef ROUND
${OVAL(RO + ".z")}
#else
n=h2(h2(n)*hf(inversesqrt(hf(dot(h2(n),h2(n))))));
#endif
return dist(q);}
#endif
#ifdef ABERRATION
// colour fringes of the face lookup: seven positions along the normal turned by the fringe angle (its components
// swapped, scaled by the texture aspect); red from the outer side, blue from the inner, each a four-tap mean
vec3 fringe(vec2 p,float d,vec2 n,float l,float s,float T){float u=sat(${CM}.w*(-d-${FG}.x)),a=${CM}.z-sat(sqrt(u*(2.-u)))*${CM}.z;
vec2 r=vec2(${FG}.y*n.x-${FG}.z*n.y,${FG}.z*n.x+${FG}.y*n.y);vec2 ax=a*s*vec2(r.y*${TX}.y,r.x/${TX}.y);float q=.25*(l-${TX}.w)*T*exp2(${TX}.w);
vec3 c=vec3(0.);float t=1.,alpha=0.;
for(int i=0;i<3;i++){vec2 pp=p+t*ax;vec4 v=h4(h4(h4(h4(tap4(pp+vec2(q,-q),l)+tap4(pp+q,l))+tap4(pp+vec2(-q,q),l))+tap4(pp-q,l))*.25);
vec3 rgb=h3(clean(v.rgb)/max(v.a,hf(.000100017)));c.r=hf(t*rgb.r+c.r);c.g=hf((1.-t)*rgb.g+c.g);alpha=hf(alpha+v.a);t-=.3333333432674408;}
t=0.;for(int i=0;i<4;i++){vec2 pp=p-t*ax;vec4 v=h4(h4(h4(h4(tap4(pp+vec2(q,-q),l)+tap4(pp+q,l))+tap4(pp+vec2(-q,q),l))+tap4(pp-q,l))*.25);
vec3 rgb=h3(clean(v.rgb)/max(v.a,hf(.000100017)));c.g=hf((1.-t)*rgb.g+c.g);c.b=hf(t*rgb.b+c.b);alpha=hf(alpha+v.a);t+=.3333333432674408;}
alpha=hf(alpha*.1428571492433548);c=h3(c*vec3(.5,hf(.333252),.5));
// The premultiplied helper retains blue and squares alpha; normalize only after this boundary.
return h3(vec3(h2(c.rg*alpha),c.b)/max(hf(alpha*alpha),hf(.000100017)));}
#endif
#ifdef LIGHTS
// one bright band: its height, curvature, the projection of the light on the normal and the cosine of its spread
float band(float e,float h,float cv,float pj,float cs,float fe){float u=sat(e/h);
float lobe=hf(sat((pj-cs)/max(hf(1.-cs),hf(.000100017))));
return hf(sat(e/fe+.5)*mix(u<1.?1.:0.,1.-u,cv)*sat((h-e)/fe+.5)*lobe);}
float bias(float v,float k){return hf(v/max(hf(hf(k+1.)-k*v),hf(1e-4)));}
// colour c under a light of strength h, recoloured through the matrix rows r0..r3
vec3 rim(vec3 c,float h,vec4 r0,vec4 r1,vec4 r2,vec4 r3){c=h3(c);
vec4 v=matrix4(c,r0,r1,r2,r3);
float a=hf(sat(hf(v.a))*hf(h));
#ifdef RIM_HUE
float pk=max(v.r,max(v.g,v.b));vec3 k=v.rgb*(pk>${RA}.z?${RA}.z/max(pk,1e-12):1.);
#else
vec3 k=clamp(v.rgb,-.75,${RA}.z);
#endif
return h3(h3(k*a)+c*hf(1.-a));}
#endif
void main(){vec2 px=gl_FragCoord.xy;
#ifdef NATIVE_Y
#ifndef WORLD_Y
px.y=f[2].y-px.y;
#endif
#endif
float s=f[0].x,kt=${CO}.w,T=${TX}.x;HT=${RN}.xy*(.5*T);
#if !defined(OUTER) && !defined(FILL) && !defined(FACE) && !defined(BLEED) && !defined(SHADOW) && !defined(RING) && !defined(EDGE) && !defined(HOLD) && !defined(ABERRATION) && !defined(LIGHTS) && !defined(TINT) && !defined(LENS) && !defined(VEIL)
if(${BL}.x==0.&&${LE}.x==0.){vec3 raw=bk(px).rgb;
#ifdef CLAMP
#ifdef CLAMP_HUE
float peak=max(raw.r,max(raw.g,raw.b));if(peak>${CM}.x)raw*=(${CM}.x/peak);
#else
raw=clamp(raw,-.75,${CM}.x);
#endif
#endif
o=vec4(raw,1.);
#ifdef FADE
o*=${TP}.z;
#endif
o=finishPixel(o,px);
return;}
#endif
#ifdef GROUP
vec2 q=px*f[0].y;
#else
vec2 q=vQ;
#endif
vec2 n=vec2(0.);float d=0.;
#ifdef GRID
if(vMode==4)d=hf(shape(q,n));else if(vMode==0){vec2 u=h2(abs(q)-${FR}.zw);d=max(u.x,u.y);n=(u.x>u.y?vec2(1.,0.):vec2(0.,1.))*vec2(q.x>=0.?1.:-1.,q.y>=0.?1.:-1.);
#ifdef ROUND
${OVAL(RO + ".z")}
#endif
}
#else
d=hf(shape(q,n));
#endif
// Metal's half fwidth rounds each axis before adding the magnitudes.
n=h2(n);RC=${CL}.xy;RS=${CL}.zw-${CL}.xy;float fw=max(hf(hf(abs(dFdx(d)))+hf(abs(dFdy(d)))),hf(1e-4));float cov=vMode<0?0.:hf(sat(.5+hf(-d/fw)));
vec4 face=vec4(0.),sh=vec4(0.);float ring=0.,hl=0.;
#ifdef LIGHTS
// depth of the rim bands and its derivative, taken where every pixel of the quad runs (outside any branch)
#ifdef GROUP
float gn=max(length(n),1e-6);float e=-(d+${FX}.w)/gn;
#else
float e=-(d+${FX}.w);
#endif
/*
 * Exterior grid cells have no shape normal. Keep normalization finite;
 * rim lighting belongs to cells that evaluate the contour.
 */
float normal2=hf(dot(n,n));vec2 nl=normal2>0.?h2(n*hf(1./sqrt(normal2))):vec2(0.,1.);
float fe=max(fwidth(e),1e-4);
nl=vec2(f[2].z*nl.x-f[2].w*nl.y,f[2].w*nl.x+f[2].z*nl.y);float pj=hf(dot(${KY}.xy,nl));
float k0=band(e,${KY}.z,${FX}.z,pj,${KY}.w,fe),k1=band(e,${KM}.y,1.,pj,${KM}.z,fe);
float l0=band(e,${FL}.x,${RA}.w,-pj,${FL}.y,fe),l1=band(e,${FL}.w,1.,-pj,${FX}.x,fe);
bool bright=vMode>=0&&hf(hf(hf(hf(l0)+hf(k0))+hf(k1))+hf(l1))>=hf(.000100017)&&e>=-5.;
#endif
#ifdef EDGE
// edge shade: a band at the rim (a stroke over the outline when its offset is minus its height), two opposite lobes
{float h=${ED}.x,e=hf(${ED}.w+d),dp=-e,hw=hf(fw*.5);bool st=${EM}.y>0.;
if(h>0.&&vMode>=0&&!(e>=hw||(st?cov>=1.:h+hw<=dp))){float iv=hf(1./fw),cu=1.;
if(!st){float u=hf(1.-sat(hf(dp/h)));cu=hf(mix(u!=0.?1.:0.,u,.75));}
float w=hf(hf(cu*(st?hf(1.-cov):sat(hf(hf(e+h)*iv+.5))))*sat(hf(dp*iv+.5))),pj=hf(dot(${RM}.zw,n));
vec2 v=h2(h2(sat2(h2(vec2(pj,-pj)-${ED}.y)*hf(1./max(hf(1.-${ED}.y),hf(1e-4)))))*w);v=h2(v/max(h2(h2(${ED}.z*h2(1.-v))+1.),vec2(hf(1e-4))));hl=hf(v.x+v.y);}}
#endif
#ifdef RING
// ring shadow: the blurred band between the outline moved down and the same outline grown by the stroke width
if(cov>0.||${RM}.y<1.)ring=ringAlpha(hf(dist(q+${RG}.xy)),${RG}.z,${RG}.w,${RM}.x,cov,${RM}.y);
#endif
#ifdef SHADOW
if(cov<1.){float a=hf(hf(gauss(hf(dist(q+${SH}.xy)*${SH}.z)))*${SH}.w);
// The body has no contribution below this boundary; the integrated rim may still draw.
if(invisibleBody(cov,a,ring,hl)
#ifdef LIGHTS
&&!bright
#endif
)discard;
#ifdef SHADOW_SAMPLE
vec3 b=tap(refractAt(px,lens(${SN}.x,${SN}.y,hf(d+${SN}.z)),s,n),lodOf(${BL}.y*kt));
sh=shadowPixel(vec4(${SN}.w*vec3(dot(b,${R(ROW_SHADOW_MATRIX)}.xyz),dot(b,${R(ROW_SHADOW_MATRIX + 1)}.xyz),dot(b,${R(ROW_SHADOW_MATRIX + 2)}.xyz))
+vec3(${R(ROW_SHADOW_MATRIX)}.w,${R(ROW_SHADOW_MATRIX + 1)}.w,${R(ROW_SHADOW_MATRIX + 2)}.w),mix(${SM}.x,1.,${SN}.w)),a);
#else
sh=shadowPixel(vec4(${R(ROW_SHADOW_MATRIX)}.w,${R(ROW_SHADOW_MATRIX + 1)}.w,${R(ROW_SHADOW_MATRIX + 2)}.w,${SM}.x),a);
#endif
}
#endif
if(cov>0.){float di=lens(${LE}.x,${LE}.y,d),lb=lodOf(${BL}.x*kt*weight(hf(d+di))),ca=1.;vec2 p=refractAt(px,di,s,n);
#ifdef ABERRATION
vec3 c=fringe(p,d,n,lb,s,T);
#else
// The luma body path retains this boundary; the Clear path keeps Float UV.
#ifdef LUMA
vec2 innerUV=h2((p*${RN}.xy+${RN}.zw-RC)/RS);
vec3 c=tap(((innerUV*RS+RC)-${RN}.zw)/${RN}.xy,lb);
#else
vec3 c=tap(p,lb);
#endif
#endif
#ifdef FILL
// blur fill: the undisplaced backdrop at its own blur, two taps a quarter of the level apart
{float lf=lodOf(${BL}.w*kt);vec2 st=vec2(.25*(lf-${TX}.w)*T*exp2(${TX}.w));vec4 soft=h4(h4(tap4(px+st,lf)+tap4(px-st,lf))*.5);
vec3 g=clean(h3(soft.rgb/max(soft.a,hf(.000100017))));
c=fillColour(c,g,${FM}.y,${FM}.z,${FM}.w);}
#endif
#ifdef OUTER
{float dO=lens(${LE}.z,${LE}.w,d),w=hf(${DR}.w*hf(sat((d-${MX}.x)*${MX}.y)));vec4 outside=tap4(refractAt(px,dO,s,n),lodOf(${BL}.x*kt*weight(hf(d+dO))));
vec4 mixedOuter=mixOuter(vec4(c,ca),vec4(clean(outside.rgb),outside.a),w);c=mixedOuter.rgb;ca=mixedOuter.a;}
#endif
#ifdef FACE
c=h3(mix(c,faceMatrix(c),${MX}.w));
#endif
#ifdef BLEED
// edge bleed: weight ((g Y + h)^2 ramp)^2 opacity, Y the luminance of the face
{vec3 b=tap(refractAt(px,lens(${BE}.x,${BE}.y,d),s,n),lodOf(${BL}.z*kt));b=${M3(ROW_BLEED_MATRIX, "b")};
float w=bleedWeight(c,hf(sat((d-${BE}.z)*${BE}.w)),${BM}.y,${BM}.z,${BM}.x);c=mixHalf3(c,b,w);}
#endif
face=vec4(c,ca);}
vec4 r=mixBody(sh,face,cov);
r=h4(r*hf(1.-ring)+vec4(0.,0.,0.,ring));
#ifdef EDGE
// where the result is not opaque the band goes on over the unblurred backdrop, toned towards the face
if(hl>.000100017){float a=r.a;vec3 raw=vec3(0.),so=r.rgb;
if(a<1.){raw=tap(px,${TX}.w);vec3 tn=raw;
#ifdef FACE
vec3 mp=faceMatrix(raw);if(${EM}.w>0.)mp=${EM}.x<0.?min(mp,raw):max(mp,raw);tn=mixHalf3(raw,mp,hf(${MX}.w*hl));
#endif
so=edgeSolid(tn,r.rgb,a);}
float b=hf(${EM}.x*hl),ea=hf((1.-a)*hf(${EM}.z*hl)+a);r=vec4(edgeColour(so,raw,b,ea),ea);}
#endif
#ifdef HOLD
{float w=hf(hf(1.-sat(hf(hf(d-${HO}.y)*${HO}.z)))*${HO}.x),aa=sat(r.a);vec3 toned=h3(h3(h3(hf(${HO}.w)*r.rgb)*aa)/max(r.a,hf(1e-4)));r=h4(mix(r,vec4(toned,aa),w));}
#endif
#ifdef CLAMP
{vec3 u=h3(r.rgb/max(r.a,hf(.000100017)));float limit=hf(${CM}.x);
#ifdef CLAMP_HUE
float pk=max(u.r,max(u.g,u.b));u*=pk>limit?limit/max(pk,1e-12):1.;
#else
u=clamp(u,-.75,limit);
#endif
r.rgb=h3(u*r.a);}
#endif
#ifdef EDR
r.rgb=h3(r.rgb*hf(f[3].z));
#endif
if(cov>0.||hl>.000100017
#ifdef LIGHTS
||bright
#endif
){
// the layers over the glass take the colour under them, as the target holds it: composite with what lies below here
#ifdef HDR_BLEND
vec3 c=h3(r.rgb+destination(px)*hf(1.-r.a));
#else
vec3 c=f[0].z>0.?store(r.rgb+bk(px).rgb*(1.-r.a)):h3(r.rgb+bk(px).rgb*hf(1.-r.a));
#endif
#ifdef TINT
{c=h3(c);vec4 v=${M4(ROW_TINT, "c").replace("matrix4(", "tintMatrix4(")};float a=hf(sat(v.a)*cov);c=store(h3(h3(clamp(v.rgb,-.75,hf(${TM}.x))*a)+h3(c*hf(1.-a))));}
#endif
#ifdef LENS
// lens layer: the backdrop with colour fringes along the normal turned by its angle, faded towards the rim
{float u=sat(${LL}.y*(-d-${LL}.z)),a=${LL}.x-sat(sqrt(u*(2.-u)))*${LL}.x;vec2 na=vec2(${LD}.x*n.x+${LD}.y*n.y,${LD}.x*n.y-${LD}.y*n.x);
vec2 ax=a*s*na;vec3 g=vec3(0.);for(int i=0;i<7;i++){float t=1.-float(i)/3.;vec3 v=bl(px+t*ax);float w=abs(t);
if(t>0.)g.r+=w*v.r;else if(t<0.)g.b+=w*v.b;g.g+=(1.-w)*v.g;}
float fa=mix(${LF}.x,${LF}.y,sat((d-${LD}.z)*${LD}.w))*${LL}.w*cov;c=store(mix(c,g*vec3(.5,.333252,.5),fa));}
#endif
#ifdef LIGHTS
// The independent rim draw also runs where the background has zero coverage and no dark band.
if(bright){float kv=hf(bias(hf(k1),${KM}.w)+bias(hf(k0),${KM}.x)),lv=hf(bias(hf(l1),${FX}.y)+bias(hf(l0),${FL}.z));
#ifdef HDR_SCALE
c=h3(c*hf(f[3].y));
#endif
#ifdef RIM_SPLIT
c=store(rim(c,kv*${RA}.x,${R(ROW_RIM)},${R(ROW_RIM + 1)},${R(ROW_RIM + 2)},${R(ROW_RIM + 3)}));
c=rim(c,lv*${RA}.y,${R(ROW_RIM_FILL_MATRIX)},${R(ROW_RIM_FILL_MATRIX + 1)},${R(ROW_RIM_FILL_MATRIX + 2)},${R(ROW_RIM_FILL_MATRIX + 3)});
#else
c=rim(c,hf(hf(kv*${RA}.x)+hf(lv*${RA}.y)),${R(ROW_RIM)},${R(ROW_RIM + 1)},${R(ROW_RIM + 2)},${R(ROW_RIM + 3)});
#endif
#ifdef HDR_SCALE
c=h3(c*hf(f[3].x));
#endif
}
#endif
#ifdef VEIL
c=mix(c,vec3(${TP}.x),${TP}.y*cov);
#endif
o=vec4(c,1.);}else o=r;
#ifdef FADE
o*=${TP}.z;
#endif
o=finishPixel(o,px);
}`;

const PRELUDE = BLOCKS + "in vec2 vQ;in vec2 vU;flat in int vMode;uniform sampler2D uP;uniform sampler2D uB;out vec4 o;" + FETCH + "\n";

/**
 * @brief Fragment source of the glass program for a key: feature bits plus the member count of a
 * union above them.
 * @details With a member count, UNEVEN and FIELD mean that some members have corners of their own
 * or a mask outline.
 */
export function glassFragment(key: number, edr = false, hdr = false, blend = false, nativeY = false, worldY = false): string {
    let s = H_BODY;
    if (edr) s += "#define EDR\n";
    if (hdr) s += "#define HDR_SCALE\n";
    if (blend) s += "#define HDR_BLEND\nuniform highp sampler2D uD;\n";
    if (nativeY) s += "#define NATIVE_Y\n";
    if (worldY) s += "#define WORLD_Y\n";
    if ((key >>> MEMBER_SHIFT) === 0 && (key & (FEATURE_FIELD | FEATURE_UNEVEN)) === 0) s += "#define GRID\n";
    for (let i = 0; i < FEATURE_BITS; i++) if ((key & (BITS[i] as number)) !== 0) s += "#define " + (NAMES[i] as string) + "\n";
    const n = key >>> MEMBER_SHIFT;
    if (n > 0) s += "#define GROUP " + n + "\nlayout(std140) uniform U{vec4 mb[" + UNION_ROWS + "];};\n";
    // a single mask shape reads its field on unit 2; mask members of a union read theirs on units 2..5
    if ((key & FEATURE_FIELD) !== 0) s += n > 0 ? "uniform sampler2D uF0;uniform sampler2D uF1;uniform sampler2D uF2;uniform sampler2D uF3;\n"
        : "uniform sampler2D uF;\n";
    return s + PRELUDE + BODY;
}

/** Rim on the current opaque scene. Geometry and light helpers share the shape feature specialization. */
export function rimFragment(key: number, edr = false, hdr = false, worldY = false): string {
    const full = glassFragment(key | FEATURE_LIGHTS, edr, hdr, false, true), main = full.indexOf("void main(){");
    const geometryStart = full.indexOf("#ifdef GRID", full.indexOf("vec2 n=vec2(0.);float d=0.;", main));
    const geometryEnd = full.indexOf("n=h2(n);RC=", geometryStart);
    const lightStart = full.indexOf("// depth of the rim bands and its derivative", main);
    const lightEnd = full.indexOf("#ifdef EDGE", lightStart);
    const colourStart = full.indexOf("if(bright){float kv=", lightEnd);
    const colourEnd = full.indexOf("\n#endif\n#ifdef VEIL", colourStart);
    const destination = worldY ? "ivec2(gl_FragCoord.x,f[2].y-gl_FragCoord.y)" : "ivec2(gl_FragCoord.xy)";
    let source = [full.slice(0, main), "uniform highp sampler2D uD;void main(){vec2 px=gl_FragCoord.xy;" + (worldY ? "" : "px.y=f[2].y-px.y;"),
        "#ifdef GROUP\nvec2 q=px*f[0].y;\n#else\nvec2 q=vQ;\n#endif\nvec2 n=vec2(0.);float d=0.;",
        full.slice(geometryStart, geometryEnd), "n=h2(n);\n#ifdef LIGHTS", full.slice(lightStart, lightEnd),
        "if(!bright)discard;vec3 c=texelFetch(uD," + destination + ",0).rgb;",
        full.slice(colourStart, colourEnd).replaceAll("store(", "h3("), "o=vec4(c,1.);}"].join("\n");
    source = source.replace("hf(dot(n,n))", "hf(hf(n.x*n.x)+n.y*n.y)");
    source = source.replace("float lobe=hf(sat((pj-cs)/max(hf(1.-cs),hf(.000100017))));",
        "float lobe=hf(sat(hf(pj-cs)/max(hf(1.-cs),hf(.000100017))));");
    // Generic blend43 clamps after both half alpha weights and an unpremultiply.
    source = source.replace("float a=hf(sat(hf(v.a))*hf(h));",
        "float matrixAlpha=hf(sat(hf(v.a)));vec3 weighted=h3(v.rgb*matrixAlpha);"
        + "float a=hf(matrixAlpha*hf(h));weighted=h3(weighted*hf(h));"
        + "v.rgb=h3(weighted/max(a,hf(.000100017)));");
    for (const axis of ["x", "y", "z"]) {
        source = source.replace("h4(v+c." + axis + "*vec4(r0." + axis + ",r1." + axis + ",r2." + axis + ",r3." + axis + "))",
            "halfFMA4(vec4(r0." + axis + ",r1." + axis + ",r2." + axis + ",r3." + axis + "),c." + axis + ",v)");
    }
    return source;
}

/** Background source RGBA on a transparent group, before any foreground layer or rim. */
export function groupBodyFragment(key: number, edr = false, hdr = false, worldY = false): string {
    return glassFragment(key & ~(FEATURE_LIGHTS | FEATURE_FADE), edr, hdr, false, true, worldY)
        .replace("if(cov>0.||hl>.000100017", "o=r;return;if(cov>0.||hl>.000100017");
}

/** Premultiplied rim over group RGBA; native matrices keep the destination alpha column. */
export function groupRimFragment(key: number, edr = false, hdr = false, worldY = false): string {
    let source = rimFragment(key, edr, hdr, worldY);
    const start = source.indexOf("vec3 rim(vec3 c,float h,"), tail = "return h3(h3(k*a)+c*hf(1.-a));}";
    const end = source.indexOf(tail, start);
    const rim = `vec4 rim(vec4 destination,float h,vec4 r0,vec4 r1,vec4 r2,vec4 r3){
vec3 straight=h3(destination.rgb/max(destination.a,hf(.000100017)));
vec4 v=matrix4(straight,r0,r1,r2,r3);v.a=hf(v.a*destination.a);
float a=hf(sat(v.a)),pa=hf(a*hf(h));vec4 p=vec4(h3(v.rgb*pa),pa);
vec3 rgb=h3(p.rgb/max(p.a,hf(.000100017)));
#ifdef RIM_HUE
float peak=max(rgb.r,max(rgb.g,rgb.b));if(peak>${RA}.z)rgb=h3(rgb*(${RA}.z/peak));
#else
rgb=clamp(rgb,-.75,${RA}.z);
#endif
p=h4(vec4(h3(rgb*p.a),p.a));return halfFMA4(destination,hf(1.-p.a),p);}`;
    source = source.slice(0, start) + rim + source.slice(end + tail.length);
    const destination = worldY ? "ivec2(gl_FragCoord.x,f[2].y-gl_FragCoord.y)" : "ivec2(gl_FragCoord.xy)";
    return source.replace("vec3 c=texelFetch(uD," + destination + ",0).rgb;", "vec4 c=texelFetch(uD," + destination + ",0);")
        .replaceAll("c=h3(c*hf(", "c.rgb=h3(c.rgb*hf(").replaceAll("c=h3(rim(c,", "c=h4(rim(c,")
        .replace("o=vec4(c,1.);}", "o=vec4(c.rgb,hf(sat(c.a)));}");
}

export const GROUP_VERTEX = FULL_VERTEX.replace("void main(){", "out vec2 vQ;out vec2 vU;flat out int vMode;void main(){vQ=vec2(0.);vU=vec2(0.);vMode=0;");

/** Texture60 SDF fill coverage. Its scalar output also supplies an opaque white mask. */
export function sdfFillMaskFragment(key: number): string {
    const full = glassFragment(key), main = full.indexOf("void main(){");
    const geometryStart = full.indexOf("#ifdef GRID", full.indexOf("vec2 n=vec2(0.);float d=0.;", main));
    const geometryEnd = full.indexOf("n=h2(n);RC=", geometryStart);
    return full.slice(0, main) + "uniform float uOffset;void main(){vec2 q=vQ,n=vec2(0.);float d=0.;"
        + "RC=" + CL + ".xy;RS=" + CL + ".zw-" + CL + ".xy;\n"
        + full.slice(geometryStart, geometryEnd) + "\n"
        + "float shifted=hf(d+hf(uOffset)),depth=-shifted,width=clamp(fwidth(depth),.0001,1.);"
        + "float alpha=shifted>1.?0.:hf(sat(depth/width+.5));o=vec4(alpha);}";
}

/** Independent foreground output using the same tint operation as the public body path. */
export function tintForegroundFragment(key: number, separateMask = true, compositeBackdrop = false): string {
    const full = sdfFillMaskFragment(key | FEATURE_TINT);
    return full.replace("uniform float uOffset;", "uniform float uOffset;uniform highp sampler2D uTintBackdrop;uniform vec2 uTintOrigin;"
            + (separateMask ? "uniform highp sampler2D uTintFill;uniform vec2 uTintFillOrigin;uniform vec2 uTintFillSize;" : "")
            + (compositeBackdrop ? "uniform highp sampler2D uTintUnderlying;" : ""))
        .replace("o=vec4(alpha);}", "vec2 pixel=gl_FragCoord.xy+uTintOrigin;"
            + "vec4 backdrop=texelFetch(uTintBackdrop,ivec2(pixel),0);"
            + (compositeBackdrop ? "backdrop=halfFMA4(texelFetch(uTintUnderlying,ivec2(pixel),0),hf(1.-backdrop.a),backdrop);backdrop.a=hf(sat(backdrop.a));" : "")
            + "float edge=10.-d,coverage=hf(sat(edge/clamp(fwidth(edge),.0001,1.)+.5));"
            + (separateMask ? "ivec2 maskPixel=ivec2(pixel-uTintFillOrigin);alpha=any(lessThan(maskPixel,ivec2(0)))||any(greaterThanEqual(maskPixel,ivec2(uTintFillSize)))?0.:texelFetch(uTintFill,maskPixel,0).a;" : "")
            + "o=tintForeground(backdrop,coverage,alpha,d);}");
}

/** Complete an independently generated foreground over the current opaque scene. */
export function tintCompositeFragment(premultiplied = false): string {
    const source=glassFragment(0), main=source.indexOf("void main(){");
    return source.slice(0,main)+`uniform highp sampler2D uTintForeground;uniform highp sampler2D uD;uniform vec2 uTintOrigin;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 foreground=texelFetch(uTintForeground,ivec2(gl_FragCoord.xy-uTintOrigin),0);
o=halfFMA4(texelFetch(uD,p,0),hf(1.-foreground.a),foreground);${premultiplied ? "o.a=hf(sat(o.a));" : "o.a=1.;"}}`;
}

/** Generic/MRT keeps the source alpha store; explicit fixed-kernel controls may fuse its inverse. */
export function groupCompositeFragment(fusedInverse = false): string {
    const source = glassFragment(0), start = source.indexOf("void main(){");
    return source.slice(0, start) + `uniform highp sampler2D uG;uniform highp sampler2D uD;uniform float uOpacity;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 group=texelFetch(uG,p,0);if(group.a==0.)discard;
float weight=hf(uOpacity);vec4 src=h4(group*weight),before=texelFetch(uD,p,0);
float inverse=${fusedInverse ? "halfFMA(group.a,-weight,1.)" : "hf(1.-src.a)"};
o=halfFMA4(before,inverse,src);o.a=1.;}`;
}
