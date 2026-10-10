// Minimal AudioContext stub that records scheduling calls, so the real engine code can be
// exercised in Node. Not a reimplementation of the engine — only of the browser API.
export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.events.push({ type: "set", v, t });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v, t) {
    this.events.push({ type: "ramp", v, t });
    return this;
  }
  setTargetAtTime(v, t, tc) {
    this.events.push({ type: "target", v, t, tc });
    return this;
  }
  cancelScheduledValues(t) {
    this.events.push({ type: "cancel", t });
    return this;
  }
}

export class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.connections = [];
    this.stops = [];
    this.started = false;
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.delayTime = new FakeParam(0);
    this.Q = new FakeParam(1);
  }
  connect(n) {
    this.connections.push(n);
    return n;
  }
  disconnect(n) {
    this.connections = n ? this.connections.filter((c) => c !== n) : [];
  }
  start() {
    this.started = true;
  }
  stop(t) {
    this.stops.push(t);
  }
}

export class FakeAudioContext {
  static instances = [];
  constructor(opts) {
    this.opts = opts;
    this.currentTime = 1;
    this.state = "suspended";
    this.sampleRate = 8000;
    this.destination = new FakeNode(this, "destination");
    this.created = {};
    this.resumeCalls = 0;
    FakeAudioContext.instances.push(this);
  }
  resume() {
    this.resumeCalls++;
    this.state = "running";
    return Promise.resolve();
  }
  _make(kind) {
    this.created[kind] = (this.created[kind] || 0) + 1;
    return new FakeNode(this, kind);
  }
  createGain() { return this._make("gain"); }
  createOscillator() { return this._make("oscillator"); }
  createBiquadFilter() { return this._make("biquad"); }
  createDynamicsCompressor() { return this._make("compressor"); }
  createWaveShaper() { return this._make("shaper"); }
  createDelay() { return this._make("delay"); }
  createConvolver() { return this._make("convolver"); }
  createBuffer(ch, len) {
    return { getChannelData: () => new Float32Array(len) };
  }
}
