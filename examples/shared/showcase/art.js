// Backdrops for the reel: shader-painted fluids and stone, and canvas-painted flowers and leaves. Each returns a 2D canvas.
export function make(W, H, R) {
    const u = H / 540;
    function paper(draw) {
        const c = document.createElement("canvas");
        c.width = W * R; c.height = H * R;
        const g = c.getContext("2d");
        g.scale(R, R);
        draw(g);
        return c;
    }
    function glow(g, x, y, r, rgb, alpha) {
        const f = g.createRadialGradient(x, y, 0, x, y, r);
        f.addColorStop(0, `rgba(${rgb}, ${alpha})`); f.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.55})`); f.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = f; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function random(seed) {
        let s = seed >>> 0;
        return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    }

    // a full-screen fragment shader drawn once into a canvas
    const NOISE = `
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3. - 2. * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y); }
        float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }`;
    function shader(body) {
        const c = document.createElement("canvas");
        c.width = W * R; c.height = H * R;
        const gl = c.getContext("webgl2", { preserveDrawingBuffer: true });
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, `#version 300 es
            in vec2 a; out vec2 uv; void main() { uv = a * .5 + .5; gl_Position = vec4(a, 0, 1); }`));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float; in vec2 uv; out vec4 o; uniform vec2 res; ${NOISE} void main() { ${body} }`));
        gl.linkProgram(p); gl.useProgram(p);
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(p, "res"), c.width, c.height);
        gl.viewport(0, 0, c.width, c.height); gl.drawArrays(gl.TRIANGLES, 0, 3);
        const out = document.createElement("canvas");
        out.width = c.width; out.height = c.height;
        out.getContext("2d").drawImage(c, 0, 0);
        return out;
    }

    // silk: a few large, smooth folds of colour with a glossy sheen along their crests
    function silk(c0, c1, c2, hi, seed) {
        return shader(`
            vec2 p = (uv - .5) * vec2(res.x / res.y, 1.) * 1.7 + vec2(${seed}, ${seed * 0.37});
            vec2 q = vec2(fbm(p * .55), fbm(p * .55 + vec2(4.1, 2.7)));
            float t = fbm(p * .7 + 1.6 * q);
            float fold = sin((p.x * .9 + p.y * 1.7 + 4.2 * t) * 2.6);
            float crest = smoothstep(.62, 1., fold), body = smoothstep(-.6, .9, fold);
            vec3 c = mix(${c0}, ${c1}, smoothstep(.25, .75, t));
            c = mix(c, ${c2}, body * .55);
            vec3 iri = .5 + .5 * cos(6.2831 * (vec3(0., .12, .3) + t * 1.4 + p.x * .12));
            c = mix(c, iri * ${hi}, crest * .45);
            c += pow(crest, 5.) * .32;
            c *= .9 + .1 * smoothstep(1.4, 0., length(uv - .5) * 2.);
            o = vec4(c, 1.);`);
    }
    const fluidCool = silk("vec3(.01, .02, .09)", "vec3(.04, .2, .78)", "vec3(.42, .18, .9)", "vec3(.75, .9, 1.)", 0.0);
    const fluidWarm = silk("vec3(.32, .01, .14)", "vec3(.95, .2, .42)", "vec3(1., .58, .2)", "vec3(1., .9, .75)", 2.3);
    // sandstone: smooth layered waves of rust, sand and cream
    const stone = shader(`
        vec2 p = uv * vec2(res.x / res.y, 1.) * 1.1;
        float w = fbm(p * .8 + vec2(fbm(p * .6), fbm(p * .6 + 3.3)) * .9);
        float h = p.y * 1.3 + 1.2 * w + .25 * sin(p.x * 2.1);
        float b = .5 + .5 * sin(h * 13.);
        vec3 c = mix(vec3(.38, .13, .06), vec3(.83, .43, .22), smoothstep(.0, .85, b));
        c = mix(c, vec3(.98, .8, .6), smoothstep(.82, 1., b) * .8);
        c *= .88 + .14 * smoothstep(.3, .7, fbm(p * 2.2));
        o = vec4(c, 1.);`);

    // orange poppies against a deep sky, with a soft blur on the nearest flowers
    const poppies = paper((g) => {
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, "#0f4fb8"); sky.addColorStop(0.6, "#3a8be3"); sky.addColorStop(1, "#86c2f4");
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        glow(g, W * 0.8, H * 0.1, W * 0.5, "255, 255, 255", 0.25);
        const rnd = random(11);
        const flower = (x, y, s, blur, tilt) => {
            g.save(); g.filter = `blur(${blur}px)`; g.translate(x, y); g.rotate(tilt);
            g.strokeStyle = "#3f7d2c"; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(0, 30 * s); g.bezierCurveTo(10 * s, 160 * s, -14 * s, 260 * s, 6 * s, 420 * s); g.stroke();
            for (let i = 0; i < 5; i++) {
                const a = -Math.PI / 2 + (i - 2) * 0.62 + (rnd() - 0.5) * 0.2;
                g.save(); g.rotate(a + Math.PI / 2);
                const f = g.createRadialGradient(0, -20 * s, 4 * s, 0, -70 * s, 90 * s);
                f.addColorStop(0, "#d63a0e"); f.addColorStop(0.55, "#ff7a1a"); f.addColorStop(1, "#ffb347");
                g.fillStyle = f; g.globalAlpha = 0.92;
                g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-70 * s, -30 * s, -62 * s, -128 * s, 0, -136 * s); g.bezierCurveTo(62 * s, -128 * s, 70 * s, -30 * s, 0, 0); g.fill();
                g.restore();
            }
            g.globalAlpha = 1; g.fillStyle = "#3b2208"; g.beginPath(); g.arc(0, -6 * s, 12 * s, 0, Math.PI * 2); g.fill();
            g.restore();
        };
        flower(W * 0.22, H * 0.66, 1.05 * u, 0, -0.15);
        flower(W * 0.55, H * 0.52, 1.25 * u, 0, 0.08);
        flower(W * 0.86, H * 0.62, 0.95 * u, 0, 0.2);
        flower(W * 0.05, H * 0.95, 1.7 * u, 9 * u, 0.3);
        flower(W * 1.0, H * 0.98, 1.6 * u, 10 * u, -0.25);
    });

    // dark tropical leaves with one bird-of-paradise flower
    const leaves = paper((g) => {
        g.fillStyle = "#06120b"; g.fillRect(0, 0, W, H);
        const rnd = random(5);
        for (let i = 0; i < 46; i++) {
            const x = rnd() * W, y = rnd() * H * 1.1, len = (160 + rnd() * 260) * u, wid = len * (0.18 + rnd() * 0.1), a = rnd() * Math.PI * 2;
            g.save(); g.translate(x, y); g.rotate(a);
            if (rnd() < 0.3) g.filter = `blur(${(3 + rnd() * 6) * u}px)`;
            const f = g.createLinearGradient(0, -wid, 0, wid);
            const l = 10 + rnd() * 20;
            f.addColorStop(0, `hsl(${120 + rnd() * 30}, 55%, ${l}%)`); f.addColorStop(0.5, `hsl(${125 + rnd() * 25}, 60%, ${l + 10}%)`); f.addColorStop(1, `hsl(${120 + rnd() * 30}, 50%, ${l - 4}%)`);
            g.fillStyle = f;
            g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.8, len, 0); g.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.3, wid, 0, 0); g.fill();
            g.strokeStyle = `hsla(110, 40%, ${30 + l}%, 0.35)`; g.lineWidth = 1.4 * u;
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid * 0.08, len, 0); g.stroke();
            g.restore();
        }
        g.save(); g.translate(W * 0.47, H * 0.28); g.rotate(-0.35);
        const beak = (x, y, len, a, c0, c1) => {
            g.save(); g.translate(x, y); g.rotate(a);
            const f = g.createLinearGradient(0, 0, len, 0); f.addColorStop(0, c0); f.addColorStop(1, c1);
            g.fillStyle = f; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.16, len, -len * 0.02); g.quadraticCurveTo(len * 0.5, len * 0.1, 0, len * 0.06); g.fill(); g.restore();
        };
        beak(0, 0, 210 * u, 0, "#2a6b3a", "#9fbf55");
        beak(40 * u, -8 * u, 150 * u, -0.9, "#ff7a1a", "#ffd23a");
        beak(70 * u, -10 * u, 130 * u, -1.25, "#ff5a14", "#ffb02e");
        beak(100 * u, -12 * u, 110 * u, -1.6, "#ff8a1a", "#ffe066");
        beak(60 * u, -6 * u, 120 * u, -0.55, "#3b48d6", "#6f7dff");
        g.restore();
        const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
        v.addColorStop(0, "rgba(0, 0, 0, 0)"); v.addColorStop(1, "rgba(0, 0, 0, 0.55)");
        g.fillStyle = v; g.fillRect(0, 0, W, H);
    });

    return { paper, glow, random, fluidCool, fluidWarm, stone, poppies, leaves };
}
