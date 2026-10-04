// GLSL ES 3.00 sources. Pixels y-up, distances in points. Glass program specialised per feature key.
import {
    BLOCK_ROWS, FEATURE_ABERRATION, FEATURE_BITS, FEATURE_BLEED, FEATURE_CLAMP, FEATURE_CLAMP_HUE, FEATURE_EDGE, FEATURE_FACE,
    FEATURE_FADE, FEATURE_FIELD, FEATURE_FILL, FEATURE_HOLD, FEATURE_LENS, FEATURE_LIGHTS, FEATURE_LUMA, FEATURE_OUTER,
    FEATURE_RIM_HUE, FEATURE_RIM_SPLIT, FEATURE_RING, FEATURE_ROUND_NORMAL, FEATURE_SHADOW, FEATURE_SHADOW_SAMPLE, FEATURE_SHARP,
    FEATURE_TINT, FEATURE_UNEVEN, FEATURE_VEIL, MEMBER_SHIFT, ROW_BLEED, ROW_BLEED_MATRIX, ROW_BLEED_MORE, ROW_BLUR, ROW_BOUNDS,
    ROW_CLAMP, ROW_CLAMP_RECT, ROW_CORNER, ROW_DROP, ROW_EDGE, ROW_EDGE_MORE, ROW_EDGE_ROUND, ROW_FACE, ROW_FACE_MORE, ROW_FRAME,
    ROW_FRINGE, ROW_HOLD, ROW_KNOT, ROW_LENS, ROW_LENS_DIR, ROW_LENS_FADE, ROW_LENS_LAYER, ROW_MIX, ROW_RADII, ROW_REGION,
    ROW_RIM, ROW_RIM_ALPHA, ROW_RIM_FILL, ROW_RIM_FILL_MATRIX, ROW_RIM_FILL_MORE, ROW_RIM_KEY, ROW_RIM_KEY_MORE, ROW_RING,
    ROW_RING_MORE, ROW_ROUND, ROW_SHADOW, ROW_SHADOW_LENS, ROW_SHADOW_MATRIX, ROW_SHADOW_MORE, ROW_SLOPE, ROW_TEXEL, ROW_TINT,
    ROW_TINT_MORE, ROW_TOP, SMOOTH_REACH, UNION_ROWS
} from "./layout.js";

const H = "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n";
// f[0] scale, 1/scale, 8-bit target, backdrop rows top-down; f[1].zw 1/target size; f[2].xy target size, zw light turn
const FRAME = "layout(std140) uniform F{vec4 f[3];};";
const BLOCKS = "layout(std140) uniform M{vec4 m[" + BLOCK_ROWS + "];};" + FRAME;
// backdrop texel under framebuffer pixel p (rows top-down when f[0].w = 1), and its bilinear lookup at a pixel position
const FETCH = "vec4 bk(vec2 p){return texelFetch(uB,ivec2(p.x,f[0].w>0.?f[2].y-p.y:p.y),0);}"
    + "vec3 bl(vec2 p){vec2 u=p*f[1].zw;return textureLod(uB,vec2(u.x,f[0].w>0.?1.-u.y:u.y),0.).rgb;}";

export const FULL_VERTEX = "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));"
    + "gl_Position=vec4(p*2.-1.,0.,1.);}";

export const SHAPE_VERTEX = "#version 300 es\n" + BLOCKS + "void main(){vec2 c=vec2(float(gl_VertexID&1),"
    + "float(gl_VertexID>>1));gl_Position=vec4(mix(m[" + ROW_BOUNDS + "].xy,m[" + ROW_BOUNDS + "].zw,c)*f[1].zw*2.-1.,0.,1.);}";

// the backdrop is opaque whatever its alpha says: a drawing buffer with an alpha channel must not show the page through
export const PRESENT_FRAGMENT = H + FRAME + "uniform sampler2D uB;out vec4 o;" + FETCH + "void main(){o=vec4(bk(gl_FragCoord.xy).rgb,1.);}";

// backdrop into two targets at once (uT = 1 when its rows are top-down)
export const SPLIT_FRAGMENT = H + FRAME + "uniform sampler2D uB;uniform float uT;layout(location=0) out vec4 o;"
    + "layout(location=1) out vec4 p;void main(){vec2 c=gl_FragCoord.xy;o=vec4(texelFetch(uB,ivec2(c.x,uT>0.?f[2].y-c.y:c.y),0).rgb,1.);p=o;}";

// Instanced region quads of the pyramid atlas. a0 = region rect in base texels, a1 = capture origin px (y up), texel px,
// a2 = capture position of the region's first texel (texels) and capture size (texels). uS = 2 / level size, 2^-level.
export const BUILD_VERTEX = "#version 300 es\nlayout(location=0) in vec4 a0;layout(location=1) in vec4 a1;"
    + "layout(location=2) in vec4 a2;uniform vec3 uS;flat out vec4 v0;flat out vec4 v1;flat out vec4 v2;"
    + "void main(){vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1));vec4 r=a0*uS.z;"
    + "gl_Position=vec4((r.xy+r.zw*c)*uS.xy-1.,0.,1.);v0=r;v1=a1;v2=a2;}";

// a texel beyond the capture takes a captured one: mirrored once at the capture edge, then clamped
const MIRROR = "float mir(float u,float hi){u=u<0.?-u:u;u=u>hi?2.*hi-u:u;return clamp(u,0.,hi);}";

// Base level: the backdrop averaged over the T x T pixels of each captured texel (T = v1.z, 1..8), every pixel read on its
// own (an exact mean wherever the region sits in the atlas); pixels beyond the target take its edge.
export const CAPTURE_FRAGMENT = H + FRAME + "uniform sampler2D uB;flat in vec4 v0;flat in vec4 v1;flat in vec4 v2;out vec4 o;" + MIRROR
    + "void main(){float T=v1.z;vec2 u=floor(gl_FragCoord.xy)-v0.xy+v2.xy;"
    + "ivec2 b=ivec2(v1.xy+vec2(mir(u.x,v2.z-1.),mir(u.y,v2.w-1.))*T),hi=ivec2(f[2].xy)-1;int n=int(T);vec4 s=vec4(0.);"
    + "for(int j=0;j<8;j++){if(j>=n)break;for(int i=0;i<8;i++){if(i>=n)break;ivec2 q=clamp(b+ivec2(i,j),ivec2(0),hi);"
    + "s+=texelFetch(uB,ivec2(q.x,f[0].w>0.?hi.y-q.y:q.y),0);}}"
    + "o=s/(T*T);}";

// First level: 13 taps of 2x2 means of the captured texels, each read with the capture's edge rule (the halo comes from
// the capture, not from the cropped base level). uP holds the base level of the page.
export const FIRST_MIP_FRAGMENT = H + "uniform sampler2D uP;flat in vec4 v0;flat in vec4 v2;out vec4 o;" + MIRROR
    + "vec4 c(vec2 u){return texelFetch(uP,ivec2(2.*v0.xy+vec2(mir(u.x,v2.z-1.),mir(u.y,v2.w-1.))-v2.xy),0);}"
    + "vec4 b(vec2 q){return .25*(c(q+vec2(0.,1.))+c(q+1.)+c(q+vec2(1.,0.))+c(q));}"
    + "void main(){vec2 p=2.*(floor(gl_FragCoord.xy)-v0.xy)+v2.xy;"
    + "vec4 r=.0770874*(b(p+vec2(2.,-2.))+b(p-2.)+b(p+vec2(-2.,2.))+b(p+2.))+.105469*b(p)"
    + "+.0902099*(b(p-vec2(2.,0.))+b(p-vec2(0.,2.))+b(p+vec2(2.,0.))+b(p+vec2(0.,2.)))"
    + "+.0563354*(b(p-vec2(4.,0.))+b(p-vec2(0.,4.))+b(p+vec2(4.,0.))+b(p+vec2(0.,4.)));"
    + "o=vec4(mix(r.rgb,vec3(0.),lessThan(abs(r.rgb),vec3(.000100017))),r.a);}";

// Level k from k-1: 13 taps of 2x2 block means, every texel held inside the region (clamp to edge) and read on its own
// (an exact mean wherever the region sits in the atlas). uP holds level k - 1 at lod 0.
export const DOWNSAMPLE_FRAGMENT = H + "uniform sampler2D uP;flat in vec4 v0;out vec4 o;"
    + "ivec2 lo,hi;vec4 t(ivec2 q){return texelFetch(uP,lo+clamp(q,ivec2(0),hi),0);}"
    + "vec4 b(vec2 i){ivec2 q=ivec2(2.*i);return .25*(t(q+ivec2(0,1))+t(q+1)+t(q+ivec2(1,0))+t(q));}"
    + "void main(){lo=ivec2(2.*v0.xy);hi=ivec2(2.*v0.zw)-1;vec2 i=floor(gl_FragCoord.xy)-v0.xy;"
    + "o=.0770874*(b(i+vec2(1.,-1.))+b(i-1.)+b(i+vec2(-1.,1.))+b(i+1.))+.105469*b(i)"
    + "+.0902099*(b(i-vec2(1.,0.))+b(i-vec2(0.,1.))+b(i+vec2(1.,0.))+b(i+vec2(0.,1.)))"
    + "+.0563354*(b(i-vec2(2.,0.))+b(i-vec2(0.,2.))+b(i+vec2(2.,0.))+b(i+vec2(0.,2.)));}";

// one pixel per instance: mean luminance of base texels a0 = (x0, y0, x1, y1), 16 bits in rg. uW = 2 / width, first pixel
export const LUMA_VERTEX = "#version 300 es\nlayout(location=0) in vec4 a0;uniform vec2 uW;flat out vec4 v0;"
    + "void main(){v0=a0;gl_Position=vec4((float(gl_InstanceID)+uW.y+.5)*uW.x-1.,0.,0.,1.);gl_PointSize=1.;}";
export const LUMA_FRAGMENT = H + "uniform sampler2D uP;flat in vec4 v0;out vec4 o;"
    + "void main(){ivec4 r=ivec4(v0);vec3 s=vec3(0.);for(int y=r.y;y<r.w;y++)for(int x=r.x;x<r.z;x++)s+=texelFetch(uP,ivec2(x,y),0).rgb;"
    + "float n=float(max((r.z-r.x)*(r.w-r.y),1));float v=clamp(dot(s,vec3(.2126,.7152,.0722))/n,0.,1.)*255.;float h=floor(v);"
    + "o=vec4(h/255.,v-h,0.,1.);}";

// Distance field of a coverage mask by jump flooding, on the pixel grid of the field texture (y up).
// uM mask (rows top-down, mip-mapped), uX: field pixel -> mask uv (scale xy, offset zw), uL: mask level whose
// texels match the field texels (a finer mask is averaged down to coverage).
const COVER = "uniform sampler2D uM;uniform vec4 uX;uniform float uL;float cov(vec2 p){vec2 u=p*uX.xy+uX.zw;"
    + "return (u.x<0.||u.y<0.||u.x>1.||u.y>1.)?0.:textureLod(uM,u,uL).a;}";
// seeds: texels the outline passes through (partly covered ones, and full ones next to an empty one where the outline
// runs along the texel edge). Each holds the point of the outline next to its centre: b = distance of the
// centre to the outline (positive outside), a = angle of the outline normal (100 = no seed), rg = offset to the seed
// texel (0 here). The normal is the Sobel gradient of the coverage; the distance is the inverse of the texel coverage for
// a straight edge of that direction (A = larger, B = smaller component of the normal): 0.5 - c = s / A while the edge
// cuts opposite sides, c = ((A + B) / 2 - s)^2 / (2 A B) once it cuts a corner off.
export const FIELD_SEED_FRAGMENT = H + COVER + "out vec4 o;void main(){vec2 p=gl_FragCoord.xy;float a=cov(p);"
    + "float l=cov(p-vec2(1.,0.)),r=cov(p+vec2(1.,0.)),d=cov(p-vec2(0.,1.)),u=cov(p+vec2(0.,1.));"
    + "if(!((a>0.&&a<1.)||(a>=1.&&(l<=0.||r<=0.||d<=0.||u<=0.)))){o=vec4(0.,0.,0.,100.);return;}"
    + "float tl=cov(p+vec2(-1.,1.)),tr=cov(p+vec2(1.,1.)),bl=cov(p+vec2(-1.,-1.)),br=cov(p+vec2(1.,-1.));"
    + "vec2 g=vec2(tl+2.*l+bl-tr-2.*r-br,bl+2.*d+br-tl-2.*u-tr);float gn=length(g);vec2 n=gn>0.?g/gn:vec2(1.,0.);"
    + "vec2 m=abs(n);float A=max(m.x,m.y),B=min(m.x,m.y),c=min(a,1.-a);"
    + "float s=(2.*c*A>=B?(.5-c)*A:.5*(A+B)-sqrt(2.*A*B*c))*(a<.5?1.:-1.);"
    + "o=vec4(0.,0.,s,atan(n.y,n.x));}";
// one flood step of uJ texels: among the nine neighbours keep the seed whose outline point is nearest
export const FIELD_JUMP_FRAGMENT = H + "uniform sampler2D uS;uniform int uJ;out vec4 o;void main(){ivec2 p=ivec2(gl_FragCoord.xy),"
    + "z=textureSize(uS,0);vec4 best=vec4(0.,0.,0.,100.);float bd=1e20;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=p+ivec2(i,j)*uJ;"
    + "if(q.x<0||q.y<0||q.x>=z.x||q.y>=z.y)continue;vec4 v=texelFetch(uS,q,0);if(v.w>50.)continue;"
    + "vec2 f=vec2(ivec2(i,j)*uJ)+v.xy,e=f-v.z*vec2(cos(v.w),sin(v.w));float l=dot(e,e);if(l<bd){bd=l;best=vec4(f,v.zw);}}o=best;}";
// signed distance in points (uK = points per texel): the outline next to the seed is a piece of a straight line through
// its outline point, one texel long; the sign comes from the coverage
export const FIELD_DISTANCE_FRAGMENT = H + COVER + "uniform sampler2D uS;uniform float uK;out vec4 o;void main(){"
    + "vec2 p=gl_FragCoord.xy;vec4 v=texelFetch(uS,ivec2(p),0);float a=cov(p);"
    + "if(v.w>50.){o=vec4(a>=.5?-1e4:1e4,0.,0.,1.);return;}"
    + "vec2 n=vec2(cos(v.w),sin(v.w)),w=v.z*n-v.xy;float e=dot(w,n),t=abs(dot(w,vec2(-n.y,n.x)))-.5;"
    + "o=vec4((a>=.5?-1.:1.)*(t>0.?length(vec2(e,t)):abs(e))*uK,0.,0.,1.);}";
// r = distance, gb = unit gradient of the smoothed distance (central differences of a 1 2 1 blur)
export const FIELD_NORMAL_FRAGMENT = H + "uniform sampler2D uS;out vec4 o;"
    + "float D(ivec2 q){return texelFetch(uS,clamp(q,ivec2(0),textureSize(uS,0)-1),0).x;}"
    + "void main(){ivec2 p=ivec2(gl_FragCoord.xy);"
    + "float x=D(p+ivec2(1,-1))+2.*D(p+ivec2(1,0))+D(p+ivec2(1,1))-D(p+ivec2(-1,-1))-2.*D(p+ivec2(-1,0))-D(p+ivec2(-1,1));"
    + "float y=D(p+ivec2(-1,1))+2.*D(p+ivec2(0,1))+D(p+ivec2(1,1))-D(p+ivec2(-1,-1))-2.*D(p+ivec2(0,-1))-D(p+ivec2(1,-1));"
    + "float l=length(vec2(x,y));o=vec4(D(p),l>0.?vec2(x,y)/l:vec2(0.,1.),1.);}";

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
// three rows (rgb) or four rows (rgba) of a colour matrix applied to c
const M3 = (row: number, c: string): string => "vec3(dot(" + c + "," + R(row) + ".xyz)+" + R(row) + ".w,dot(" + c + "," + R(row + 1)
    + ".xyz)+" + R(row + 1) + ".w,dot(" + c + "," + R(row + 2) + ".xyz)+" + R(row + 2) + ".w)";
const M4 = (row: number, c: string): string => "vec4(" + M3(row, c) + ",dot(" + c + "," + R(row + 3) + ".xyz)+" + R(row + 3) + ".w)";

// smooth-corner depth for corner coordinates c (corner zone origin 0, edge at 1), blended to the circular one by k
const CURVE = "float rho=length(c),b=max(c.x,c.y),t=b>0.?sat(min(c.x,c.y)/b):0.;"
    + "float Q=(((-.926054*t+3.15601)*t-3.64122)*t+1.26803)*t+.268531;";
const DEPTH = "mix(rho+1.-1./(1.-t*t*sat(rho)*Q),.345835+.654167*length(max(E*c-(E-1.),0.)),k)-1.";
const OVAL = (ratio: string): string => "vec2 v=vec2(q.x,q.y*" + ratio + ");v/=max(length(v),1e-12);n+=(v-n)*" + MX
    + ".z;n/=max(length(n),1e-12);";

const BODY = `const vec3 L=vec3(.2126,.7152,.0722);const vec3 LB=vec3(.2125,.7154,.0721);const float E=${SMOOTH_REACH};
float sat(float x){return clamp(x,0.,1.);}
vec2 sat2(vec2 x){return clamp(x,0.,1.);}
// displacement of a lookup: A at the rim, falling to 0 at depth H (i = 1/H)
float lens(float a,float i,float d){float u=sat(-d*i);return a-sat(sqrt(u*(2.-u)))*a;}
// level of a radius in base texels: the pyramid texture starts at its low level (m), whose texels the system measures it in
float lodOf(float r){float m=${TX}.w;r*=exp2(-m);return max(log2(r<2.?r*.5+1.:r),0.)+m;}
// what a layer drawn before the next one leaves in an 8-bit target: clipped and rounded to 8 bits
vec3 store(vec3 c){return f[0].z>0.?floor(clamp(c,0.,1.)*255.+.5)/255.:c;}
vec2 HT;
// the pyramid at pixel position p and level l, held inside the region
vec3 tap(vec2 p,float l){l=min(l,${RO}.w);vec2 e=HT*exp2(ceil(l));return textureLod(uP,clamp(p*${RN}.xy+${RN}.zw,${CL}.xy+e,${CL}.zw-e),l).rgb;}
// blur weight against the refracted distance
float weight(float x){return ${SL}.w-${DR}.x*sat((x-${KN}.x)*${SL}.x)-${DR}.y*sat((x-${KN}.y)*${SL}.y)-${DR}.z*sat((x-${KN}.z)*${SL}.z);}
// 0.5 erfc on [-2, 2] (odd polynomial)
float gauss(float z){float x=clamp(z,-2.,2.),x2=x*x;return .5+x*(-.560546+x2*(.168213+x2*(-.0344543+.00295448*x2)));}
#ifdef FACE
// face colour: maximum luminance, then the YCC matrix
vec3 faceMatrix(vec3 c){
#ifdef LUMA
float y=dot(L,c),k=sat(1.-y*${FM}.x);c=mix(vec3(k*y),k*c,1.+(1.-k)*.3);
#endif
return ${M3(ROW_FACE, "c")};}
#endif
#if defined(UNEVEN)
float corner(vec2 p,vec2 h,float r,vec2 kk,out vec2 u){
if(r<=0.){u=p-h;return max(u.x,u.y);}
float e0=E*r;u=p-h+mix(e0,r,max(kk.x,kk.y));vec2 c=max((p-h+e0)/e0,0.);${CURVE}
float k=mix(kk.x,kk.y,sat(.5-(c.y>c.x?1.:-1.)*(1.-t)));return min(max(u.x,u.y),0.)+e0*(${DEPTH});}
// four corners of their own radius (+x+y, -x+y, -x-y, +x-y; y up) and the roundness of the edges (top, bottom, right, left)
float uneven(vec2 q,vec2 h,vec4 ra,vec4 ed,float ar,out vec2 n){vec2 u,w;vec2 sg=vec2(1.);float d=corner(q,h,ra.x,ed.xz,u);
float e=corner(vec2(-q.x,q.y),h,ra.y,ed.xw,w);if(e>d){d=e;u=w;sg=vec2(-1.,1.);}
e=corner(-q,h,ra.z,ed.yw,w);if(e>d){d=e;u=w;sg=vec2(-1.);}
e=corner(vec2(q.x,-q.y),h,ra.w,ed.yz,w);if(e>d){d=e;u=w;sg=vec2(1.,-1.);}
w=max(u,0.);float l=length(w);n=(l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.)))*sg;
#ifdef ROUND
${OVAL("ar")}
#endif
return d;}
float unevenDist(vec2 q,vec2 h,vec4 ra,vec4 ed){vec2 u;return max(max(corner(q,h,ra.x,ed.xz,u),corner(vec2(-q.x,q.y),h,ra.y,ed.xw,u)),
max(corner(-q,h,ra.z,ed.yw,u),corner(vec2(q.x,-q.y),h,ra.w,ed.yz,u)));}
#endif
#if defined(GROUP)
float box(vec2 q,vec2 h,vec4 g,vec2 kk,out vec2 n){vec2 a=abs(q),u;float d;
if(g.x<=0.){u=a-h;d=max(u.x,u.y);n=u.x>u.y?vec2(1.,0.):vec2(0.,1.);}
else{u=a-h+g.z;vec2 c=max((a-h+g.y)/g.y,0.);${CURVE}
float k=mix(kk.x,kk.y,sat(.5-(c.y>c.x?1.:-1.)*(1.-t)));d=min(max(u.x,u.y),0.)+g.y*(${DEPTH});
vec2 w=max(u,0.);float l=length(w);n=l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.));}
n*=vec2(q.x>=0.?1.:-1.,q.y>=0.?1.:-1.);
#ifdef ROUND
${OVAL("g.w")}
#endif
return d;}
#ifdef FIELD
// distance and direction of a mask member from field texture k (no derivatives: lookups sit in varying control flow)
float field(int k,vec2 u,out vec2 n){vec4 w=k==0?textureLod(uF0,u,0.):k==1?textureLod(uF1,u,0.):k==2?textureLod(uF2,u,0.):textureLod(uF3,u,0.);
float l=length(w.yz);n=l>0.?w.yz/l:vec2(0.,1.);return w.x;}
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
float shape(vec2 q,out vec2 n){vec4 w=texture(uF,q*${RA2}.xy+${RA2}.zw);float l=length(w.yz);n=l>0.?w.yz/l:vec2(0.,1.);return w.x;}
#elif defined(UNEVEN)
float shape(vec2 q,out vec2 n){return uneven(q,${FR}.zw,${RA2},${EG},${RO}.z,n);}
float dist(vec2 q){return unevenDist(q,${FR}.zw,${RA2},${EG});}
#else
float dist(vec2 q){vec2 a=abs(q),h=${FR}.zw;
#ifdef SHARP
vec2 u=a-h;return max(u.x,u.y);
#else
float e0=${CO}.y;vec2 u=a-h+${CO}.z;vec2 c=max((a-h+e0)/e0,0.);${CURVE}
float k=mix(${RO}.x,${RO}.y,sat(.5-(c.y>c.x?1.:-1.)*(1.-t)));
return min(max(u.x,u.y),0.)+e0*(${DEPTH});
#endif
}
float shape(vec2 q,out vec2 n){
#ifdef SHARP
vec2 u=abs(q)-${FR}.zw;n=u.x>u.y?vec2(1.,0.):vec2(0.,1.);
#else
vec2 u=abs(q)-${FR}.zw+${CO}.z;vec2 w=max(u,0.);float l=length(w);n=l>0.?w/l:(u.x>u.y?vec2(1.,0.):vec2(0.,1.));
#endif
n*=vec2(q.x>=0.?1.:-1.,q.y>=0.?1.:-1.);
#ifdef ROUND
${OVAL(RO + ".z")}
#endif
return dist(q);}
#endif
#ifdef ABERRATION
// colour fringes of the face lookup: seven positions along the normal turned by the fringe angle (its components
// swapped, scaled by the texture aspect); red from the outer side, blue from the inner, each a four-tap mean
vec3 fringe(vec2 p,float d,vec2 n,float l,float s,float T){float u=sat(${CM}.w*(-d-${FG}.x)),a=${CM}.z-sat(sqrt(u*(2.-u)))*${CM}.z;
vec2 r=vec2(${FG}.y*n.x-${FG}.z*n.y,${FG}.z*n.x+${FG}.y*n.y);vec2 ax=a*s*vec2(r.y*${TX}.y,r.x/${TX}.y);float q=.25*(l-${TX}.w)*T*exp2(${TX}.w);
vec3 c=vec3(0.);for(int i=0;i<7;i++){float t=1.-float(i)/3.;vec2 pp=p+t*ax;
vec3 v=.25*(tap(pp+vec2(q,-q),l)+tap(pp+q,l)+tap(pp+vec2(-q,q),l)+tap(pp-q,l));float w=abs(t);
if(t>0.)c.r+=w*v.r;else if(t<0.)c.b+=w*v.b;c.g+=(1.-w)*v.g;}
return c*vec3(.5,.333252,.5);}
#endif
#ifdef LIGHTS
// one bright band: its height, curvature, the projection of the light on the normal and the cosine of its spread
float band(float e,float h,float cv,float pj,float cs,float fe){float u=sat(e/h);
return sat(e/fe+.5)*mix(u<1.?1.:0.,1.-u,cv)*sat((h-e)/fe+.5)*sat((pj-cs)/max(1.-cs,1e-4));}
float bias(float v,float k){return v/max(k+1.-k*v,1e-4);}
// colour c under a light of strength h, recoloured through the matrix rows r0..r3
vec3 rim(vec3 c,float h,vec4 r0,vec4 r1,vec4 r2,vec4 r3){vec4 v=vec4(dot(r0.xyz,c)+r0.w,dot(r1.xyz,c)+r1.w,dot(r2.xyz,c)+r2.w,dot(r3.xyz,c)+r3.w);
float a=sat(v.a)*h;
#ifdef RIM_HUE
float pk=max(v.r,max(v.g,v.b));vec3 k=v.rgb*(pk>${RA}.z?${RA}.z/max(pk,1e-12):1.);
#else
vec3 k=clamp(v.rgb,-.75,${RA}.z);
#endif
return k*a+c*(1.-a);}
#endif
void main(){vec2 px=gl_FragCoord.xy;float s=f[0].x,kt=${CO}.w,T=${TX}.x;HT=${RN}.xy*(.5*T);
#ifdef GROUP
vec2 q=px*f[0].y;
#else
vec2 q=px*f[0].y-${FR}.xy;
#endif
vec2 n;float d=shape(q,n);float fw=max(fwidth(d),1e-4);float cov=sat(.5-d/fw);
vec4 face=vec4(0.),sh=vec4(0.);float ring=0.,hl=0.;
#ifdef LIGHTS
// depth of the rim bands and its derivative, taken where every pixel of the quad runs (outside any branch)
#ifdef GROUP
float gn=max(length(n),1e-6);float e=-(d+${FX}.w)/gn;vec2 nl=n/gn;
#else
float e=-(d+${FX}.w);vec2 nl=n;
#endif
float fe=max(fwidth(e),1e-4);
#endif
#ifdef EDGE
// edge shade: a band at the rim (a stroke over the outline when its offset is minus its height), two opposite lobes
{float h=${ED}.x,e=${ED}.w+d,dp=-e,hw=fw*.5;bool st=${EM}.y>0.;
if(!(e>=hw||(st?cov>=1.:h+hw<=dp))){float iv=1./fw,cu=1.;
if(!st){float u=1.-sat(dp/h);cu=mix(u!=0.?1.:0.,u,.75);}
float w=cu*(st?1.-cov:sat((e+h)*iv+.5))*sat(dp*iv+.5),pj=dot(${RM}.zw,n);
vec2 v=sat2((vec2(pj,-pj)-${ED}.y)/max(1.-${ED}.y,1e-4))*w;v=v/max(${ED}.z*(1.-v)+1.,1e-4);hl=v.x+v.y;}}
#endif
#ifdef RING
// ring shadow: the blurred band between the outline moved down and the same outline grown by the stroke width
if(cov>0.||${RM}.y<1.){float a=dist(q-${RG}.xy)*${RG}.z;ring=${RM}.x*sat(gauss(.707032*a)-gauss(.707032*(a+${RG}.w)))*mix(1.,cov,${RM}.y);}
#endif
#ifdef SHADOW
if(cov<1.){float a=gauss(dist(q-${SH}.xy)*${SH}.z)*${SH}.w;
#ifdef SHADOW_SAMPLE
vec3 b=tap(px+lens(${SN}.x,${SN}.y,d+${SN}.z)*s*n,lodOf(${BL}.y*kt));
sh=vec4(${SN}.w*vec3(dot(b,${R(ROW_SHADOW_MATRIX)}.xyz),dot(b,${R(ROW_SHADOW_MATRIX + 1)}.xyz),dot(b,${R(ROW_SHADOW_MATRIX + 2)}.xyz))
+vec3(${R(ROW_SHADOW_MATRIX)}.w,${R(ROW_SHADOW_MATRIX + 1)}.w,${R(ROW_SHADOW_MATRIX + 2)}.w),mix(${SM}.x,1.,${SN}.w))*a;
#else
sh=vec4(${R(ROW_SHADOW_MATRIX)}.w,${R(ROW_SHADOW_MATRIX + 1)}.w,${R(ROW_SHADOW_MATRIX + 2)}.w,${SM}.x)*a;
#endif
}
#endif
if(cov>0.){float di=lens(${LE}.x,${LE}.y,d),lb=lodOf(${BL}.x*kt*weight(d+di));vec2 p=px+di*s*n;
#ifdef ABERRATION
vec3 c=fringe(p,d,n,lb,s,T);
#else
vec3 c=tap(p,lb);
#endif
#ifdef FILL
// blur fill: the undisplaced backdrop at its own blur, two taps a quarter of the level apart
{float lf=lodOf(${BL}.w*kt);vec2 st=vec2(.25*(lf-${TX}.w)*T*exp2(${TX}.w));vec3 g=.5*(tap(px+st,lf)+tap(px-st,lf));
vec3 x=${FM}.y*max(c,g)+${FM}.z*min(c,g)+(1.-(${FM}.z+${FM}.y))*c;c=mix(x,g,${FM}.w);}
#endif
#ifdef OUTER
{float dO=lens(${LE}.z,${LE}.w,d);c=mix(c,tap(px+dO*s*n,lodOf(${BL}.x*kt*weight(d+dO))),${DR}.w*sat((d-${MX}.x)*${MX}.y));}
#endif
#ifdef FACE
c=mix(c,faceMatrix(c),${MX}.w);
#endif
#ifdef BLEED
// edge bleed: weight ((g Y + h)^2 ramp)^2 opacity, Y the luminance of the face
{vec3 b=tap(px+lens(${BE}.x,${BE}.y,d)*s*n,lodOf(${BL}.z*kt));b=${M3(ROW_BLEED_MATRIX, "b")};
float v=${BM}.y*sat(dot(c,LB))+${BM}.z,w=v*v*sat((d-${BE}.z)*${BE}.w);w*=w*${BM}.x;c=mix(c,b,w);}
#endif
face=vec4(c,1.);}
vec4 r=mix(sh,face,cov);
r=r*(1.-ring)+vec4(0.,0.,0.,ring);
#ifdef EDGE
// where the result is not opaque the band goes on over the unblurred backdrop, toned towards the face
if(hl>.000100017){float a=r.a;vec3 raw=vec3(0.),so=r.rgb;
if(a<1.){raw=tap(px,${TX}.w);vec3 tn=raw;
#ifdef FACE
vec3 mp=faceMatrix(raw);if(${EM}.w>0.)mp=${EM}.x<0.?min(mp,raw):max(mp,raw);tn=mix(raw,mp,${MX}.w*hl);
#endif
so=tn*(1.-a)+r.rgb;}
float b=${EM}.x*hl,ea=(1.-a)*(${EM}.z*hl)+a;r=vec4((b*(3.-2.*so)+1.)*so-(1.-ea)*raw,ea);}
#endif
#ifdef HOLD
{float w=(1.-sat((d-${HO}.y)*${HO}.z))*${HO}.x,aa=sat(r.a);r=mix(r,vec4(${HO}.w*r.rgb*aa/max(r.a,1e-4),aa),w);}
#endif
#ifdef CLAMP
{vec3 u=r.rgb/max(r.a,1e-4);
#ifdef CLAMP_HUE
float pk=max(u.r,max(u.g,u.b));u*=pk>${CM}.x?${CM}.x/max(pk,1e-12):1.;
#else
u=clamp(u,-.75,${CM}.x);
#endif
r.rgb=u*r.a;}
#endif
if(cov>0.||hl>.000100017){
// the layers over the glass take the colour under them, as the target holds it: composite with what lies below here
vec3 c=store(r.rgb+bk(px).rgb*(1.-r.a));
#ifdef TINT
{vec4 v=${M4(ROW_TINT, "c")};float a=sat(v.a)*cov;c=store(clamp(v.rgb,-.75,${TM}.x)*a+c*(1.-a));}
#endif
#ifdef LENS
// lens layer: the backdrop with colour fringes along the normal turned by its angle, faded towards the rim
{float u=sat(${LL}.y*(-d-${LL}.z)),a=${LL}.x-sat(sqrt(u*(2.-u)))*${LL}.x;vec2 na=vec2(${LD}.x*n.x+${LD}.y*n.y,${LD}.x*n.y-${LD}.y*n.x);
vec2 ax=a*s*na;vec3 g=vec3(0.);for(int i=0;i<7;i++){float t=1.-float(i)/3.;vec3 v=bl(px+t*ax);float w=abs(t);
if(t>0.)g.r+=w*v.r;else if(t<0.)g.b+=w*v.b;g.g+=(1.-w)*v.g;}
float fa=mix(${LF}.x,${LF}.y,sat((d-${LD}.z)*${LD}.w))*${LL}.w*cov;c=store(mix(c,g*vec3(.5,.333252,.5),fa));}
#endif
#ifdef LIGHTS
// lights turned clockwise by the frame light angle (f[2].zw = cos, sin): the direction turns the other way
nl=vec2(f[2].z*nl.x-f[2].w*nl.y,f[2].w*nl.x+f[2].z*nl.y);float pj=dot(${KY}.xy,nl);
float k0=band(e,${KY}.z,${FX}.z,pj,${KY}.w,fe),k1=band(e,${KM}.y,1.,pj,${KM}.z,fe);
float l0=band(e,${FL}.x,${FX}.z,-pj,${FL}.y,fe),l1=band(e,${FL}.w,1.,-pj,${FX}.x,fe);
if(k0+k1+l0+l1>=.000100017&&e>=-5.){float kv=bias(k1,${KM}.w)+bias(k0,${KM}.x),lv=bias(l1,${FX}.y)+bias(l0,${FL}.z);
#ifdef RIM_SPLIT
c=store(rim(c,kv*${RA}.x,${R(ROW_RIM)},${R(ROW_RIM + 1)},${R(ROW_RIM + 2)},${R(ROW_RIM + 3)}));
c=rim(c,lv*${RA}.y,${R(ROW_RIM_FILL_MATRIX)},${R(ROW_RIM_FILL_MATRIX + 1)},${R(ROW_RIM_FILL_MATRIX + 2)},${R(ROW_RIM_FILL_MATRIX + 3)});
#else
c=rim(c,kv*${RA}.x+lv*${RA}.y,${R(ROW_RIM)},${R(ROW_RIM + 1)},${R(ROW_RIM + 2)},${R(ROW_RIM + 3)});
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
}`;

const PRELUDE = BLOCKS + "uniform sampler2D uP;uniform sampler2D uB;out vec4 o;" + FETCH + "\n";

/**
 * Fragment source of the glass program for a key: feature bits plus the member count of a union above them. With a
 * member count, UNEVEN and FIELD mean that some members have corners of their own or a mask outline.
 */
export function glassFragment(key: number): string {
    let s = H;
    for (let i = 0; i < FEATURE_BITS; i++) if ((key & (BITS[i] as number)) !== 0) s += "#define " + (NAMES[i] as string) + "\n";
    const n = key >>> MEMBER_SHIFT;
    if (n > 0) s += "#define GROUP " + n + "\nlayout(std140) uniform U{vec4 mb[" + UNION_ROWS + "];};\n";
    // a single mask shape reads its field on unit 2; mask members of a union read theirs on units 2..5
    if ((key & FEATURE_FIELD) !== 0) s += n > 0 ? "uniform sampler2D uF0;uniform sampler2D uF1;uniform sampler2D uF2;uniform sampler2D uF3;\n"
        : "uniform sampler2D uF;\n";
    return s + PRELUDE + BODY;
}
