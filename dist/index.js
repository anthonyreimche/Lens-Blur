//#region src/model.ts
var e = .025, t = .35, n = .75, r = 1 / 2048, i = [1, 3], a = .06, o = (e, t, n) => {
	let r = Math.min(1, Math.max(0, (n - e) / (t - e)));
	return r * r * (3 - 2 * r);
}, s = (e) => 1 - o(.9, 1, e), c = .7, l = -Math.PI / 2, u = .12;
function d(e, t, n, r) {
	let i = Math.hypot(t[0], t[1]);
	if (i >= 1) return 0;
	switch (e) {
		case 1: return s(i) * (.35 + 1.65 * o(.5, .95, i));
		case 2: {
			let e = 2 * Math.PI / 5, n = Math.atan2(t[1], t[0]) - l, r = n - e * Math.floor(n / e) - e / 2, a = Math.cos(e / 2) / Math.cos(r), s = a + (1 - a) * u;
			return 1 - o(.9 * s, s, i);
		}
		case 3: return s(i) * o(.45, .65, i);
		case 4: {
			let e = f(n, r);
			return Math.min(s(i), s(Math.hypot(t[0] - e[0], t[1] - e[1])));
		}
		default: return s(i);
	}
}
function f(e, t) {
	let n = (e[0] - .5) * t, r = e[1] - .5, i = Math.hypot(n, r);
	if (i < 1e-9) return [0, 0];
	let a = Math.min(1, i / (.5 * Math.hypot(t, 1)));
	return [n / i * a * c, r / i * a * c];
}
function p(e) {
	let t = 0, n = 0;
	for (let r = 0; r < 240; r++) for (let i = 0; i < 240; i++) {
		let a = [(r + .5) / 240 * 2 - 1, (i + .5) / 240 * 2 - 1];
		a[0] * a[0] + a[1] * a[1] >= 1 || (t += d(e, a, [.5, .5], 1), n++);
	}
	return t / n;
}
var m = [
	0,
	1,
	2,
	3,
	4
].map((e) => 1 / p(e)), h = (e) => Math.round(e * 1e4) / 1e4;
function g(e, t) {
	let n = Math.min(1, Math.max(0, t)), r = e + n / 2, i = e - n / 2;
	return r > 1 ? (r = 1, i = 1 - n) : i < 0 && (i = 0, r = n), {
		near: h(r),
		far: h(i)
	};
}
function _(e) {
	if (e.length === 0) return g(.5, a);
	let t = [...e].sort((e, t) => e - t), n = (e) => t[Math.floor(e * (t.length - 1))], r = n(.1), i = n(.9);
	return i - r < .06 ? g((i + r) / 2, a) : {
		near: h(i),
		far: h(r)
	};
}
function v(e, t, n, r, i) {
	let a = [], o = Math.max(0, Math.floor(Math.min(t, r) * e.width)), s = Math.min(e.width, Math.ceil(Math.max(t, r) * e.width)), c = Math.max(0, Math.floor(Math.min(n, i) * e.height)), l = Math.min(e.height, Math.ceil(Math.max(n, i) * e.height)), u = Math.max(1, Math.floor(Math.sqrt((s - o) * (l - c) / 4096)));
	for (let t = c; t < l; t += u) for (let n = o; n < s; n += u) a.push(e.data[t * e.width + n]);
	return a;
}
function ee(e) {
	let t = v(e, .35, .35, .65, .65).sort((e, t) => e - t);
	return g(t[Math.floor(t.length / 2)] ?? .5, a);
}
function y(e, t) {
	let n = Array(t).fill(0), r = e.data.length;
	if (r === 0) return n;
	for (let i = 0; i < r; i++) {
		let a = 1 - Math.min(1, Math.max(0, e.data[i]));
		n[Math.min(t - 1, Math.floor(a * t))] += 1 / r;
	}
	return n;
}
//#endregion
//#region src/params.ts
var b = "lens-blur", x = `${b}.blur`, S = "depth", te = "method", ne = "refine", C = (e) => `${x}.${e}`, w = {
	amount: C("amount"),
	near: C("near"),
	far: C("far"),
	shape: C("shape"),
	boost: C("boost"),
	view: C("view"),
	method: C(te),
	refine: C(ne)
}, T = [
	"circle",
	"bubble",
	"blade5",
	"ring",
	"cateye"
], E = {
	amount: 0,
	near: 1,
	far: .94,
	shape: 0,
	boost: 0
}, D = {
	amount: {
		min: 0,
		max: 100,
		step: 1
	},
	boost: {
		min: 0,
		max: 100,
		step: 1
	}
}, O = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t;
function k(e) {
	let t = Math.min(1, Math.max(0, O(e[w.near], E.near))), n = Math.min(t, Math.max(0, O(e[w.far], E.far)));
	return {
		amount: Math.min(100, Math.max(0, O(e[w.amount], E.amount))),
		near: t,
		far: n,
		shape: Math.min(T.length - 1, Math.max(0, Math.round(O(e[w.shape], E.shape)))),
		boost: Math.min(100, Math.max(0, O(e[w.boost], E.boost)))
	};
}
function A(e) {
	let t = e?.[w.method];
	return t === "model" || t === "simple" ? t : null;
}
//#endregion
//#region src/rt.ts
var j, M;
function re(e) {
	M = e, j = e.react;
}
//#endregion
//#region src/store.ts
var ie = {
	busy: null,
	error: null,
	hasModel: null,
	tool: "none",
	brushSize: .05,
	brushFeather: .5,
	brushAmount: .5,
	showDepth: !1,
	revision: 0
}, N = null;
function P() {
	return N ??= M.stores.create()(() => ({ ...ie })), N;
}
function ae() {
	N = null;
}
//#endregion
//#region src/actions.ts
var F = null, I = null;
function oe(e, t) {
	F = e, I = t;
}
function se() {
	F = null, I = null;
}
function L() {
	if (!F) throw Error("Lens Blur isn't running.");
	return F;
}
function ce() {
	return F;
}
var le = (e) => e instanceof Error ? e.message : String(e);
async function ue() {
	let e = await L().hasModel();
	P().setState({ hasModel: e });
}
async function R(e) {
	let t = P();
	if (!t.getState().busy) {
		t.setState({ error: null });
		try {
			e === "model" && !await L().hasModel() && (t.setState({ busy: "download" }), await L().downloadModel(), t.setState({ hasModel: !0 })), t.setState({ busy: "estimate" }), await L().estimateOpen(e);
		} catch (e) {
			t.setState({ error: le(e) });
		} finally {
			t.setState({ busy: null });
		}
	}
}
function de(e) {
	P().setState({ tool: e }), e === "none" || !I ? M.develop.setCanvasTool(null) : M.develop.setCanvasTool({
		overlay: I,
		zoomable: !0,
		onEscape: () => P().setState({ tool: "none" })
	});
}
function fe(e) {
	P().setState({ showDepth: e }), M.develop.setViewValues(e ? { [w.view]: 1 } : null);
}
function pe(e, t) {
	let n = M.stores.useDevelopStore.getState();
	n.setDynParams({
		[w.near]: e.near,
		[w.far]: e.far
	}), n.commitEdit(t);
}
function me(e, t) {
	let n = L().openMap();
	if (!n) return;
	let r = .006, i = v(n, e - r, t - r * (n.width / n.height), e + r, t + r * (n.width / n.height)).sort((e, t) => e - t), o = i[Math.floor(i.length / 2)];
	if (o === void 0) return;
	let s = k(M.stores.useDevelopStore.getState().paramBag);
	pe(g(o, Math.max(a, s.near - s.far)), "Lens Blur focus");
}
function he(e, t, n, r) {
	let i = L().openMap();
	i && pe(_(v(i, e, t, n, r)), "Lens Blur focus");
}
function ge(e) {
	L().refine(e).catch((e) => P().setState({ error: le(e) }));
}
async function _e(e, t) {
	try {
		await L().refine(e, t);
	} catch (e) {
		P().setState({ error: le(e) });
	}
}
function ve() {
	return M.stores.useDevelopStore.getState().paramBag[w.refine];
}
//#endregion
//#region src/depth/map.ts
var ye = 1024;
function be(e, t) {
	let n = new Float32Array(e * t);
	for (let r = 0; r < t; r++) n.fill(t > 1 ? r / (t - 1) : .5, r * e, (r + 1) * e);
	return {
		width: e,
		height: t,
		data: n
	};
}
function xe(e, t, n) {
	let r = new Float32Array(t * n), i = e.width / t, a = e.height / n;
	for (let o = 0; o < n; o++) {
		let n = Math.min(e.height - 1, Math.max(0, (o + .5) * a - .5)), s = Math.floor(n), c = Math.min(e.height - 1, s + 1), l = n - s;
		for (let n = 0; n < t; n++) {
			let a = Math.min(e.width - 1, Math.max(0, (n + .5) * i - .5)), u = Math.floor(a), d = Math.min(e.width - 1, u + 1), f = a - u, p = e.data[s * e.width + u] * (1 - f) + e.data[s * e.width + d] * f, m = e.data[c * e.width + u] * (1 - f) + e.data[c * e.width + d] * f;
			r[o * t + n] = p * (1 - l) + m * l;
		}
	}
	return {
		width: t,
		height: n,
		data: r
	};
}
function Se(e, t) {
	let n = Math.min(1, ye / Math.max(e, t));
	return {
		width: Math.max(1, Math.round(e * n)),
		height: Math.max(1, Math.round(t * n))
	};
}
function Ce(e) {
	let t = new Float32Array(e.data.length);
	for (let n = 0; n < t.length; n++) t[n] = .5 + .5 * Math.min(1, Math.max(0, e.data[n]));
	return {
		data: t,
		width: e.width,
		height: e.height,
		format: "r16f",
		version: 1
	};
}
//#endregion
//#region src/depth/depth-worker.ts?worker&inline
var we = "(function(){function e(e,t,n){let r=new Float32Array(t*n),i=e.width/t,a=e.height/n;for(let o=0;o<n;o++){let n=Math.min(e.height-1,Math.max(0,(o+.5)*a-.5)),s=Math.floor(n),c=Math.min(e.height-1,s+1),l=n-s;for(let n=0;n<t;n++){let a=Math.min(e.width-1,Math.max(0,(n+.5)*i-.5)),u=Math.floor(a),d=Math.min(e.width-1,u+1),f=a-u,p=e.data[s*e.width+u]*(1-f)+e.data[s*e.width+d]*f,m=e.data[c*e.width+u]*(1-f)+e.data[c*e.width+d]*f;r[o*t+n]=p*(1-l)+m*l}}return{width:t,height:n,data:r}}function t(e){let t=Float32Array.from(e).sort(),n=t[Math.floor(.01*(t.length-1))]??0,r=t[Math.floor(.99*(t.length-1))]??1,i=r-n>1e-6?r-n:1,a=new Float32Array(e.length);for(let t=0;t<e.length;t++)a[t]=Math.min(1,Math.max(0,(e[t]-n)/i));return a}function n(e,t){let n=Math.min(1,1024/Math.max(e,t));return{width:Math.max(1,Math.round(e*n)),height:Math.max(1,Math.round(t*n))}}let r=[.485,.456,.406],i=[.229,.224,.225],a=e=>Math.max(14,Math.round(e/14)*14);function o(e,t){let n=518/Math.min(e,t);return Math.max(e,t)*n>924&&(n=924/Math.max(e,t)),{width:a(e*n),height:a(t*n)}}function s(t,n,a){let s=o(n,a),c=s.width*s.height,l=new Float32Array(3*c);for(let o=0;o<3;o++){let u={width:n,height:a,data:new Float32Array(n*a)};for(let e=0;e<n*a;e++)u.data[e]=t[4*e+o]/255;let d=e(u,s.width,s.height);for(let e=0;e<c;e++)l[o*c+e]=(d.data[e]-r[o])/i[o]}return{data:l,...s}}function c(r,i,a,o,s){let c=n(o,s);return e({width:i,height:a,data:t(r)},c.width,c.height)}let l=null,u=null,d=(e,t=[])=>postMessage(e,{transfer:t}),f=e=>e instanceof Error?e.message:String(e);async function p(e){l=await import(\n/* @vite-ignore */\ne.ortUrl),l.env.wasm.wasmPaths=e.wasmBase,l.env.wasm.proxy=!1,l.env.wasm.numThreads=e.threads,l.env.wasm.initTimeout=e.initTimeoutMs,u=await l.InferenceSession.create(new Uint8Array(e.model),{executionProviders:[`wasm`]})}async function m(e){if(!l||!u)throw Error(`the depth model isn't loaded`);let t=s(e.rgba,e.width,e.height),n=new l.Tensor(`float32`,t.data,[1,3,t.height,t.width]),r=(await u.run({[u.inputNames[0]]:n}))[u.outputNames[0]],[i,a]=r.dims.slice(-2),o=c(Float32Array.from(r.data),a,i,e.width,e.height);d({kind:`depth`,id:e.id,width:o.width,height:o.height,data:o.data},[o.data.buffer])}onmessage=e=>{let t=e.data;t.kind===`init`?p(t).then(()=>d({kind:`ready`}),e=>d({kind:`error`,message:f(e)})):m(t).catch(e=>d({kind:`error`,id:t.id,message:f(e)}))}})();\n//# sourceMappingURL=depth-worker-hJqgqJQ4.js.map", Te = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", we], { type: "text/javascript;charset=utf-8" });
function Ee(e) {
	let t;
	try {
		if (t = Te && (self.URL || self.webkitURL).createObjectURL(Te), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(we), { name: e?.name });
	}
}
//#endregion
//#region src/depth/estimator.ts
function De(e) {
	let t = Se(e.width, e.height);
	return be(t.width, t.height);
}
function Oe(e, t) {
	let n = Se(t.width, t.height);
	return e.width === n.width && e.height === n.height ? e : xe(e, n.width, n.height);
}
function ke(e) {
	return `${location.origin}/__plugins__/${b}/dist/ort/${e}`;
}
function Ae() {
	return typeof crossOriginIsolated > "u" || !crossOriginIsolated ? 1 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
}
var je = {
	initMs: 6e4,
	runMs: 18e4,
	idleMs: 6e4
}, z = (e) => Error(e), Me = class {
	options;
	worker = null;
	starting = null;
	queue = Promise.resolve();
	idle = null;
	next = 1;
	runtime;
	open;
	times;
	constructor(e) {
		this.options = e, this.runtime = e.runtime ?? ke(""), this.open = e.open ?? (() => new Ee({ name: "Lens Blur depth" })), this.times = e.times ?? je;
	}
	async startWith(e) {
		let t = await this.options.loadModel(), n = this.open(), r = {
			kind: "init",
			ortUrl: `${this.runtime}ort.wasm.min.mjs?v=1.0.0`,
			wasmBase: this.runtime,
			threads: e,
			initTimeoutMs: this.times.initMs,
			model: t
		};
		try {
			return await new Promise((e, i) => {
				let a = setTimeout(() => i(z("The depth model took too long to load.")), this.times.initMs + 5e3);
				n.onmessage = ({ data: t }) => {
					clearTimeout(a), t.kind === "ready" ? e() : i(z(`The depth model wouldn't load: ${t.kind === "error" ? t.message : "no answer"}`));
				}, n.onerror = (e) => {
					clearTimeout(a), i(z(`The depth model's worker stopped: ${e.message || "unknown error"}`));
				}, n.postMessage(r, [t]);
			}), n;
		} catch (e) {
			throw n.terminate(), e;
		}
	}
	ready() {
		if (this.worker) return Promise.resolve(this.worker);
		let e = this.options.threads ?? Ae();
		return this.starting ??= this.startWith(e).catch((t) => e > 1 ? this.startWith(1) : Promise.reject(t)).then((e) => this.worker = e).finally(() => this.starting = null), this.starting;
	}
	run(e, t) {
		let n = this.next++, r = t.data.slice();
		return new Promise((i, a) => {
			let o = setTimeout(() => {
				this.stop(), a(z("The depth estimate took too long and was stopped."));
			}, this.times.runMs);
			e.onmessage = ({ data: e }) => {
				e.kind !== "ready" && e.id === n && (clearTimeout(o), e.kind === "depth" ? i({
					width: e.width,
					height: e.height,
					data: e.data
				}) : a(z(`The depth estimate failed: ${e.message}`)));
			}, e.onerror = (e) => {
				clearTimeout(o), this.stop(), a(z(`The depth model's worker stopped: ${e.message || "unknown error"}`));
			};
			let s = {
				kind: "run",
				id: n,
				rgba: r,
				width: t.width,
				height: t.height
			};
			e.postMessage(s, [r.buffer]);
		});
	}
	estimate(e) {
		let t = this.queue.then(async () => {
			this.idle && clearTimeout(this.idle);
			try {
				return await this.run(await this.ready(), e);
			} finally {
				this.idle = setTimeout(() => this.stop(), this.times.idleMs);
			}
		});
		return this.queue = t.catch(() => void 0), t;
	}
	stop() {
		this.worker?.terminate(), this.worker = null;
	}
	dispose() {
		this.idle && clearTimeout(this.idle), this.stop();
	}
}, B = {
	url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx",
	sha256: "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d",
	bytes: 27258801
}, Ne = 9e5;
async function Pe(e) {
	let t = new Uint8Array(await crypto.subtle.digest("SHA-256", e));
	return Array.from(t, (e) => e.toString(16).padStart(2, "0")).join("");
}
async function Fe(e, t) {
	let n;
	try {
		n = await e.fetch(B.url, { timeoutMs: Ne });
	} catch (e) {
		throw Error(`The depth model couldn't be downloaded: ${e instanceof Error ? e.message : String(e)}`);
	}
	if (!n.ok) throw Error(`The depth model couldn't be downloaded (the server answered ${n.status}).`);
	let r = await n.arrayBuffer();
	if (await Pe(r) !== B.sha256) throw Error("The downloaded depth model isn't the expected file, so it wasn't used.");
	await t.putModel(B.sha256, r);
}
async function Ie(e) {
	let t = await e.getModel(B.sha256);
	if (!t) throw Error("Lens Blur's depth model isn't downloaded yet: choose Estimate depth in its panel.");
	if (await Pe(t) !== B.sha256) throw await e.deleteModel(B.sha256), Error("Lens Blur's kept depth model was damaged and has been removed: choose Estimate depth to download it again.");
	return t;
}
//#endregion
//#region src/depth/strokes.ts
var Le = .25, Re = (e) => typeof e == "number" && Number.isFinite(e);
function V(e) {
	if (!Array.isArray(e)) return [];
	let t = [];
	for (let n of e) {
		if (typeof n != "object" || !n) continue;
		let { dir: e, amount: r, feather: i, dabs: a } = n;
		(e === 1 || e === -1) && Re(r) && Re(i) && Array.isArray(a) && a.length % 3 == 0 && a.every(Re) && t.push({
			dir: e,
			amount: Math.min(1, Math.max(0, r)),
			feather: Math.min(1, Math.max(0, i)),
			dabs: a
		});
	}
	return t;
}
function ze(e, t) {
	if (e >= 1) return 0;
	let n = 1 - t;
	if (e <= n) return 1;
	let r = (e - n) / (1 - n);
	return 1 - r * r * (3 - 2 * r);
}
function H(e, t) {
	if (t.length === 0) return e;
	let { width: n, height: r } = e, i = Float32Array.from(e.data), a = new Float32Array(n * r);
	for (let e of t) {
		a.fill(0);
		let t = n, o = r, s = -1, c = -1;
		for (let i = 0; i + 2 < e.dabs.length; i += 3) {
			let l = e.dabs[i] * n - .5, u = e.dabs[i + 1] * r - .5, d = Math.max(.5, e.dabs[i + 2] * r), f = Math.max(0, Math.floor(l - d)), p = Math.min(n - 1, Math.ceil(l + d)), m = Math.max(0, Math.floor(u - d)), h = Math.min(r - 1, Math.ceil(u + d));
			t = Math.min(t, f), o = Math.min(o, m), s = Math.max(s, p), c = Math.max(c, h);
			for (let t = m; t <= h; t++) for (let r = f; r <= p; r++) {
				let i = ze(Math.hypot(r - l, t - u) / d, e.feather), o = t * n + r;
				i > a[o] && (a[o] = i);
			}
		}
		let l = e.dir * e.amount * Le;
		for (let e = o; e <= c; e++) for (let r = t; r <= s; r++) {
			let t = e * n + r;
			a[t] > 0 && (i[t] = Math.min(1, Math.max(0, i[t] + l * a[t])));
		}
	}
	return {
		width: n,
		height: r,
		data: i
	};
}
function Be(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n++) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return (t >>> 0).toString(36);
}
var U = (e) => Math.round(e * 1e5) / 1e5, Ve = "depth-model", He = 826557004, W = 16, Ue = (e) => parseInt(Be(e), 36) >>> 0;
function We(e, t) {
	let n = new Uint8Array(W + 2 * e.data.length), r = new DataView(n.buffer);
	r.setUint32(0, He, !0), r.setUint16(4, e.width, !0), r.setUint16(6, e.height, !0), r.setUint32(8, Ue(t), !0);
	for (let t = 0; t < e.data.length; t++) r.setUint16(W + 2 * t, Math.round(Math.min(1, Math.max(0, e.data[t])) * 65535), !0);
	return n;
}
function Ge(e, t) {
	if (!e || e.byteLength < W) return null;
	let n = new DataView(e.buffer, e.byteOffset, e.byteLength);
	if (n.getUint32(0, !0) !== He || n.getUint32(8, !0) !== Ue(t)) return null;
	let r = n.getUint16(4, !0), i = n.getUint16(6, !0);
	if (r === 0 || i === 0 || e.byteLength !== W + 2 * r * i) return null;
	let a = new Float32Array(r * i);
	for (let e = 0; e < a.length; e++) a[e] = n.getUint16(W + 2 * e, !0) / 65535;
	return {
		width: r,
		height: i,
		data: a
	};
}
//#endregion
//#region src/controller.ts
function Ke(e) {
	return `${e.copyOf ?? e.id}|${e.relPath}|${e.fileSize}|${e.rotation ?? 0}`;
}
var qe = 6, Je = "Lens Blur has no depth for this photo yet: open it in Develop to estimate it.", Ye = class extends Error {
	constructor() {
		super("The photo is still loading.");
	}
}, Xe = class {
	host;
	store;
	makeEstimator;
	bases = /* @__PURE__ */ new Map();
	making = /* @__PURE__ */ new Map();
	kept = /* @__PURE__ */ new Set();
	listeners = /* @__PURE__ */ new Set();
	errorListeners = /* @__PURE__ */ new Set();
	estimator = null;
	shown = null;
	version = 0;
	syncing = null;
	syncAgain = !1;
	constructor(e, t, n = (e) => new Me({ loadModel: e })) {
		this.host = e, this.store = t, this.makeEstimator = n;
	}
	onChange(e) {
		return this.listeners.add(e), () => this.listeners.delete(e);
	}
	onError(e) {
		return this.errorListeners.add(e), () => this.errorListeners.delete(e);
	}
	changed() {
		for (let e of this.listeners) e();
	}
	hasModel() {
		return this.store.hasModel(B.sha256).catch(() => !1);
	}
	downloadModel() {
		return Fe(this.host.network, this.store);
	}
	remember(e, t) {
		for (this.bases.delete(e), this.bases.set(e, t); this.bases.size > qe;) this.bases.delete(this.bases.keys().next().value);
	}
	base(e, t, n) {
		let r = `${t}|${Ke(e)}`, i = this.bases.get(r);
		if (i) return this.remember(r, i), Promise.resolve(i);
		let a = this.making.get(r);
		if (a) return a;
		let o = this.make(e, t, n);
		return this.making.set(r, o), o.then((e) => {
			this.making.delete(r), this.remember(r, e);
		}, () => this.making.delete(r)), o;
	}
	async make(e, t, n) {
		let r = e.id === this.host.openPhotoId();
		if (t === "simple") {
			if (r && !n) throw new Ye();
			let t = n ?? await this.host.renderPixels(e.id);
			if (!t) throw Error("Lens Blur couldn't read the photo to make its depth.");
			return De(t);
		}
		let i = Ke(e);
		for (let t of e.copyOf ? [e.id, e.copyOf] : [e.id]) {
			let n = Ge(await this.host.photoData(Ve, t).catch(() => null), i);
			if (n) return t === e.id && this.kept.add(`${e.id}|${i}`), n;
		}
		if (!n) throw r ? new Ye() : /* @__PURE__ */ Error(Je);
		if (!await this.hasModel()) throw Error("Lens Blur's depth model isn't downloaded yet: choose Estimate depth in its panel.");
		return this.estimator ??= this.makeEstimator(() => Ie(this.store)), Oe(await this.estimator.estimate(n), n);
	}
	provide = async (e, t) => {
		let n = this.host.photo(e);
		if (!n) return null;
		let r = e === this.host.openPhotoId(), i = r ? this.host.openBag() : await this.host.savedBag(e), a = A(i);
		if (!a) {
			if (k(i ?? {}).amount >= .5) throw Error(Je);
			return null;
		}
		let o = await this.base(n, a, r ? this.host.sourcePixels() : null);
		return t.aborted ? null : Ce(H(o, V(i?.[w.refine])));
	};
	syncOpen() {
		return this.syncAgain = !0, this.syncing ||= (async () => {
			for (; this.syncAgain;) {
				this.syncAgain = !1;
				try {
					await this.syncOnce();
				} catch (e) {
					if (e instanceof Ye) continue;
					let t = e instanceof Error ? e.message : String(e);
					for (let e of this.errorListeners) e(t);
				}
			}
			this.syncing = null;
		})(), this.syncing;
	}
	async syncOnce() {
		let e = this.host.openPhotoId();
		this.shown && this.shown.photoId !== e && (this.host.setTexture(this.shown.photoId, null), this.shown = null, this.changed());
		let t = e ? this.host.photo(e) : void 0, n = this.host.openBag(), r = A(n);
		if (!t || !r) {
			this.shown && (this.host.setTexture(this.shown.photoId, null), this.shown = null, this.changed());
			return;
		}
		let i = V(n[w.refine]), a = Ke(t), o = `${r}|${a}|${JSON.stringify(i)}`;
		if (this.shown?.sig === o) return;
		let s = await this.base(t, r, this.host.sourcePixels());
		if (this.host.openPhotoId() !== t.id) return;
		let c = H(s, i);
		this.host.setTexture(t.id, {
			...Ce(c),
			version: ++this.version
		}), this.shown = {
			photoId: t.id,
			sig: o,
			map: c
		}, r === "model" && !this.kept.has(`${t.id}|${a}`) && (this.host.putOpenPhotoData(Ve, We(s, a)), this.kept.add(`${t.id}|${a}`)), this.changed();
	}
	openPhoto() {
		let e = this.host.openPhotoId(), t = e ? this.host.photo(e) : void 0;
		if (!t) throw Error("Open a photo in Develop first.");
		return t;
	}
	openMethod() {
		return A(this.host.openBag());
	}
	async estimateOpen(e) {
		let t = this.openPhoto(), n = this.host.sourcePixels();
		if (!n) throw Error("The photo is still loading: try again in a moment.");
		let r = await this.base(t, e, n);
		if (this.host.openPhotoId() !== t.id) return;
		let i = this.host.openBag(), a = { [w.method]: e };
		if (k(i).amount === 0) {
			let e = ee(H(r, V(i[w.refine])));
			Object.assign(a, {
				[w.amount]: 50,
				[w.near]: e.near,
				[w.far]: e.far
			});
		}
		this.host.setBag(a), await this.host.commit("Lens Blur depth");
	}
	async refine(e, t) {
		this.openPhoto(), this.host.setBag({ [w.refine]: e.length > 0 ? e : void 0 }), t && await this.host.commit(t);
	}
	openMap() {
		return this.shown && this.shown.photoId === this.host.openPhotoId() ? this.shown.map : null;
	}
	histogram(e) {
		let t = this.openMap();
		return t ? y(t, e) : null;
	}
	dispose() {
		this.shown && this.host.setTexture(this.shown.photoId, null), this.estimator?.dispose(), this.estimator = null, this.listeners.clear(), this.errorListeners.clear(), this.bases.clear(), this.shown = null;
	}
}, Ze = "lens-blur", Qe = "models";
function G(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error ?? /* @__PURE__ */ Error("IndexedDB request failed"));
	});
}
function $e() {
	let e = null, t = () => e ??= new Promise((t, n) => {
		let r = indexedDB.open(Ze, 1);
		r.onupgradeneeded = () => r.result.createObjectStore(Qe), r.onsuccess = () => t(r.result), r.onerror = () => {
			e = null, n(r.error ?? /* @__PURE__ */ Error("IndexedDB wouldn't open"));
		};
	}), n = async (e) => (await t()).transaction(Qe, e).objectStore(Qe);
	return {
		hasModel: async (e) => await G((await n("readonly")).count(e)) > 0,
		getModel: async (e) => {
			let t = await G((await n("readonly")).get(e));
			return t instanceof ArrayBuffer ? t : null;
		},
		putModel: async (e, t) => void await G((await n("readwrite")).put(t, e)),
		deleteModel: async (e) => void await G((await n("readwrite")).delete(e))
	};
}
//#endregion
//#region src/Overlay.tsx
var et = {
	position: "absolute",
	transform: "translate(-50%, -50%)",
	borderRadius: "50%",
	boxShadow: "0 0 0 1px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.7)",
	pointerEvents: "none"
};
function tt(e, t, n) {
	let r = e.getBoundingClientRect(), i = e.offsetWidth > 0 && r.width > 0 ? r.width / e.offsetWidth : 1;
	return {
		x: (t - r.left) / i,
		y: (n - r.top) / i
	};
}
var nt = (e) => e instanceof HTMLElement && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable);
function rt(e) {
	let { toImage: t, radiusToScreen: n, radiusToImage: r } = M.develop.useDevelopOverlay(), i = P()(), a = j.useRef(null), [o, s] = j.useState(null), [c, l] = j.useState(null), [u, d] = j.useState(!1), f = i.tool === "nearer" || i.tool === "further";
	j.useEffect(() => M.develop.setCanvasCursor(f ? "none" : "crosshair", { priority: 20 }), [f]), j.useEffect(() => {
		let e = (e) => {
			!nt(e.target) && (e.code === "Space" || e.ctrlKey || e.metaKey) && d(!0);
		}, t = (e) => {
			(e.code === "Space" || !(e.ctrlKey || e.metaKey)) && d(!1);
		}, n = () => d(!1);
		return window.addEventListener("keydown", e, !0), window.addEventListener("keyup", t, !0), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e, !0), window.removeEventListener("keyup", t, !0), window.removeEventListener("blur", n);
		};
	}, []);
	let p = n ? n(i.brushSize) : 0, m = (e) => {
		if (!t) return null;
		let n = t(e.x, e.y);
		return [
			U(n.x),
			U(n.y),
			U(i.brushSize)
		];
	}, h = (e) => {
		if (e.button !== 0 || !a.current) return;
		let t = tt(a.current, e.clientX, e.clientY);
		if (a.current.setPointerCapture(e.pointerId), !f) {
			s({
				kind: "focus",
				from: t,
				to: t
			});
			return;
		}
		let n = m(t);
		if (!n) return;
		let r = {
			dir: i.tool === "nearer" ? 1 : -1,
			amount: i.brushAmount,
			feather: i.brushFeather,
			dabs: n
		}, o = V(ve());
		s({
			kind: "paint",
			stroke: r,
			before: o,
			last: t
		}), ge([...o, r]);
	}, g = (e) => {
		if (!a.current) return;
		let t = tt(a.current, e.clientX, e.clientY);
		if (l(t), !o) return;
		if (o.kind === "focus") {
			s({
				...o,
				to: t
			});
			return;
		}
		if (Math.hypot(t.x - o.last.x, t.y - o.last.y) < Math.max(2, p * .25)) return;
		let n = m(t);
		if (!n) return;
		let r = {
			...o.stroke,
			dabs: [...o.stroke.dabs, ...n]
		};
		s({
			...o,
			stroke: r,
			last: t
		}), ge([...o.before, r]);
	}, _ = () => {
		let e = o;
		if (s(null), !e || !t) return;
		if (e.kind === "paint") {
			_e([...e.before, e.stroke], e.stroke.dir > 0 ? "Lens Blur: Nearer" : "Lens Blur: Further");
			return;
		}
		let n = t(e.from.x, e.from.y);
		if (Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) < 4) {
			me(n.x, n.y);
			return;
		}
		let r = t(e.to.x, e.to.y);
		he(n.x, n.y, r.x, r.y);
	}, v = o?.kind === "focus" ? {
		left: Math.min(o.from.x, o.to.x),
		top: Math.min(o.from.y, o.to.y),
		width: Math.abs(o.to.x - o.from.x),
		height: Math.abs(o.to.y - o.from.y)
	} : null;
	return /* @__PURE__ */ j.createElement("div", {
		ref: a,
		onPointerDown: h,
		onPointerMove: g,
		onPointerUp: _,
		onPointerCancel: _,
		onPointerLeave: () => l(null),
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: u ? "none" : "auto",
			touchAction: "none"
		}
	}, v && v.width + v.height > 4 && /* @__PURE__ */ j.createElement("div", { style: {
		position: "absolute",
		...v,
		border: "1px dashed rgba(255,255,255,0.85)",
		boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
		pointerEvents: "none"
	} }), f && c && r && /* @__PURE__ */ j.createElement(j.Fragment, null, /* @__PURE__ */ j.createElement("div", { style: {
		...et,
		left: c.x,
		top: c.y,
		width: 2 * p,
		height: 2 * p
	} }), /* @__PURE__ */ j.createElement("div", { style: {
		...et,
		left: c.x,
		top: c.y,
		width: 2 * p * (1 - i.brushFeather),
		height: 2 * p * (1 - i.brushFeather),
		opacity: .6
	} })));
}
//#endregion
//#region src/DepthStrip.tsx
var it = 64, at = 40, ot = .03;
function st(e, t) {
	let n = e.getBoundingClientRect(), r = e.offsetWidth > 0 && n.width > 0 ? n.width / e.offsetWidth : 1;
	return Math.min(1, Math.max(0, (t - n.left) / r / Math.max(1, e.offsetWidth)));
}
var K = (e) => Math.round(e * 1e4) / 1e4;
function ct(e, t) {
	let n = 1 - t, { near: r, far: i } = e.start;
	if (e.kind === "near") return {
		near: K(Math.min(1, Math.max(n, i + .005))),
		far: i
	};
	if (e.kind === "far") return {
		near: r,
		far: K(Math.max(0, Math.min(n, r - .005)))
	};
	let a = e.from - t, o = r - i, s = Math.min(1 - o / 2, Math.max(o / 2, (r + i) / 2 + a));
	return {
		near: K(s + o / 2),
		far: K(s - o / 2)
	};
}
function lt(e) {
	let { tokens: t } = M.ui, n = j.useRef(null), r = j.useRef(null), { histogram: i, band: o, onChange: s, onCommit: c } = e, l = 1 - o.near, u = 1 - o.far, d = Math.max(1e-6, ...i ?? [0]), f = (e) => {
		if (!n.current || e.button !== 0) return;
		let t = st(n.current, e.clientX), i = "move";
		if (Math.abs(t - l) < ot) i = "near";
		else if (Math.abs(t - u) < ot) i = "far";
		else if (t < l || t > u) {
			let i = g(1 - t, Math.max(a, o.near - o.far));
			s(i), r.current = {
				kind: "move",
				from: t,
				start: i
			}, n.current.setPointerCapture(e.pointerId);
			return;
		}
		r.current = {
			kind: i,
			from: t,
			start: o
		}, n.current.setPointerCapture(e.pointerId);
	}, p = (e) => {
		r.current && n.current && s(ct(r.current, st(n.current, e.clientX)));
	}, m = () => {
		r.current && (r.current = null, c());
	};
	return /* @__PURE__ */ j.createElement("div", {
		ref: n,
		role: "slider",
		"aria-label": "Focal range",
		"aria-valuemin": 0,
		"aria-valuemax": 100,
		"aria-valuenow": Math.round(100 * l),
		tabIndex: 0,
		title: "The photo's depths, nearest on the left. The lit range stays sharp: drag its edges to widen or narrow it, drag it to move it, or click elsewhere to focus there. The arrow keys move it too.",
		onKeyDown: (e) => {
			let t = e.key === "ArrowLeft" ? -.01 : e.key === "ArrowRight" ? .01 : 0;
			t !== 0 && (e.preventDefault(), s(ct({
				kind: "move",
				from: 0,
				start: o
			}, t * (e.shiftKey ? 5 : 1))), c());
		},
		onPointerDown: f,
		onPointerMove: p,
		onPointerUp: m,
		onPointerCancel: m,
		style: {
			position: "relative",
			height: at,
			background: t.surface1,
			border: `1px solid ${t.borderSubtle}`,
			borderRadius: 4,
			overflow: "hidden",
			cursor: "ew-resize",
			touchAction: "none"
		}
	}, i?.map((e, n) => /* @__PURE__ */ j.createElement("div", {
		key: n,
		style: {
			position: "absolute",
			bottom: 0,
			left: `${100 * n / it}%`,
			width: `${100 / it}%`,
			height: `${100 * e / d}%`,
			background: t.textMuted,
			opacity: .55
		}
	})), /* @__PURE__ */ j.createElement("div", { style: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: `${100 * l}%`,
		width: `${Math.max(.5, 100 * (u - l))}%`,
		background: t.accent,
		opacity: .35,
		borderLeft: `2px solid ${t.accent}`,
		borderRight: `2px solid ${t.accent}`,
		boxSizing: "border-box"
	} }));
}
//#endregion
//#region src/Panel.tsx
var q = "Lens Blur", ut = {
	circle: {
		label: "Circle",
		title: "Round, evenly lit discs, as from a wide-open lens"
	},
	bubble: {
		label: "Bubble",
		title: "Discs with a bright rim, as from an old or over-corrected lens"
	},
	blade5: {
		label: "5 blades",
		title: "Pentagons, as from a lens stopped down with five aperture blades"
	},
	ring: {
		label: "Ring",
		title: "Hollow rings, as from a mirror lens"
	},
	cateye: {
		label: "Cat eye",
		title: "Discs that narrow toward the frame's edges, as a fast lens's do"
	}
}, dt = T.map((e, t) => ({
	value: String(t),
	label: ut[e].label
})), J = {
	estimate: "Estimate how far away each part of the photo is. The first time, this downloads the depth model (Depth Anything V2 Small, about 27 MB) and keeps it.",
	simple: "Use a depth that runs from far at the top of the photo to near at the bottom, without the model. Refine it by painting.",
	amount: "How strongly what lies outside the focal range is blurred.",
	shape: "The shape out-of-focus highlights take.",
	boost: "Brightens the brightest highlights before they blur, so they bloom into bright discs.",
	focus: "Click the photo to focus at that depth, or drag over an area to keep all of it sharp.",
	nearer: "Paint over areas the depth estimate placed too far away.",
	further: "Paint over areas the depth estimate placed too near.",
	clear: "Remove all painted depth corrections.",
	showDepth: "Show the depth over the photo: warm is near, blue is far, the focal range is lit.",
	size: "The brush's size.",
	feather: "How softly the brush's edge fades.",
	strength: "How far one stroke moves the depth.",
	method: "How the depth was made: by the depth model, or the simple top-to-bottom depth."
};
function Y(e) {
	return /* @__PURE__ */ j.createElement("div", { title: e.title }, e.children);
}
function ft(e) {
	let [t, n] = j.useState(0);
	return j.useEffect(() => e?.onChange(() => n((e) => e + 1)), [e]), t;
}
function pt() {
	let { Slider: e } = M.components, { Button: t, Field: n, ProgressBar: r, Row: i, Section: a, Select: o, Stack: s, Toggle: c, tokens: l } = M.ui, u = M.develop.useParamScope(), d = u.getParams(), f = k(d), p = A(d), m = P()(), h = M.develop.useCanvasToolHeld() ? m.tool : "none", g = ce(), _ = ft(g), v = j.useMemo(() => p ? g?.histogram(64) ?? null : null, [
		g,
		p,
		d[w.refine],
		_
	]);
	if (!g) return null;
	let ee = V(d[w.refine]), y = (e, t) => u.setParams({ [w[e]]: t }), b = (e) => de(h === e ? "none" : e), x = m.busy === "download" ? "Downloading the depth model" : m.busy === "estimate" ? "Estimating depth" : null, S = /* @__PURE__ */ j.createElement(j.Fragment, null, x && /* @__PURE__ */ j.createElement(s, { gap: 4 }, /* @__PURE__ */ j.createElement("span", { style: {
		color: l.textSecondary,
		fontSize: 11
	} }, x), /* @__PURE__ */ j.createElement(r, { indeterminate: !0 })), m.error && /* @__PURE__ */ j.createElement(i, {
		gap: 6,
		align: "flex-start"
	}, /* @__PURE__ */ j.createElement("span", { style: {
		color: l.textSecondary,
		fontSize: 11,
		flex: 1
	} }, m.error), /* @__PURE__ */ j.createElement(t, {
		variant: "ghost",
		size: "sm",
		"aria-label": "Dismiss",
		onClick: () => P().setState({ error: null })
	}, "✕")));
	return p ? /* @__PURE__ */ j.createElement(s, {
		gap: 8,
		style: { padding: 8 }
	}, /* @__PURE__ */ j.createElement(Y, { title: J.amount }, /* @__PURE__ */ j.createElement(e, {
		label: "Blur amount",
		value: f.amount,
		min: D.amount.min,
		max: D.amount.max,
		step: D.amount.step,
		defaultValue: E.amount,
		onChange: (e) => y("amount", e),
		onCommit: () => u.commit(`${q}: Blur amount`)
	})), /* @__PURE__ */ j.createElement(n, { label: "Bokeh" }, /* @__PURE__ */ j.createElement(o, {
		ariaLabel: "Bokeh",
		title: `${J.shape} ${ut[T[f.shape]].title}.`,
		value: String(f.shape),
		options: dt,
		onChange: (e) => {
			y("shape", Number(e)), u.commit(`${q}: Bokeh`);
		}
	})), /* @__PURE__ */ j.createElement(Y, { title: J.boost }, /* @__PURE__ */ j.createElement(e, {
		label: "Boost",
		value: f.boost,
		min: D.boost.min,
		max: D.boost.max,
		step: D.boost.step,
		defaultValue: E.boost,
		onChange: (e) => y("boost", e),
		onCommit: () => u.commit(`${q}: Boost`)
	})), /* @__PURE__ */ j.createElement(a, {
		title: "Focal range",
		right: /* @__PURE__ */ j.createElement(t, {
			variant: "ghost",
			size: "sm",
			active: h === "focus",
			title: J.focus,
			onClick: () => b("focus")
		}, "Pick")
	}, /* @__PURE__ */ j.createElement(lt, {
		histogram: v,
		band: {
			near: f.near,
			far: f.far
		},
		onChange: (e) => u.setParams({
			[w.near]: e.near,
			[w.far]: e.far
		}),
		onCommit: () => u.commit(`${q}: Focal range`)
	})), /* @__PURE__ */ j.createElement(a, {
		title: "Refine depth",
		right: ee.length > 0 ? /* @__PURE__ */ j.createElement(t, {
			variant: "ghost",
			size: "sm",
			title: J.clear,
			onClick: () => void g.refine([], `${q}: Clear refinements`)
		}, "Clear") : null
	}, /* @__PURE__ */ j.createElement(s, { gap: 6 }, /* @__PURE__ */ j.createElement(i, { gap: 6 }, /* @__PURE__ */ j.createElement(t, {
		variant: "secondary",
		size: "sm",
		active: h === "nearer",
		title: J.nearer,
		onClick: () => b("nearer")
	}, "Nearer"), /* @__PURE__ */ j.createElement(t, {
		variant: "secondary",
		size: "sm",
		active: h === "further",
		title: J.further,
		onClick: () => b("further")
	}, "Further")), (h === "nearer" || h === "further") && /* @__PURE__ */ j.createElement(j.Fragment, null, /* @__PURE__ */ j.createElement(Y, { title: J.size }, /* @__PURE__ */ j.createElement(e, {
		label: "Size",
		value: Math.round(m.brushSize * 1e3) / 10,
		min: .5,
		max: 30,
		step: .1,
		defaultValue: 5,
		onChange: (e) => P().setState({ brushSize: e / 100 })
	})), /* @__PURE__ */ j.createElement(Y, { title: J.feather }, /* @__PURE__ */ j.createElement(e, {
		label: "Feather",
		value: Math.round(m.brushFeather * 100),
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 50,
		onChange: (e) => P().setState({ brushFeather: e / 100 })
	})), /* @__PURE__ */ j.createElement(Y, { title: J.strength }, /* @__PURE__ */ j.createElement(e, {
		label: "Strength",
		value: Math.round(m.brushAmount * 100),
		min: 1,
		max: 100,
		step: 1,
		defaultValue: 50,
		onChange: (e) => P().setState({ brushAmount: e / 100 })
	}))))), /* @__PURE__ */ j.createElement(i, {
		gap: 8,
		justify: "space-between"
	}, /* @__PURE__ */ j.createElement("div", { title: J.showDepth }, /* @__PURE__ */ j.createElement(c, {
		label: "Show depth",
		checked: m.showDepth,
		onChange: fe
	})), /* @__PURE__ */ j.createElement("div", {
		title: J.method,
		style: { minWidth: 110 }
	}, /* @__PURE__ */ j.createElement(o, {
		ariaLabel: "Depth",
		value: p,
		disabled: !!m.busy,
		options: [{
			value: "model",
			label: "Estimated"
		}, {
			value: "simple",
			label: "Simple"
		}],
		onChange: (e) => void R(e === "simple" ? "simple" : "model")
	}))), S) : /* @__PURE__ */ j.createElement(s, {
		gap: 8,
		style: { padding: 8 }
	}, /* @__PURE__ */ j.createElement(i, { gap: 6 }, /* @__PURE__ */ j.createElement(t, {
		variant: "primary",
		size: "sm",
		title: J.estimate,
		disabled: !!m.busy,
		onClick: () => void R("model")
	}, "Estimate depth"), /* @__PURE__ */ j.createElement(t, {
		variant: "secondary",
		size: "sm",
		title: J.simple,
		disabled: !!m.busy,
		onClick: () => void R("simple")
	}, "Simple depth")), S);
}
//#endregion
//#region src/glsl.ts
var X = (e) => {
	let t = e.toPrecision(9);
	return /[.e]/.test(t) ? t : `${t}.0`;
}, mt = 4096, Z = "precision highp int;\nivec2 lbFrame() { return ivec2(floor(1.0 / uTexel + 0.5)); }\nint lbHalf() { return lbFrame().y / 2; }\nivec2 lbSize(int l) {\n  ivec2 fr = ivec2(lbFrame().x, 2 * lbHalf());\n  int s = 1 << l;\n  return max((fr + s - 1) / s, ivec2(1));\n}\nivec2 lbOrigin(int l) {\n  if (l <= 1) return ivec2(0);\n  ivec2 o = ivec2(lbSize(1).x, 0);\n  for (int k = 2; k <= 8; k++) {\n    if (k >= l) break;\n    o.y += lbSize(k).y;\n  }\n  return o;\n}\nbool lbFits(int l) {\n  ivec2 e = lbOrigin(l) + lbSize(l);\n  return e.x <= lbFrame().x && e.y <= lbHalf();\n}\nbool lbPresent() { return texelFetch(depth, ivec2(0), 0).r > 0.25; }\nfloat lbDisparity(vec2 pc) { return clamp(2.0 * textureLod(depth, pc * uTexel, 0.0).r - 1.0, 0.0, 1.0); }\nvec4 lbMerge(vec4 a, vec4 b, vec4 c, vec4 d, bool fg) {\n  float lo = min(min(a.a, b.a), min(c.a, d.a));\n  float hi = max(max(a.a, b.a), max(c.a, d.a));\n  vec4 w = exp2(-abs(vec4(a.a, b.a, c.a, d.a) - (fg ? hi : lo)) * 40.0);\n  return (w.x * a + w.y * b + w.z * c + w.w * d) / (w.x + w.y + w.z + w.w);\n}\n", ht = `
float lbBoostGain(vec2 centre, float boostV) {
  if (boostV <= 0.0) return 1.0;
  vec2 fr = vec2(lbFrame());
  float span = max(2.0, max(fr.x, fr.y) * ${X(r)});
  ivec2 last = lbFrame() - 1;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 p = centre + (vec2(float(i), float(j)) - 1.5) * 0.25 * span;
      sum += fetchInput(clamp(ivec2(floor(p)), ivec2(0), last));
    }
  }
  vec3 m = sum / 16.0;
  float t = smoothstep(${X(n)}, ${X(1)}, max(m.r, max(m.g, m.b)));
  return 1.0 + ${X(7)} * boostV / 100.0 * t;
}
`, gt = `
float lbGainOf(float boostedMax, float boostV) {
  float c = ${X(7)} * boostV / 100.0;
  if (c <= 0.0 || boostedMax <= ${X(n)}) return 1.0;
  if (boostedMax >= ${X(1)} * (1.0 + c)) return 1.0 + c;
  float lo = ${X(n)};
  float hi = ${X(1)};
  for (int i = 0; i < 12; i++) {
    float m = 0.5 * (lo + hi);
    if (m * (1.0 + c * smoothstep(${X(n)}, ${X(1)}, m)) < boostedMax) lo = m;
    else hi = m;
  }
  return boostedMax / (0.5 * (lo + hi));
}
// A tap as the base pass boosted it, with that boost kept by keep (0 to
// 1): the gain is read back from the tap's brightest channel, exactly for an
// even area, so a barely blurred bright sky isn't brightened.
vec4 lbKeepBoost(vec4 t, float keep, float boostV) {
  if (keep >= 1.0 || boostV <= 0.0) return t;
  float g = lbGainOf(max(t.r, max(t.g, t.b)), boostV);
  return vec4(t.rgb / mix(g, 1.0, keep), t.a);
}
float lbCoc(float d, float nearD, float farD, float radius) {
  if (d < farD) return radius * min(1.0, (farD - d) / ${X(t)});
  if (d > nearD) return -radius * min(1.0, (d - nearD) / ${X(t)});
  return 0.0;
}
int lbTop(float amountV) {
  int built = 1 + int(clamp(floor(amountV + 0.5), 0.0, ${X(7)}));
  int top = 1;
  for (int l = 2; l <= 8; l++) {
    if (l > built || !lbFits(l)) break;
    top = l;
  }
  return top;
}
int lbLevel(float r, int top) {
  float spacing = r * ${X(Math.sqrt(Math.PI / 16))};
  return clamp(int(floor(log2(max(spacing, 1.0)))), 1, top);
}
vec4 lbTap(vec2 pc, ivec2 origin, ivec2 size, float scale) {
  vec2 t = clamp(pc / scale - 0.5, vec2(0.0), vec2(size - 1));
  return readPrev4((vec2(origin) + t + 0.5) * uTexel);
}
float lbNoise(ivec2 q) {
  vec2 p = vec2(q % 4096);
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
vec2 lbVogel(int i, int n, float rot) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float th = float(i) * 2.39996323 + rot;
  return r * vec2(cos(th), sin(th));
}
float lbEdge(float r) { return 1.0 - smoothstep(0.9, 1.0, r); }
vec2 lbCatEye(vec2 at, float aspect) {
  vec2 v = vec2((at.x - 0.5) * aspect, at.y - 0.5);
  float len = length(v);
  if (len < 1e-6) return vec2(0.0);
  float k = min(1.0, len / (0.5 * length(vec2(aspect, 1.0))));
  return v / len * k * ${X(c)};
}
float lbLensShare(float d) {
  if (d >= 2.0) return 0.0;
  return (2.0 * acos(d * 0.5) - d * 0.5 * sqrt(4.0 - d * d)) / 3.14159265;
}
float lbShape(int shapeV, vec2 u, vec2 at, float aspect) {
  float r = length(u);
  if (r >= 1.0) return 0.0;
  if (shapeV == 1) return lbEdge(r) * (0.35 + 1.65 * smoothstep(0.5, 0.95, r)) * ${X(m[1])};
  if (shapeV == 2) {
    if (r < 1e-4) return ${X(m[2])};
    float seg = ${X(2 * Math.PI / 5)};
    float th = atan(u.y, u.x) - ${X(l)};
    float phi = th - seg * floor(th / seg) - seg * 0.5;
    float edge = cos(seg * 0.5) / cos(phi);
    float rr = edge + (1.0 - edge) * ${X(u)};
    return (1.0 - smoothstep(0.9 * rr, rr, r)) * ${X(m[2])};
  }
  if (shapeV == 3) return lbEdge(r) * smoothstep(0.45, 0.65, r) * ${X(m[3])};
  if (shapeV == 4) {
    vec2 o = lbCatEye(at, aspect);
    float w = min(lbEdge(r), lbEdge(length(u - o))) * ${X(m[4])};
    return w > 0.0 ? w / max(0.05, lbLensShare(length(o))) : 0.0;
  }
  return lbEdge(r) * ${X(m[0])};
}
void lbBackTap(vec4 t, vec2 off, vec2 at, float cp, float dp, float nearD, float farD, float radius, int shapeV, float aspect, inout vec3 sum, inout float wsum) {
  float cq = lbCoc(t.a, nearD, farD, radius);
  if (cq < 0.0) return;
  if (cp < 0.0) {
    float hw = exp2(-40.0 * max(t.a - farD, 0.0));
    sum += hw * t.rgb;
    wsum += hw;
    return;
  }
  float rq = max(t.a < dp ? min(cq, cp) : cq, 1e-3);
  // A filtered read across a sharp subject's edge blends its colour and depth
  // into the tap; one nearer than the pixel counts for less the nearer it is.
  float w = lbShape(shapeV, off / rq, at, aspect) / max(rq * rq, 1.0) * exp2(-40.0 * max(t.a - dp, 0.0));
  sum += w * t.rgb;
  wsum += w;
}
void lbFrontTap(vec4 t, vec2 off, vec2 at, float area, float nearD, float farD, float radius, int shapeV, float aspect, inout vec3 sum, inout float cover) {
  float cq = lbCoc(t.a, nearD, farD, radius);
  if (cq >= 0.0) return;
  float rq = -cq;
  float w = lbShape(shapeV, off / rq, at, aspect) * area / max(rq * rq, 0.25);
  sum += w * t.rgb;
  cover += w;
}
`, _t = "\nivec2 q = ivec2(gl_FragCoord.xy);\nint hh = lbHalf();\nbool fg = q.y >= hh;\nivec2 a = ivec2(q.x, fg ? q.y - hh : q.y);\nivec2 s1 = lbSize(1);\nc = vec4(0.0);\nif (q.y < 2 * hh && a.x < s1.x && a.y < s1.y) {\n  ivec2 fr = lbFrame() - 1;\n  ivec2 p0 = min(2 * a, fr);\n  ivec2 p1 = min(2 * a + ivec2(1, 0), fr);\n  ivec2 p2 = min(2 * a + ivec2(0, 1), fr);\n  ivec2 p3 = min(2 * a + ivec2(1, 1), fr);\n  float g = lbBoostGain(vec2(2 * a) + 1.0, boost);\n  c = lbMerge(\n    vec4(g * fetchInput(p0), lbDisparity(vec2(p0) + 0.5)),\n    vec4(g * fetchInput(p1), lbDisparity(vec2(p1) + 0.5)),\n    vec4(g * fetchInput(p2), lbDisparity(vec2(p2) + 0.5)),\n    vec4(g * fetchInput(p3), lbDisparity(vec2(p3) + 0.5)),\n    fg);\n}\n", vt = "\nivec2 q = ivec2(gl_FragCoord.xy);\nint hh = lbHalf();\nint l = uPassIndex + 2;\nbool fg = q.y >= hh;\nivec2 a = ivec2(q.x, fg ? q.y - hh : q.y);\nivec2 o = lbOrigin(l);\nif (q.y < 2 * hh && lbFits(l) && all(greaterThanEqual(a, o)) && all(lessThan(a, o + lbSize(l)))) {\n  ivec2 k = 2 * (a - o);\n  ivec2 po = lbOrigin(l - 1) + ivec2(0, fg ? hh : 0);\n  ivec2 last = lbSize(l - 1) - 1;\n  c = lbMerge(\n    fetchPrev4(po + min(k, last)),\n    fetchPrev4(po + min(k + ivec2(1, 0), last)),\n    fetchPrev4(po + min(k + ivec2(0, 1), last)),\n    fetchPrev4(po + min(k + ivec2(1, 1), last)),\n    fg);\n}\n", yt = `
ivec2 q = ivec2(gl_FragCoord.xy);
vec3 sharp = fetchInput(q);
c = vec4(sharp, 0.0);
if (lbPresent()) {
  vec2 fr = vec2(lbFrame());
  float aspect = fr.x / fr.y;
  float radius = amount / 100.0 * ${X(e)} * max(fr.x, fr.y);
  int top = lbTop(amount);
  vec2 pc = vec2(q) + 0.5;
  float dp = lbDisparity(pc);
  float cp = lbCoc(dp, near, far, radius);
  float rot = lbNoise(q) * 6.28318531;
  int hh = lbHalf();

  // Where blurring begins is a share of the frame, not a pixel count: a
  // circle under a pixel in Develop's preview is over one in a full-size
  // export, and the two must blend (and boost) the same.
  float toRef = ${X(mt)} / max(fr.x, fr.y);
  float rb = abs(cp);
  vec3 back = sharp;
  float wBack = 0.0;
  if (rb * toRef >= 0.5) {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    float keep = smoothstep(${X(i[0])}, ${X(i[1])}, rb * toRef);
    int l = lbLevel(rb, top);
    ivec2 o = lbOrigin(l);
    ivec2 s = lbSize(l);
    float sc = exp2(float(l));
    for (int i = 0; i < 16; i++) {
      vec2 off = rb * lbVogel(i, 16, rot);
      vec2 pq = pc - off;
      lbBackTap(lbKeepBoost(lbTap(pq, o, s, sc), keep, boost), off, pq / fr, cp, dp, near, far, radius, shape, aspect, sum, wsum);
    }
    if (wsum > 1e-6) back = sum / wsum;
    wBack = smoothstep(0.5, 1.5, rb * toRef);
  }

  float rf = max(-cp, 0.0);
  {
    // The nearest depth within the full radius, from the four foreground
    // texels around the pixel at the level whose texels are at least that
    // wide: a soft maximum under their bilinear weights, so it changes
    // smoothly from pixel to pixel instead of from tile to tile (a search
    // radius that jumps at tile edges left seams in the blur).
    int ln = clamp(int(ceil(log2(max(radius, 2.0)))), 1, top);
    ivec2 on = lbOrigin(ln) + ivec2(0, hh);
    ivec2 last = lbSize(ln) - 1;
    vec2 t = pc / exp2(float(ln)) - 0.5;
    ivec2 k = ivec2(floor(t));
    vec2 fk = t - floor(t);
    vec4 dk = vec4(
      fetchPrev4(on + clamp(k, ivec2(0), last)).a, fetchPrev4(on + clamp(k + ivec2(1, 0), ivec2(0), last)).a,
      fetchPrev4(on + clamp(k + ivec2(0, 1), ivec2(0), last)).a, fetchPrev4(on + clamp(k + ivec2(1, 1), ivec2(0), last)).a);
    vec4 wk = vec4((1.0 - fk.x) * (1.0 - fk.y), fk.x * (1.0 - fk.y), (1.0 - fk.x) * fk.y, fk.x * fk.y) * exp2(12.0 * (dk - max(max(dk.x, dk.y), max(dk.z, dk.w))));
    float dn = dot(wk, dk) / max(wk.x + wk.y + wk.z + wk.w, 1e-6);
    rf = max(rf, -lbCoc(max(dn, dp), near, far, radius));
  }
  vec3 front = sharp;
  float aFront = 0.0;
  if (rf * toRef >= 0.5) {
    vec3 sum = vec3(0.0);
    float cover = 0.0;
    float keep = smoothstep(${X(i[0])}, ${X(i[1])}, rf * toRef);
    int l = max(1, lbLevel(radius, top) - 2);
    ivec2 o = lbOrigin(l) + ivec2(0, hh);
    ivec2 s = lbSize(l);
    float sc = exp2(float(l));
    float area = rf * rf / ${X(16)};
    for (int i = 0; i < 16; i++) {
      vec2 off = rf * lbVogel(i, 16, rot);
      vec2 pq = pc - off;
      lbFrontTap(lbKeepBoost(lbTap(pq, o, s, sc), keep, boost), off, pq / fr, area, near, far, radius, shape, aspect, sum, cover);
    }
    if (cover > 1e-6) front = sum / cover;
    aFront = clamp(cover, 0.0, 1.0);
  }

  float take = 1.0 - (1.0 - wBack) * (1.0 - aFront);
  vec3 blurred = take > 1e-5 ? (back * wBack * (1.0 - aFront) + front * aFront) / take : sharp;
  c = vec4(blurred, take);
}
`, bt = [
	{
		name: "base",
		glsl: _t,
		helpers: Z + ht
	},
	{
		name: "levels",
		glsl: vt,
		helpers: Z
	},
	{
		name: "gather",
		glsl: yt,
		helpers: Z + gt
	},
	{
		name: "smooth",
		glsl: "\nivec2 q = ivec2(gl_FragCoord.xy);\nif (c.a > 0.0) {\n  ivec2 last = lbFrame() - 1;\n  vec3 sum = vec3(0.0);\n  float cover = 0.0;\n  float wsum = 0.0;\n  for (int j = -1; j <= 1; j++) {\n    for (int i = -1; i <= 1; i++) {\n      vec4 n = fetchPrev4(clamp(q + 2 * ivec2(i, j), ivec2(0), last));\n      float w = (i == 0 && j == 0 ? 4.0 : i == 0 || j == 0 ? 2.0 : 1.0) * exp2(-8.0 * abs(n.a - c.a));\n      sum += w * n.a * n.rgb;\n      cover += w * n.a;\n      wsum += w;\n    }\n  }\n  c = vec4(sum / max(cover, 1e-6), cover / wsum);\n}\n",
		helpers: Z
	}
], xt = "\nvec3 lbDepthColour(float d, float nearD, float farD) {\n  vec3 tint = mix(vec3(0.02, 0.1, 0.55), vec3(0.9, 0.35, 0.06), d);\n  return d >= farD && d <= nearD ? mix(tint, vec3(1.0), 0.55) : tint;\n}\n";
function St(e) {
	return `
float lbRaw = texture(depth, srcUv).r;
bool lbOk = texelFetch(depth, ivec2(0), 0).r > 0.25 && lbRaw > 0.25;
if (view > 0.5 && lbOk) {
  lin = lbDepthColour(clamp(2.0 * lbRaw - 1.0, 0.0, 1.0), near, far);
} else if (amount >= 0.5 && lbOk) {
  vec4 lbOut = texture(${e}, srcUv);
  lin = mix(lin, lbOut.rgb, clamp(lbOut.a, 0.0, 1.0));
}
`;
}
//#endregion
//#region src/stage.ts
function Ct(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return `u_${(t >>> 0).toString(36).slice(0, 4)}_stageResult`;
}
var wt = {
	amount: {
		key: "amount",
		glslType: "float",
		default: E.amount,
		range: D.amount,
		label: "Blur amount"
	},
	near: {
		key: "near",
		glslType: "float",
		default: E.near,
		range: {
			min: 0,
			max: 1
		},
		label: "Focal range near"
	},
	far: {
		key: "far",
		glslType: "float",
		default: E.far,
		range: {
			min: 0,
			max: 1
		},
		label: "Focal range far"
	},
	shape: {
		key: "shape",
		glslType: "int",
		default: E.shape,
		range: {
			min: 0,
			max: T.length - 1,
			step: 1
		},
		label: "Bokeh"
	},
	boost: {
		key: "boost",
		glslType: "float",
		default: E.boost,
		range: D.boost,
		label: "Boost"
	},
	view: {
		key: "view",
		glslType: "float",
		default: 0
	}
}, Tt = (...e) => e.map((e) => wt[e]);
function Et() {
	let [e, t, n, r] = bt;
	return {
		id: x,
		name: "Lens Blur",
		phase: "scene-linear",
		priority: 30,
		reads: "current",
		space: {
			encoding: "linear",
			primaries: "rec709"
		},
		glsl: St(Ct(x)),
		helpers: xt,
		uniforms: Object.values(wt),
		textures: [{
			key: S,
			kind: "dynamic",
			perPhoto: !0
		}],
		passes: [
			{
				channels: 4,
				glsl: e.glsl,
				helpers: e.helpers,
				iterations: {
					key: "amount",
					max: 1
				},
				uniforms: Tt("boost")
			},
			{
				channels: 4,
				glsl: t.glsl,
				helpers: t.helpers,
				iterations: {
					key: "amount",
					max: 7
				},
				keep: !0
			},
			{
				channels: 4,
				glsl: n.glsl,
				helpers: n.helpers,
				iterations: {
					key: "amount",
					max: 1
				},
				uniforms: Tt("amount", "near", "far", "shape", "boost")
			},
			{
				channels: 4,
				glsl: r.glsl,
				helpers: r.helpers,
				iterations: {
					key: "amount",
					max: 1
				}
			}
		],
		dormantWhen: {
			amount: 0,
			view: 0
		},
		presetScope: "per-image"
	};
}
//#endregion
//#region src/index.tsx
var Dt = `${b}.panel`, Q = null, $ = [];
function Ot(e) {
	let t = new OffscreenCanvas(e.width, e.height), n = t.getContext("2d");
	return n ? (n.drawImage(e, 0, 0), e.close(), {
		data: n.getImageData(0, 0, t.width, t.height).data,
		width: t.width,
		height: t.height
	}) : null;
}
function kt(e) {
	let t = () => e.stores.useDevelopStore.getState();
	return {
		photo: (t) => e.stores.useCatalogStore.getState().photos.find((e) => e.id === t),
		openPhotoId: () => t().photoId,
		openBag: () => t().paramBag,
		setBag: (e) => t().setDynParams(e),
		commit: (e) => t().commitEdit(e),
		sourcePixels: () => e.develop.sourcePixels(),
		renderPixels: async (t) => {
			let n = await e.develop.renderPhotoFrame(t, e.develop.normalizeParams({}));
			return n ? Ot(n) : null;
		},
		savedBag: async (t) => {
			let n = await e.catalog.getEditState(t);
			return n ? n.stack[n.currentIndex]?.paramBag ?? {} : null;
		},
		photoData: (t, n) => e.develop.getPhotoData(t, n),
		putOpenPhotoData: (t, n) => e.develop.putPhotoData(t, n),
		setTexture: (t, n) => e.setStageTexture(x, S, n, t),
		network: e.network
	};
}
function At() {
	let e = M.stores.useDevelopStore.getState();
	e.setDynParams(Object.fromEntries(Object.values(w).map((e) => [e, void 0]))), e.commitEdit("Lens Blur reset");
}
function jt(e) {
	re(e), Q?.dispose(), Q = new Xe(kt(e), $e()), oe(Q, rt), e.registerProcessingStage(Et()), e.setStageTextureProvider(x, S, Q.provide), e.registerPanel({
		id: Dt,
		title: "Lens Blur",
		component: pt,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 280
		},
		onReset: At
	}), ue().catch(() => void 0);
	for (let e of $) e();
	let t = Q, n = () => void t.syncOpen(), r = (e, t) => e.photoId !== t.photoId || e.paramBag[w.method] !== t.paramBag[w.method] || e.paramBag[w.refine] !== t.paramBag[w.refine];
	$ = [
		e.stores.useDevelopStore.subscribe((e, t) => r(e, t) && n()),
		e.develop.onSourcePixels(n),
		e.events.onBroadcast((t) => {
			let n = t.type === "edit-update" ? t.payload.photoId : null;
			n && n !== e.stores.useDevelopStore.getState().photoId && e.dropStageTextureVariants(x, S, n);
		}),
		t.onError((e) => P().setState({ error: e })),
		t.onChange(() => P().setState({ error: null }))
	], n();
}
function Mt() {
	for (let e of $) e();
	$ = [], de("none"), fe(!1), Q?.dispose(), Q = null, se(), ae();
}
//#endregion
export { Dt as PANEL_ID, jt as activate, Mt as deactivate, kt as hostFor };

//# sourceMappingURL=index.js.map