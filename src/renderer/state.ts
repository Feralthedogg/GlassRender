// Shared state and typed storage for the renderer subsystems.
import { BLOCK_FLOATS, MAX_MEMBERS } from "../layout.js";
import { type MaterialSpec } from "../material.js";
import { A, B, C, F, G, GEN_SHIFT, GEOM_FIELD, GROW, INST, MAXL, MAXP, MB, MMF, R, SLOT_MASK } from "./lanes.js";
import { type Shared } from "./shared.js";

/** State of a renderer and its slot bookkeeping. */
export abstract class State {
    protected readonly gl: WebGL2RenderingContext;
    protected vao: WebGLVertexArrayObject;
    protected buildVao: WebGLVertexArrayObject;
    protected lumaVao: WebGLVertexArrayObject;
    protected ubo: WebGLBuffer;
    protected frameUbo: WebGLBuffer;
    protected unionUbo: WebGLBuffer;
    protected instBuf: WebGLBuffer;
    protected lumaBuf: WebGLBuffer;
    protected pbo: WebGLBuffer;
    protected backdrop: WebGLTexture;
    protected present: WebGLProgram;
    protected split: WebGLProgram;
    protected splitT: WebGLUniformLocation;
    protected capture: WebGLProgram;
    protected captureS: WebGLUniformLocation;
    protected first: WebGLProgram;
    protected firstS: WebGLUniformLocation;
    protected down: WebGLProgram;
    protected downS: WebGLUniformLocation;
    protected luma: WebGLProgram;
    protected lumaW: WebGLUniformLocation;
    protected lumaTex: WebGLTexture;
    protected lumaFbo: WebGLFramebuffer;
    protected halfFloat: boolean;
    protected readonly frame: Float32Array;
    protected readonly programs: Map<number, WebGLProgram>;
    protected readonly maxTex: number;
    protected readonly strideBytes: number;
    protected readonly stride: number;
    protected readonly ustrideBytes: number;
    protected readonly ustride: number;
    protected readonly pageTex: (WebGLTexture | null)[];
    protected readonly pageFbo: (WebGLFramebuffer | null)[];
    protected readonly pageDim: Int32Array;
    protected readonly progs: (WebGLProgram | null)[];
    protected readonly fields: (WebGLTexture | null)[];
    protected readonly masks: (WebGLTexture | null)[];
    protected readonly sources: (TexImageSource | null)[];
    protected readonly mfields: (WebGLTexture | null)[];
    protected readonly mmasks: (WebGLTexture | null)[];
    protected readonly msources: (TexImageSource | null)[];
    protected readonly kit: (WebGLProgram | null)[];
    protected readonly kitLoc: (WebGLUniformLocation | null)[];
    protected readonly trial: Float32Array;
    protected readonly trialInfo: Float32Array;
    protected readonly specs: (MaterialSpec | null)[];
    protected blocks: Float32Array;
    protected ublocks: Float32Array;
    protected geo: Float32Array;
    protected cap: Float32Array;
    protected bounds: Float32Array;
    protected ad: Float32Array;
    protected tints: Float32Array;
    protected members: Float32Array;
    protected inst: Float32Array;
    protected lumaData: Float32Array;
    protected lumaBytes: Uint8Array;
    protected reg: Int32Array;
    protected keys: Int32Array;
    protected feats: Int32Array;
    protected order: Int32Array;
    protected ucount: Int32Array;
    protected gens: Int32Array;
    protected list: Int32Array;
    protected lvl: Int32Array;
    protected depth: Int32Array;
    protected fdim: Int32Array;
    protected mfdim: Int32Array;
    protected seq: Int32Array;
    protected pos: Int32Array;
    protected xs: Int32Array;
    protected mark: Int32Array;
    protected act: Int32Array;
    protected cs: Int32Array;
    protected pairs: Int32Array;
    protected cand: Int32Array;
    protected bx: Float32Array;
    // Partial-frame state: output changed since the last frame, pyramid to rebuild now, last-drawn bounds, and changed
    // pixel rectangles for this frame.
    protected changed: Int8Array;
    protected rebuild: Int8Array;
    protected shown: Float32Array;
    protected drect: Float32Array;
    // Scissor box of a partial frame (pixels, y up) and whether the next frame must redraw everything.
    protected readonly clip: Float32Array;
    protected full: boolean;
    protected dstart: Int32Array;
    protected pend: Int32Array;
    protected pendGen: Int32Array;
    protected kinds: Int8Array;
    protected geoms: Int8Array;
    protected flags: Int8Array;
    protected st: Int8Array;
    protected lumaDirty: Int8Array;
    protected draws: Int8Array;
    protected fixedTone: Int8Array;
    protected presets: Int8Array;
    protected packed: Float32Array;
    protected backdropSource: TexImageSource | null;
    protected count: number;
    protected xn: number;
    protected stamp: number;
    protected capacity: number;
    protected free: number;
    protected dirtyLo: number;
    protected dirtyHi: number;
    protected uboBytes: number;
    protected udirtyLo: number;
    protected udirtyHi: number;
    protected uuboBytes: number;
    protected pages: number;
    protected shelfPage: number;
    protected shelfX: number;
    protected shelfY: number;
    protected shelfH: number;
    protected lumaCap: number;
    protected pendCount: number;
    protected depths: number;
    protected sync: WebGLSync | null;
    protected source: WebGLTexture | null;
    protected sceneTex: WebGLTexture | null;
    protected copyTex: WebGLTexture | null;
    protected sceneFbo: WebGLFramebuffer | null;
    protected copyFbo: WebGLFramebuffer | null;
    protected bothFbo: WebGLFramebuffer | null;
    protected sceneW: number;
    protected sceneH: number;
    protected backdropDirty: boolean;
    protected frameDirty: boolean;
    protected layoutDirty: boolean;
    protected layered: boolean;
    protected flat: boolean;
    protected env: number;
    protected extended: boolean;
    protected wantExtended: boolean;
    protected headroom: number;
    protected share: number;
    protected maskDirty: boolean;
    protected stale: boolean;
    protected topDown: boolean;
    protected width: number;
    protected height: number;
    protected scale: number;
    protected lastTime: number;

    protected constructor(gl: WebGL2RenderingContext, sh: Shared, strideBytes: number, ustrideBytes: number, maxTex: number) {
        this.gl = gl;
        this.vao = sh.vao; this.buildVao = sh.buildVao; this.lumaVao = sh.lumaVao; this.ubo = sh.ubo; this.frameUbo = sh.frameUbo;
        this.unionUbo = sh.unionUbo; this.instBuf = sh.instBuf; this.lumaBuf = sh.lumaBuf; this.pbo = sh.pbo; this.backdrop = sh.backdrop;
        this.present = sh.present; this.split = sh.split; this.splitT = sh.splitT; this.capture = sh.capture; this.captureS = sh.captureS;
        this.first = sh.first; this.firstS = sh.firstS;
        this.down = sh.down; this.downS = sh.downS; this.luma = sh.luma; this.lumaW = sh.lumaW;
        this.lumaTex = sh.lumaTex; this.lumaFbo = sh.lumaFbo;
        this.halfFloat = sh.halfFloat;
        this.frame = new Float32Array(12);
        this.frame[2] = 1; this.frame[10] = 1;
        this.programs = new Map<number, WebGLProgram>();
        this.maxTex = maxTex;
        this.strideBytes = strideBytes;
        this.stride = strideBytes >> 2;
        this.ustrideBytes = ustrideBytes;
        this.ustride = ustrideBytes >> 2;
        this.pageTex = new Array<WebGLTexture | null>(MAXP).fill(null);
        this.pageFbo = new Array<WebGLFramebuffer | null>(MAXP * MAXL).fill(null);
        this.pageDim = new Int32Array(MAXP * 4);
        this.progs = new Array<WebGLProgram | null>(16).fill(null);
        this.fields = new Array<WebGLTexture | null>(16).fill(null);
        this.masks = new Array<WebGLTexture | null>(16).fill(null);
        this.sources = new Array<TexImageSource | null>(16).fill(null);
        this.mfields = new Array<WebGLTexture | null>(16 * MMF).fill(null);
        this.mmasks = new Array<WebGLTexture | null>(16 * MMF).fill(null);
        this.msources = new Array<TexImageSource | null>(16 * MMF).fill(null);
        this.kit = new Array<WebGLProgram | null>(4).fill(null);
        this.kitLoc = new Array<WebGLUniformLocation | null>(6).fill(null);
        this.trial = new Float32Array(BLOCK_FLOATS);
        this.trialInfo = new Float32Array(6);
        this.specs = new Array<MaterialSpec | null>(16).fill(null);
        this.blocks = new Float32Array(this.stride * 16);
        this.ublocks = new Float32Array(this.ustride * 16);
        this.geo = new Float32Array(G * 16);
        this.cap = new Float32Array(C * 16);
        this.bounds = new Float32Array(B * 16);
        this.ad = new Float32Array(A * 16);
        this.tints = new Float32Array(4 * 16);
        this.members = new Float32Array(MB * MAX_MEMBERS * 16);
        this.inst = new Float32Array(INST * 16);
        this.lumaData = new Float32Array(4 * 16);
        this.lumaBytes = new Uint8Array(4 * 16);
        this.reg = new Int32Array(R * 16);
        this.keys = new Int32Array(16).fill(-1);
        this.feats = new Int32Array(16);
        this.order = new Int32Array(16);
        this.ucount = new Int32Array(16);
        this.gens = new Int32Array(16);
        this.list = new Int32Array(16);
        this.lvl = new Int32Array(16);
        this.depth = new Int32Array(16);
        this.fdim = new Int32Array(F * 16);
        this.mfdim = new Int32Array(F * 16 * MMF);
        this.seq = new Int32Array(16);
        this.pos = new Int32Array(16);
        this.xs = new Int32Array(16);
        this.mark = new Int32Array(16);
        this.act = new Int32Array(16);
        this.cs = new Int32Array(17);
        this.pairs = new Int32Array(64);
        this.cand = new Int32Array(32);
        this.bx = new Float32Array(4 * 16);
        this.changed = new Int8Array(16);
        this.rebuild = new Int8Array(16);
        this.shown = new Float32Array(4 * 16);
        this.drect = new Float32Array(4 * 32);
        this.clip = new Float32Array(4);
        this.full = true;
        this.dstart = new Int32Array(18);
        this.pend = new Int32Array(16);
        this.pendGen = new Int32Array(16);
        this.kinds = new Int8Array(16);
        this.geoms = new Int8Array(16);
        this.flags = new Int8Array(16);
        this.st = new Int8Array(16);
        this.lumaDirty = new Int8Array(16);
        this.draws = new Int8Array(16);
        this.fixedTone = new Int8Array(16);
        this.presets = new Int8Array(16);
        this.packed = new Float32Array(16);
        this.backdropSource = null;
        this.count = 0;
        this.xn = 0;
        this.stamp = 0;
        this.capacity = 16;
        this.free = 0;
        this.dirtyLo = 0;
        this.dirtyHi = 0;
        this.uboBytes = 0;
        this.udirtyLo = 0;
        this.udirtyHi = 0;
        this.uuboBytes = 0;
        this.pages = 0;
        this.shelfPage = -1;
        this.shelfX = 0;
        this.shelfY = 0;
        this.shelfH = 0;
        this.lumaCap = 16;
        this.pendCount = 0;
        this.depths = 1;
        this.sync = null;
        this.source = sh.backdrop;
        this.sceneTex = null;
        this.copyTex = null;
        this.sceneFbo = null;
        this.copyFbo = null;
        this.bothFbo = null;
        this.sceneW = 0;
        this.sceneH = 0;
        this.backdropDirty = true;
        this.frameDirty = true;
        this.layoutDirty = true;
        this.layered = false;
        this.flat = false;
        this.env = 0;
        this.extended = false;
        this.wantExtended = false;
        this.headroom = 1;
        this.share = 0;
        this.maskDirty = false;
        this.stale = true;
        this.topDown = true;
        this.width = 1;
        this.height = 1;
        this.scale = 1;
        this.lastTime = -1;
    }

    // Take the shared objects of a context, including after context restoration.
    protected adopt(sh: Shared): void {
        this.vao = sh.vao; this.buildVao = sh.buildVao; this.lumaVao = sh.lumaVao; this.ubo = sh.ubo; this.frameUbo = sh.frameUbo;
        this.unionUbo = sh.unionUbo; this.instBuf = sh.instBuf; this.lumaBuf = sh.lumaBuf; this.pbo = sh.pbo; this.backdrop = sh.backdrop;
        this.present = sh.present; this.split = sh.split; this.splitT = sh.splitT; this.capture = sh.capture; this.captureS = sh.captureS;
        this.first = sh.first; this.firstS = sh.firstS;
        this.down = sh.down; this.downS = sh.downS; this.luma = sh.luma; this.lumaW = sh.lumaW;
        this.lumaTex = sh.lumaTex; this.lumaFbo = sh.lumaFbo;
        this.halfFloat = sh.halfFloat;
    }

    protected take(): number {
        let slot = this.free;
        while (slot < this.capacity && this.kinds[slot] !== 0) slot++;
        if (slot === this.capacity) this.grow();
        this.free = slot + 1;
        const g = this.geo, b = slot * G;
        g.fill(0, b, b + G);
        return slot;
    }

    // Backdrop texel size in device pixels: reciprocal of the material's texels-per-pixel scale, rounded and clamped to 1–8.
    protected texel(slot: number): number {
        const k = this.geo[slot * G + 9] as number, t = k > 0 ? Math.round(1 / k) : 4;
        return t < 1 ? 1 : t > 8 ? 8 : t;
    }

    // Slot for a handle, or -1 when its shape is gone.
    protected slotOf(handle: number): number {
        const slot = handle & SLOT_MASK;
        return slot < this.capacity && this.kinds[slot] !== 0 && (this.gens[slot] as number) === (handle >>> GEN_SHIFT) ? slot : -1;
    }

    // Distance a slot extends beyond its frame while it materialises, in points per side.
    protected swell(slot: number): number {
        return this.geoms[slot] === GEOM_FIELD ? 0 : GROW * (1 - (this.ad[slot * A + 8] as number));
    }

    // The slot's block must be uploaded and its output has changed.
    protected touch(slot: number): void {
        this.stage(slot);
        this.changed[slot] = 1;
    }

    // The slot's block must be uploaded, but its output is unchanged.
    protected stage(slot: number): void {
        const lo = slot * this.stride, hi = lo + this.stride;
        if (lo < this.dirtyLo) this.dirtyLo = lo;
        if (hi > this.dirtyHi) this.dirtyHi = hi;
        this.stale = true;
    }

    protected grow(): void {
        const c0 = this.capacity, c = c0 << 1;
        const blocks = new Float32Array(c * this.stride); blocks.set(this.blocks); this.blocks = blocks;
        const ublocks = new Float32Array(c * this.ustride); ublocks.set(this.ublocks); this.ublocks = ublocks;
        const geo = new Float32Array(c * G); geo.set(this.geo); this.geo = geo;
        const cap = new Float32Array(c * C); cap.set(this.cap); this.cap = cap;
        const bounds = new Float32Array(c * B); bounds.set(this.bounds); this.bounds = bounds;
        const ad = new Float32Array(c * A); ad.set(this.ad); this.ad = ad;
        const tints = new Float32Array(c * 4); tints.set(this.tints); this.tints = tints;
        const members = new Float32Array(c * MAX_MEMBERS * MB); members.set(this.members); this.members = members;
        this.inst = new Float32Array(c * INST);
        const reg = new Int32Array(c * R); reg.set(this.reg); this.reg = reg;
        const keys = new Int32Array(c).fill(-1); keys.set(this.keys); this.keys = keys;
        const feats = new Int32Array(c); feats.set(this.feats); this.feats = feats;
        const order = new Int32Array(c); order.set(this.order); this.order = order;
        const ucount = new Int32Array(c); ucount.set(this.ucount); this.ucount = ucount;
        const gens = new Int32Array(c); gens.set(this.gens); this.gens = gens;
        this.list = new Int32Array(c); this.lvl = new Int32Array(c);
        this.depth = new Int32Array(c); this.seq = new Int32Array(c); this.dstart = new Int32Array(c + 2);
        const fdim = new Int32Array(c * F); fdim.set(this.fdim); this.fdim = fdim;
        const mfdim = new Int32Array(c * F * MMF); mfdim.set(this.mfdim); this.mfdim = mfdim;
        this.pos = new Int32Array(c); this.act = new Int32Array(c); this.cs = new Int32Array(c + 1); this.bx = new Float32Array(c * 4);
        const xs = new Int32Array(c); xs.set(this.xs); this.xs = xs;
        const mark = new Int32Array(c); mark.set(this.mark); this.mark = mark;
        const changed = new Int8Array(c); changed.set(this.changed); this.changed = changed;
        this.rebuild = new Int8Array(c);
        const shown = new Float32Array(c * 4); shown.set(this.shown); this.shown = shown;
        this.drect = new Float32Array(c * 8);
        const pend = new Int32Array(c); pend.set(this.pend); this.pend = pend;
        const pendGen = new Int32Array(c); pendGen.set(this.pendGen); this.pendGen = pendGen;
        const kinds = new Int8Array(c); kinds.set(this.kinds); this.kinds = kinds;
        const geoms = new Int8Array(c); geoms.set(this.geoms); this.geoms = geoms;
        const flags = new Int8Array(c); flags.set(this.flags); this.flags = flags;
        const st = new Int8Array(c); st.set(this.st); this.st = st;
        const lumaDirty = new Int8Array(c); lumaDirty.set(this.lumaDirty); this.lumaDirty = lumaDirty;
        const draws = new Int8Array(c); draws.set(this.draws); this.draws = draws;
        const fixedTone = new Int8Array(c); fixedTone.set(this.fixedTone); this.fixedTone = fixedTone;
        const presets = new Int8Array(c); presets.set(this.presets); this.presets = presets;
        const packed = new Float32Array(c); packed.set(this.packed); this.packed = packed;
        for (let i = c0; i < c; i++) {
            this.progs.push(null); this.fields.push(null); this.masks.push(null); this.specs.push(null); this.sources.push(null);
            for (let k = 0; k < MMF; k++) { this.mfields.push(null); this.mmasks.push(null); this.msources.push(null); }
        }
        this.capacity = c;
    }
}
